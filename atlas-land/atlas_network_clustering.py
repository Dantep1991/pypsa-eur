"""Read-only, asynchronous native-network grouping with real progress state."""
from concurrent.futures import ThreadPoolExecutor
from collections import OrderedDict
import hashlib
import json
import math
import threading
import uuid

from flask import Blueprint, jsonify, request
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

from atlas_cluster_boundaries import LEVELS, load_country_boundaries
from atlas_region_groups import attach_geography, group_occupied_regions

NETWORK_CLUSTER_BLUEPRINT = Blueprint('atlas_network_clusters', __name__)
_POOL = ThreadPoolExecutor(max_workers=2)
_LOCK = threading.RLock()
_JOBS = OrderedDict()
_RESULTS = OrderedDict()
MAX_CLUSTERS = 2048
MAX_NODES = 50000


def validate(payload):
    if not isinstance(payload, dict) or payload.get('level') not in {x['id'] for x in LEVELS}:
        raise ValueError('Choose a supported boundary level.')
    nodes = payload.get('nodes')
    if not isinstance(nodes, list) or not 1 <= len(nodes) <= MAX_NODES:
        raise ValueError(f'Select between 1 and {MAX_NODES} native network buses.')
    seen = set()
    for node in nodes:
        if not isinstance(node, dict) or not isinstance(node.get('key'), str) or not 1 <= len(node['key']) <= 1024:
            raise ValueError('Every bus needs its country-scoped source identity.')
        if node['key'] in seen:
            raise ValueError('Duplicate source bus identity.')
        seen.add(node['key'])
        country = node.get('country', '')
        if not isinstance(country, str) or len(country) != 2 or not country.isascii() or not country.isalpha():
            raise ValueError('Every bus needs a two-letter country identity.')
        for field, limit in (('longitude', 180), ('latitude', 90)):
            value = node.get(field)
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or abs(value) > limit:
                raise ValueError('Every bus needs valid coordinates.')
    if payload['level'] in {'spatial', 'regions', 'growth'}:
        count = payload.get('clusters')
        maximum = MAX_CLUSTERS if payload['level'] == 'growth' else min(MAX_CLUSTERS, len(nodes))
        if isinstance(count, bool) or not isinstance(count, int) or not 1 <= count <= maximum:
            raise ValueError(f'Cluster count must be between 1 and {maximum}.')
    if payload['level'] in {'regions', 'growth'} and payload.get('regionLevel', 'nuts3') not in {'nuts2', 'nuts3'}:
        raise ValueError('Choose NUTS 2 or NUTS 3 as the source geography.')
    if payload['level'] == 'growth':
        from atlas_evidence_growth import validate_growth
        from atlas_grid_constraints import validate_grid
        from atlas_clustering import INDICATORS
        validate_growth(payload, INDICATORS)
        validate_grid(payload)
    if payload['level'] == 'evidence':
        features = payload.get('boundaryFeatures')
        if not isinstance(features, list) or not 1 <= len(features) <= 5000:
            raise ValueError('Build and show Eurostat clusters before converting them to a manual grouping.')
        for feature in features:
            props = feature.get('properties', {})
            cluster = props.get('cluster')
            if isinstance(cluster, bool) or not isinstance(cluster, int) or not 1 <= cluster <= MAX_CLUSTERS:
                raise ValueError('Every evidence region needs a valid cluster number.')
            if feature.get('geometry', {}).get('type') not in {'Polygon', 'MultiPolygon'} or not props.get('NUTS_ID'):
                raise ValueError('Every evidence region needs its NUTS identity and polygon.')
    return payload


def _spatial(nodes, count):
    """Bounded vectorised k-means in a local metric projection, not degrees."""
    import numpy as np
    latitude = np.mean([n['latitude'] for n in nodes])
    points = np.array([[n['longitude'] * math.cos(math.radians(latitude)), n['latitude']] for n in nodes])
    unique = np.unique(points, axis=0)
    if len(unique) < count:
        raise ValueError('Fewer distinct bus locations than requested clusters.')
    centres = [unique[0]]
    distance = np.full(len(unique), np.inf)
    for _ in range(1, count):
        distance = np.minimum(distance, ((unique - centres[-1]) ** 2).sum(axis=1))
        centres.append(unique[np.argmax(distance)])
    centres = np.array(centres)
    previous = None
    for _ in range(60):
        labels = np.concatenate([((chunk[:, None, :] - centres) ** 2).sum(axis=2).argmin(axis=1)
                                 for chunk in np.array_split(points, max(1, math.ceil(len(points) / 256)))])
        if previous is not None and np.array_equal(labels, previous):
            break
        previous = labels.copy()
        for index in range(count):
            members = points[labels == index]
            if len(members):
                centres[index] = members.mean(axis=0)
    return [int(label) for label in labels]


