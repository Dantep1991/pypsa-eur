"""Asset-backed geographic groups covering all selected administrative territory."""
from collections import defaultdict
import heapq
import math

from shapely.geometry import Point, mapping, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree


def attach_geography(groups, boundaries):
    """Dissolve exact source polygons without independently simplifying shared borders."""
    for group in groups:
        entries = boundaries.get(group['id'], [])
        if not entries:
            continue
        geometry = unary_union([shape(feature['geometry']) for feature in entries])
        if not geometry.is_valid:
            geometry = geometry.buffer(0)
        group['geometry'] = mapping(geometry)
        group['regionIds'] = sorted({str(f['properties']['id']) for f in entries})
        group['regionCount'] = len(group['regionIds'])
        centre = geometry.representative_point()
        group['longitude'], group['latitude'] = centre.x, centre.y


def complete_territory(regions, labels):
    """Extend occupied seeds through neighbouring empty units; never invent assets.

    Multi-source shortest paths keep empty areas attached to an existing group.
    Disconnected islands use the nearest occupied unit of the same country.
    Administrative assignment does not imply electrical adjacency or capacity.
    """
    polygons = [shape(r['feature']['geometry']) for r in regions]
    points = [p.representative_point() for p in polygons]
    index = STRtree(polygons)
    assigned, best, queue = {}, {}, []
    seeds = defaultdict(list)
    for i, label in labels.items():
        seeds[regions[i]['country']].append(i)
        best[i] = (0., i)
        heapq.heappush(queue, (0., i, i, label))
    def distance(a, b):
        cosine = math.cos(math.radians((points[a].y + points[b].y) / 2))
        return math.hypot((points[a].x - points[b].x) * cosine, points[a].y - points[b].y)
    while queue:
        cost, seed, current, label = heapq.heappop(queue)
        if best.get(current) != (cost, seed):
            continue
        assigned[current] = label
        for neighbour in index.query(polygons[current], predicate='intersects'):
            neighbour = int(neighbour)
            if neighbour in labels or regions[neighbour]['country'] != regions[current]['country']:
                continue
            if polygons[current].boundary.intersection(polygons[neighbour].boundary).length == 0:
                continue
            candidate = (cost + distance(current, neighbour), seed)
            if candidate < best.get(neighbour, (math.inf, math.inf)):
                best[neighbour] = candidate
                heapq.heappush(queue, (*candidate, neighbour, label))
    disconnected = 0
    for i, region in enumerate(regions):
        if i in assigned:
            continue
        candidates = seeds[region['country']]
        if not candidates:
            raise ValueError(f"No on-land source buses cover {region['country']}; cannot form asset-backed regional groups.")
        nearest = min(candidates, key=lambda j: (polygons[i].distance(polygons[j]), distance(i, j), j))
        assigned[i] = labels[nearest]
        disconnected += 1
    return assigned, disconnected


def group_occupied_regions(payload, loader, cluster, progress):
    """Seed from occupied NUTS units and partition the country's complete territory."""
    nodes = sorted(payload['nodes'], key=lambda n: n['key'])
    countries = sorted({n['country'] for n in nodes})
    level = payload.get('regionLevel', 'nuts3')
    regions, sources, unmatched, warnings = {}, [], [], []
    for completed, country in enumerate(countries):
        progress(phase='Loading source regions', country=country, completed=completed, total=len(countries))
        selected = [n for n in nodes if n['country'] == country]
        try:
            features, source = loader(country, level)
        except (ValueError, OSError) as error:
            raise ValueError(f'Cannot cover all of {country} with {level.upper()} boundaries: {error}') from error
        sources.append(dict(source, country=country))
        for feature in features:
            identity = f"{country}:{feature['properties']['id']}"
            regions[identity] = {'feature': feature, 'country': country, 'nodes': []}
        index = STRtree([shape(f['geometry']) for f in features])
        for node in selected:
            hits = list(index.query(Point(node['longitude'], node['latitude']), predicate='covered_by'))
            if not hits:
                unmatched.append(node['key'])
                continue
            feature = features[min(hits, key=lambda i: features[i]['properties']['id'])]
            identity = f"{country}:{feature['properties']['id']}"
            regions[identity]['nodes'].append(node)
        progress(phase='Assigned source regions', country=country, completed=completed + 1, total=len(countries))
    count = payload['clusters']
    ordered = sorted(regions.values(), key=lambda r: (r['country'], r['feature']['properties']['id']))
    occupied = {i: r for i, r in enumerate(ordered) if r['nodes']}
    if len(occupied) < count:
        raise ValueError(f'Only {len(occupied)} occupied {level.upper()} regions are covered; choose at most that many clusters.')
    locations = [{'longitude': sum(n['longitude'] for n in r['nodes']) / len(r['nodes']),
                  'latitude': sum(n['latitude'] for n in r['nodes']) / len(r['nodes'])} for r in occupied.values()]
    progress(phase='Grouping source regions', completed=len(countries), total=len(countries))
    seeds = dict(zip(occupied, cluster(locations, count)))
    labels, disconnected = complete_territory(ordered, seeds)
    groups, boundaries = {}, defaultdict(list)
    for i, region in enumerate(ordered):
        label = labels[i]
        identity = f'region-{label + 1}'
        group = groups.setdefault(identity, {'id': identity, 'name': f'Region {label + 1}',
            'members': [], 'countryCodes': [], 'latitude': 0., 'longitude': 0.})
        group['members'].extend(n['key'] for n in region['nodes'])
        if region['country'] not in group['countryCodes']:
            group['countryCodes'].append(region['country'])
        boundaries[identity].append(region['feature'])
    if len(groups) != count:
        raise ValueError('The source geography cannot form the requested number of non-empty groups.')
    attach_geography(list(groups.values()), boundaries)
    if unmatched:
        warnings.append(f'{len(unmatched)} buses are outside the source land boundaries and remain native; land coverage is not reduced.')
    return {'schema': 'nohm.atlas.manual-clusters.v1', 'groups': list(groups.values()),
        'level': 'regions', 'regionLevel': level, 'requestedClusters': count,
        'regionCount': len(regions), 'sources': sources, 'warnings': warnings,
        'unmatched': unmatched, 'sourceCount': len(nodes), 'assignedCount': len(nodes) - len(unmatched),
        'occupiedRegionCount': len(occupied), 'landOnlyRegionCount': len(ordered) - len(occupied),
        'disconnectedLandRegionCount': disconnected,
        'territoryPolicy': 'All source regions; adjacency expansion from asset-backed seeds, nearest same-country seed for disconnected land.',
        'sourceNetworks': payload.get('sourceNetworks', []), 'method': 'full-territory grouping with occupied region seeds'}
