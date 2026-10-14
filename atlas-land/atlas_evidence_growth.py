"""Eurostat-seeded competitive territorial growth, not a similarity typology.

This is an auditable geographic heuristic, not an electrical equivalent or an
optimal districting solver. Every source unit belongs to exactly one seed.
Unknown observations stay unknown and never become invented measurements.
"""
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
import heapq
import math
import statistics
import time

from shapely.geometry import Point, shape
from shapely.strtree import STRtree

from atlas_region_groups import attach_geography


def validate_growth(payload, definitions):
    evidence = payload.get('evidence', {})
    if not isinstance(evidence, dict):
        raise ValueError('Choose Eurostat evidence settings.')
    indicators = evidence.get('indicators', ['density'])
    level = int(payload.get('regionLevel', 'nuts3')[-1])
    if not isinstance(indicators, list) or not indicators or any(not isinstance(k, str) for k in indicators) or len(set(indicators)) != len(indicators):
        raise ValueError('Choose distinct Eurostat indicators.')
    if any(not isinstance(k, str) or k not in definitions or level not in definitions[k]['levels'] for k in indicators):
        raise ValueError('Choose indicators available at the selected NUTS level.')
    year = evidence.get('year', 2023)
    if isinstance(year, bool) or not isinstance(year, int) or not 2000 <= year <= time.gmtime().tm_year+1:
        raise ValueError('Choose a supported reference year.')
    if evidence.get('scaling', 'zscore') not in {'zscore', 'robust'}:
        raise ValueError('Choose zscore or robust scaling.')
    weights = evidence.get('weights', {})
    if not isinstance(weights, dict) or any(k not in indicators for k in weights):
        raise ValueError('Weights must refer to selected indicators.')
    for key in indicators:
        value = weights.get(key, 1.)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not .25 <= value <= 4:
            raise ValueError('Indicator weights must be between 0.25 and 4.')
    influence = evidence.get('evidenceInfluence', 1.)
    if isinstance(influence, bool) or not isinstance(influence, (int, float)) or not math.isfinite(influence) or not 0 <= influence <= 4:
        raise ValueError('Evidence influence must be between 0 and 4.')


def _quantile(values, fraction):
    ordered = sorted(values)
    position = (len(ordered)-1)*fraction
    lo = int(position)
    return ordered[lo] + (ordered[min(lo+1, len(ordered)-1)]-ordered[lo])*(position-lo)


def _distance(left, right):
    """Local geographic distance in km; no inferred grid connectivity."""
    cosine = math.cos(math.radians((left.y+right.y)/2))
    return 111.195*math.hypot((left.x-right.x)*cosine, left.y-right.y)