def build_groups(payload, progress=lambda **state: None):
    payload = validate(payload)
    nodes = sorted(payload['nodes'], key=lambda n: n['key'])
    countries = sorted({n['country'] for n in nodes})
    grouped, unmatched, sources, warnings = {}, [], [], []
    level = payload['level']
    if level == 'growth':
        from atlas_evidence_growth import build_evidence_groups
        from atlas_clustering import _load_indicator
        return build_evidence_groups(payload, load_country_boundaries, _load_indicator, progress)
    if level == 'regions':
        return group_occupied_regions(payload, load_country_boundaries, _spatial, progress)
    boundaries = {}
    # Spatial groups never cross borders unless the user later merges groups manually.
    requested = payload.get('clusters', 1)
    if level == 'spatial' and requested < len(countries):
        raise ValueError('Choose at least one cluster per country, or cluster one country at a time.')
    allocations = {country: 1 for country in countries}
    for _ in range(requested - len(countries)) if level == 'spatial' else []:
        eligible = [c for c in countries if allocations[c] < len({(n['longitude'], n['latitude']) for n in nodes if n['country'] == c})]
        if not eligible:
            raise ValueError('Fewer distinct locations than requested clusters.')
        chosen = max(eligible, key=lambda c: (sum(n['country'] == c for n in nodes) / allocations[c], c))
        allocations[chosen] += 1
    for completed, country in enumerate(countries):
        selected = [n for n in nodes if n['country'] == country]
        progress(phase='Assigning buses', country=country, completed=completed, total=len(countries))
        if level == 'country':
            labels = [(country, country)] * len(selected)
        elif level == 'spatial':
            labels = [(f'{country}-C{x+1}', f'{country} cluster {x+1}') for x in _spatial(selected, allocations[country])]
        else:
            progress(phase='Loading boundaries', country=country, completed=completed, total=len(countries))
            try:
                if level == 'evidence':
                    alias = {'GR': 'EL', 'GB': 'UK'}.get(country, country)
                    features = [dict(f, properties={
                        'id': f'cluster-{f["properties"]["cluster"]}',
                        'region_id': f['properties']['NUTS_ID'],
                        'name': f'Region {f["properties"]["cluster"]}'})
                        for f in payload['boundaryFeatures']
                        if str(f['properties']['NUTS_ID']).startswith(alias)]
                    source = {'provider': 'Eurostat + GISCO', 'level': level,
                              'evidence': payload.get('evidenceMeta', {}),
                              'url': 'https://ec.europa.eu/eurostat/web/gisco/geodata/statistical-units/territorial-units-statistics'}
                    evidence_level = payload.get('evidenceMeta', {}).get('level')
                    if evidence_level in (2, 3):
                        # Display polygons are simplified. Assign physical buses
                        # against full source geometry using exact NUTS identities.
                        assigned_features = {f['properties']['region_id']: f for f in features}
                        full_features, geometry_source = load_country_boundaries(country, f'nuts{evidence_level}')
                        features = [dict(f, properties=assigned_features[f['properties']['id']]['properties'])
                                    for f in full_features if f['properties']['id'] in assigned_features]
                        source['geometrySource'] = geometry_source
                    if not features:
                        raise ValueError(f'No current evidence regions cover {country}.')
                else:
                    features, source = load_country_boundaries(country, level)
                sources.append(dict(source, country=country))
            except (ValueError, OSError) as error:
                if level in {'nuts2', 'nuts3'}:
                    raise ValueError(f'Cannot show complete {level.upper()} geography for {country}: {error}') from error
                warnings.append(str(error))
                unmatched.extend(n['key'] for n in selected)
                continue
            if level in {'nuts2', 'nuts3'}:
                # Official geography must not depend on whether a grid bus
                # falls inside a source unit. Empty units have a footprint,
                # never a synthetic electrical node.
                for feature in features:
                    props = feature['properties']
                    identity = f'{country}-{props["id"]}'
                    grouped.setdefault(identity, {'id': identity, 'name': props['name'],
                        'countryCodes': [country], 'members': [], 'latitude': 0., 'longitude': 0.})
                    boundaries.setdefault(identity, []).append(dict(feature, properties={'id': props['id']}))
            polygons = [shape(f['geometry']) for f in features]
            index = STRtree(polygons)
            labels = []
            for node in selected:
                point = Point(node['longitude'], node['latitude'])
                hits = [int(i) for i in index.query(point, predicate='covered_by')]
                # A border can have two exact hits. Stable ID order assigns it once.
                if not hits:
                    labels.append(None)
                    unmatched.append(node['key'])
                    continue
                chosen = min(hits, key=lambda i: features[i]['properties']['id'])
                props = features[chosen]['properties']
                identity = props['id'] if level == 'evidence' else f'{country}-{props["id"]}'
                labels.append((identity, props['name']))
                if identity not in boundaries:
                    boundaries[identity] = [dict(f, properties={'id': f['properties'].get('region_id', f['properties']['id'])})
                        for f in features if f['properties']['id'] == props['id']]
                elif level == 'evidence':
                    known = {f['properties']['id'] for f in boundaries[identity]}
                    boundaries[identity].extend(dict(f, properties={'id': f['properties']['region_id']})
                        for f in features if f['properties']['id'] == props['id'] and f['properties']['region_id'] not in known)
        for node, label in zip(selected, labels):
            if label is None:
                continue
            group = grouped.setdefault(label[0], {'id': label[0], 'name': label[1], 'countryCodes': [country], 'members': [], 'latitude': 0., 'longitude': 0.})
            if country not in group['countryCodes']:
                group['countryCodes'].append(country)
            group['members'].append(node['key'])
            group['latitude'] += node['latitude']
            group['longitude'] += node['longitude']
        progress(phase='Assigned buses', country=country, completed=completed + 1, total=len(countries))
    for group in grouped.values():
        if group['members']:
            for coordinate in ('latitude', 'longitude'):
                group[coordinate] /= len(group['members'])
    attach_geography(list(grouped.values()), boundaries)
    if level in {'nuts2', 'nuts3'}:
        for group in grouped.values():
            group['territoryOnly'] = group['geographyOnly'] = not bool(group['members'])
    if unmatched:
        warnings.append(f'{len(unmatched)} buses lack boundary coverage and remain at native resolution.')
    if level == 'evidence':
        requested_ids = {f"cluster-{f['properties']['cluster']}" for f in payload['boundaryFeatures']}
        empty = requested_ids - set(grouped)
        if empty:
            warnings.append(f'{len(empty)} indicator groups contain no loaded model buses; they are not invented as network nodes.')
    return {'schema': 'nohm.atlas.manual-clusters.v1', 'groups': list(grouped.values()),
            'level': level, 'sources': sources, 'warnings': warnings, 'unmatched': unmatched,
            'sourceCount': len(nodes), 'assignedCount': len(nodes) - len(unmatched),
            'sourceNetworks': payload.get('sourceNetworks', []),
            **({'sourceRegionCount':len(grouped),
                'networkGroupCount':sum(bool(g['members']) for g in grouped.values()),
                'geographyOnlyGroupCount':sum(g['geographyOnly'] for g in grouped.values()),
                'territoryPolicy':'Every official source region, including units without grid assets; no synthetic nodes or branches.'}
               if level in {'nuts2','nuts3'} else {})}


def _run(job_id, payload, cache_key):
    def progress(**state):
        with _LOCK:
            _JOBS[job_id].update(state)
    try:
        result = build_groups(payload, progress)
        with _LOCK:
            _RESULTS[cache_key] = result
            while len(_RESULTS) > 16:
                _RESULTS.popitem(last=False)
            _JOBS[job_id].update(state='complete', phase='Complete', result=result)
    except Exception as error:
        with _LOCK:
            _JOBS[job_id].update(state='failed', phase='Failed', error=str(error))


@NETWORK_CLUSTER_BLUEPRINT.get('/api/atlas/network-clusters/options')
def options():
    return jsonify(levels=LEVELS, maxClusters=MAX_CLUSTERS, maxNodes=MAX_NODES)


@NETWORK_CLUSTER_BLUEPRINT.post('/api/atlas/network-clusters/jobs')
def create_job():
    if request.content_length and request.content_length > 12 * 1024 * 1024:
        return jsonify(error='Network request exceeds 12 MB.'), 413
    try:
        payload = validate(request.get_json(silent=True))
    except ValueError as error:
        return jsonify(error=str(error)), 400
    key = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    with _LOCK:
        active = sum(job['state'] == 'running' for job in _JOBS.values())
        if active >= 2:
            return jsonify(error='Two clustering jobs are already running; retry when one finishes.'), 429
        job_id = uuid.uuid4().hex
        _JOBS[job_id] = {'id': job_id, 'state': 'running', 'phase': 'Queued', 'completed': 0, 'total': len({n['country'] for n in payload['nodes']})}
        if key in _RESULTS:
            _JOBS[job_id].update(state='complete', phase='Cached', result=_RESULTS[key])
        else:
            _POOL.submit(_run, job_id, payload, key)
        for old in list(_JOBS):
            if len(_JOBS) <= 32:
                break
            if _JOBS[old]['state'] != 'running':
                _JOBS.pop(old)
        return jsonify(_JOBS[job_id]), 202


@NETWORK_CLUSTER_BLUEPRINT.get('/api/atlas/network-clusters/jobs/<job_id>')
def get_job(job_id):
    with _LOCK:
        job = _JOBS.get(job_id)
        return (jsonify(job), 200) if job else (jsonify(error='Clustering job not found.'), 404)