def grow_regions(regions, indicators, weights, count, scaling='zscore', influence=1., topology=None, network_info=None, progress=lambda **state:None):
    """Seed from the highest complete weighted profiles, then compete on front cost."""
    regions = sorted(regions, key=lambda r: r['feature']['properties']['id'])
    polygons = [shape(r['feature']['geometry']) for r in regions]
    centres = [p.representative_point() for p in polygons]
    normalised = [dict() for _ in regions]
    for key in indicators:
        values = [r['values'][key] for r in regions if key in r['values']]
        if not values:
            raise ValueError(f'No mapped observations for {key}; choose another indicator or year.')
        centre = _quantile(values, .5) if scaling == 'robust' else statistics.fmean(values)
        spread = (_quantile(values, .75)-_quantile(values, .25)) if scaling == 'robust' else math.sqrt(statistics.fmean((v-centre)**2 for v in values))
        for i, region in enumerate(regions):
            if key in region['values']:
                normalised[i][key] = (region['values'][key]-centre)/(spread or 1.)
    total_weight = sum(weights[k] for k in indicators)
    complete = [i for i, values in enumerate(normalised) if all(k in values for k in indicators)]
    if len(complete) < count:
        raise ValueError(f'Only {len(complete)} source regions have all selected seed indicators; choose at most that many clusters.')
    scores = {i: sum(weights[k]*normalised[i][k] for k in indicators)/total_weight for i in complete}
    seeds = sorted(complete, key=lambda i: (-scores[i], regions[i]['feature']['properties']['id']))[:count]
    index = STRtree(polygons)
    neighbours = []
    distances = []
    for i, polygon in enumerate(polygons):
        adjacent = sorted(int(j) for j in index.query(polygon, predicate='intersects') if int(j) != i
                          and polygon.boundary.intersection(polygons[int(j)].boundary).length > 0)
        neighbours.append(adjacent)
        distances.extend(_distance(centres[i], centres[j]) for j in adjacent if j > i)
    distance_scale = statistics.median(distances) if distances else 1.
    def contrast(a, b):
        available = [k for k in indicators if k in normalised[a] and k in normalised[b]]
        # Missingness is disclosed separately. Only reported shared observations
        # influence similarity; absent evidence uses geographic distance alone.
        if not available:
            return 0.
        return math.sqrt(sum(weights[k]*(normalised[a][k]-normalised[b][k])**2 for k in available)/sum(weights[k] for k in available))
    if topology is not None:
        from atlas_grid_constraints import network_growth
        ranking=sorted(complete,key=lambda i:(-scores[i],regions[i]['feature']['properties']['id']))
        labels,seeds,detached,info=network_growth(regions,ranking,neighbours,centres,contrast,_distance,
            distance_scale,count,influence,topology['nodes'],topology['gridConnections'])
        if network_info is not None:network_info.update(info)
        progress(phase='Verified connected source-grid regions',completed=count,total=count,unit='clusters')
        return regions,labels,seeds,scores,detached
    labels = {seed: label for label, seed in enumerate(seeds)}
    costs = {seed: 0. for seed in seeds}
    queue = []
    def offer(current, label):
        for target in neighbours[current]:
            if target in labels:
                continue
            step = _distance(centres[current], centres[target])/(distance_scale or 1.)
            step *= 1. + influence*(contrast(target, seeds[label]) + contrast(current, target))/2.
            heapq.heappush(queue, (costs[current]+step, label, target, current))
    for seed, label in labels.items():
        offer(seed, label)
    while queue:
        cost, label, target, parent = heapq.heappop(queue)
        if target in labels:
            continue
        labels[target], costs[target] = label, cost
        offer(target, label)
    # GISCO islands / detached territory cannot be reached over shared borders.
    # Attach each whole unseeded component to its best geographic/evidence seed;
    # this is an explicit territorial policy, never an invented electrical edge.
    detached = []
    remaining = set(range(len(regions)))-set(labels)
    while remaining:
        component, pending = set(), [min(remaining)]
        while pending:
            current = pending.pop()
            if current not in remaining:
                continue
            remaining.remove(current); component.add(current)
            pending.extend(neighbours[current])
        label = min(range(count), key=lambda c: (min(
            _distance(centres[i], centres[seeds[c]])/(distance_scale or 1.)*(1.+influence*contrast(i, seeds[c])) for i in component), c))
        for i in component:
            labels[i] = label
        detached.append([regions[i]['feature']['properties']['id'] for i in sorted(component)])
    return regions, labels, seeds, scores, detached


def build_evidence_groups(payload, loader, indicator_loader, progress=lambda **state: None):
    from atlas_clustering import INDICATORS, EUROSTAT_ROOT
    evidence = payload.get('evidence', {})
    indicators = evidence.get('indicators', ['density'])
    weights = {k: evidence.get('weights', {}).get(k, 1.) for k in indicators}
    countries = tuple(sorted({n['country'] for n in payload['nodes']}))
    level = payload.get('regionLevel', 'nuts3')
    progress(phase='Loading Eurostat evidence', completed=0, total=len(indicators), unit='indicators')
    observations, sources = defaultdict(dict), []
    with ThreadPoolExecutor(max_workers=min(4, len(indicators))) as pool:
        futures = {pool.submit(indicator_loader, k, evidence.get('year', 2023), int(level[-1]), countries): k for k in indicators}
        for completed, future in enumerate(as_completed(futures), 1):
            key = futures[future]
            rows, cached = future.result()
            for row in rows:
                observations[row['code']][key] = row['value']
            sources.append({'provider': 'Eurostat', 'indicator': key, 'year': evidence.get('year', 2023), 'cached': cached,
                            'dataset': INDICATORS[key]['dataset'], 'unit': INDICATORS[key]['unit'],
                            'url': f"{EUROSTAT_ROOT}/{INDICATORS[key]['dataset']}"})
            progress(phase=f'Loaded {key}', completed=completed, total=len(indicators), unit='indicators')
    regions, unmatched = [], []
    for completed, country in enumerate(countries):
        progress(phase='Loading full boundaries', country=country, completed=completed, total=len(countries), unit='countries')
        features, source = loader(country, level)
        sources.append(dict(source, country=country))
        polygons = [shape(f['geometry']) for f in features]
        index = STRtree(polygons)
        memberships = defaultdict(list)
        for node in sorted(payload['nodes'], key=lambda n: n['key']):
            if node['country'] != country:
                continue
            hits = list(index.query(Point(node['longitude'], node['latitude']), predicate='covered_by'))
            if not hits:
                unmatched.append(node['key']); continue
            chosen = min(hits, key=lambda i: features[i]['properties']['id'])
            memberships[features[chosen]['properties']['id']].append(node['key'])
        regions.extend({'feature': f, 'country': country, 'members': memberships[f['properties']['id']],
                        'values': observations.get(f['properties']['id'], {})} for f in features)
    progress(phase='Growing evidence-led regions', completed=0, total=len(regions), unit='regions')
    network_info={}
    regions, labels, seeds, scores, detached = grow_regions(regions, indicators, weights, payload['clusters'],
        evidence.get('scaling', 'zscore'), evidence.get('evidenceInfluence', 1.),
        topology={'nodes':payload['nodes'],'gridConnections':payload['gridConnections']},network_info=network_info,progress=progress)
    groups, boundaries = {}, defaultdict(list)
    for label, seed in enumerate(seeds):
        props = regions[seed]['feature']['properties']
        identity = f'growth-{label+1}'
        groups[label] = {'id': identity, 'name': f"Region {label+1} · {props.get('name', props['id'])}",
            'seedRegionId': props['id'], 'seedValues': regions[seed]['values'], 'seedScore': scores[seed],
            'members': [], 'countryCodes': [], 'latitude': 0., 'longitude': 0.}
    for i, region in enumerate(regions):
        group = groups[labels[i]]
        group['members'].extend(region['members'])
        if region['country'] not in group['countryCodes']:
            group['countryCodes'].append(region['country'])
        boundaries[group['id']].append(region['feature'])
    attach_geography(list(groups.values()), boundaries)
    for group in groups.values():
        group['territoryOnly'] = not bool(group['members'])
    from atlas_grid_constraints import audit_groups
    connectivity=audit_groups(list(groups.values()),payload['nodes'],payload['gridConnections'])
    for group,check in zip(groups.values(),connectivity['groups']):group['networkConnectivity']=check
    missing = [dict(regionId=r['feature']['properties']['id'], indicators=[k for k in indicators if k not in r['values']])
               for r in regions if any(k not in r['values'] for k in indicators)]
    warnings = []
    if missing:
        warnings.append(f'{len(missing)} regions have incomplete Eurostat evidence; included using available evidence and geographic growth. No values imputed.')
    if unmatched:
        warnings.append(f'{len(unmatched)} buses outside land boundaries remain native, separate from the {len(groups)} regional clusters.')
    if detached:
        warnings.append(f'{len(detached)} detached land components attached by distance and evidence; no grid links invented.')
    empty = sum(g['territoryOnly'] for g in groups.values())
    if empty:
        warnings.append(f'{empty} territorial clusters contain no source buses; no assets or electrical links invented.')
    if network_info['mandatoryGridClosures']:
        warnings.append(f"{len(network_info['mandatoryGridClosures'])} source-grid closures keep internally connected whole-region assets together.")
    if network_info['seedAdjustments']:
        warnings.append('Evidence seeds were expanded or skipped where needed for distinct connected grid cores. See Network checks.')
    multipart=sum(parts>1 for parts in network_info['geographicUnitComponents'].values())
    if multipart:
        warnings.append(f'{multipart} grid-connected regions have geographically separated source units. No land corridor or electrical connection invented; inspect Network checks.')
    if payload.get('unresolvedGridConnections'):
        warnings.append(f"{len(payload['unresolvedGridConnections'])} source connection endpoints are unresolved and excluded from connectivity checks.")
    progress(phase='Complete territorial coverage', completed=len(regions), total=len(regions), unit='regions')
    return {'schema': 'nohm.atlas.manual-clusters.v1', 'level': 'growth', 'regionLevel': level,
        'groups': list(groups.values()), 'regionCount': len(regions), 'requestedClusters': payload['clusters'],
        'sourceCount': len(payload['nodes']), 'assignedCount': len(payload['nodes'])-len(unmatched),
        'sourceNetworks': payload.get('sourceNetworks', []), 'sources': sorted(sources, key=lambda s: (s.get('country', ''), s.get('indicator', ''))),
        'unmatched': unmatched, 'warnings': warnings, 'missingEvidence': missing, 'detachedComponents': detached,
        'evidence': evidence, 'method': 'evidence-ranked connected grid cores + source-branch-constrained growth',
        'networkChecks':{**network_info,**connectivity},
        'boundaryPolicy': 'Ranked seeds reserve connected source-grid cores. Grid-bearing units grow only through reported branches; remaining land uses distance and evidence. Incompatible seeds move down the evidence ranking; no synthetic branches.',
        'observations': [{'regionId': r['feature']['properties']['id'], 'values': r['values'], 'cluster': labels[i]+1} for i, r in enumerate(regions)]}
