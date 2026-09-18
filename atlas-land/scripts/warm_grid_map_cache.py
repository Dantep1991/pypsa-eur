#!/usr/bin/env python3
"""Warm and verify exact network/component responses through the real Atlas API.

Run after producing/refreshing country networks and before serving a demo.
Only existing catalogued geographic/full-nodal files are parsed. This does not
build, solve, simplify or replace source networks. Run serially because NetCDF
loading is serialized by the API; independent cached requests remain concurrent.
"""

import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path
import statistics
import sys
import time
from urllib.request import Request, urlopen


LEVELS = ('bidding_zone', 'ehighway', 'nuts1', 'nuts2', 'nuts3', 'full')
SCOPES = ('grid', 'supply', 'storage', 'demand', 'full', 'lines_only')


def request(base_url, path, body=None, timeout=240, metrics=None):
    encoded = None if body is None else json.dumps(body).encode('utf-8')
    headers = {'Accept': 'application/json', 'Accept-Encoding': 'gzip'}
    if encoded is not None:
        headers['Content-Type'] = 'application/json'
    start = time.perf_counter()
    with urlopen(Request(base_url.rstrip('/') + path, data=encoded, headers=headers), timeout=timeout) as response:
        raw = response.read()
        cache = response.headers.get('X-Atlas-Map-Cache', 'unavailable')
        encoding = response.headers.get('Content-Encoding', 'identity')
        if metrics is not None:
            metrics.update(wire_bytes=len(raw), content_encoding=encoding)
        if encoding == 'gzip':
            raw = gzip.decompress(raw)
    return raw, cache, round(time.perf_counter() - start, 4)


def select_requests(catalog, countries=None, levels=LEVELS):
    selected = {}
    for entry in catalog.get('files', []):
        country = entry.get('geographic_country') or entry.get('full_country')
        level = entry.get('geographic_level') or ('full' if entry.get('is_full_nodal_network') else '')
        if not country or level not in levels or (countries and country not in countries):
            continue
        if level != 'full' and not entry.get('validation_passed'):
            continue
        selected[(country, level)] = {
            'filename': entry['filename'],
            'granularity_prefix': catalog.get('granularity_prefix', 'pypsa'),
            'geographic_country': entry.get('geographic_country', ''),
            'geographic_level': entry.get('geographic_level', ''),
            'full_country': entry.get('full_country', ''),
            'component_scope': 'grid',
        }
    return [(country, level, selected[(country, level)]) for country, level in sorted(
        selected, key=lambda item: (item[0], LEVELS.index(item[1]))) ]


def expand_scopes(entries, scopes=('grid',), demand_options=None):
    return [(country, level, {
        **body, 'component_scope': scope,
        **(demand_options or {} if scope in {'demand', 'full'} else {}),
    }) for country, level, body in entries for scope in dict.fromkeys(scopes)]


def validate_payload(payload, scope):
    if (not isinstance(payload, dict) or payload.get('component_scope') != scope
            or not isinstance(payload.get('markers'), (list, dict))
            or not isinstance(payload.get('connections'), list) or payload.get('error')):
        raise ValueError('Expected a valid ' + scope + ' map response')
    if scope in {'grid', 'lines_only'} and not payload['markers']:
        raise ValueError('Expected nonempty grid map response')
    for name in ('source_inventory', 'demand_inventory'):
        if isinstance(payload.get(name), dict) and payload[name].get('error'):
            raise ValueError('Incomplete response: ' + name + ' failed')
    if scope in {'demand', 'full'} and payload.get('demand_inventory', {}).get('loaded'):
        validate_demand_totals(payload)


def validate_demand_totals(payload):
    """Audit the served bus and subsector values, not just manifest claims."""
    def number(value):
        parsed = float(value)
        if not math.isfinite(parsed) or parsed < 0:
            raise ValueError('Invalid demand value')
        return parsed

    def conserved(actual, expected):
        if not math.isclose(actual, number(expected), rel_tol=1e-8, abs_tol=1e-8):
            raise ValueError('Served demand totals are not conserved')

    inventory = payload['demand_inventory']
    countries = inventory.get('countries', {})
    all_markers = payload['markers'].values() if isinstance(payload['markers'], dict) else payload['markers']
    markers = [marker for marker in all_markers if marker.get('provisional_demand')]
    if not countries or not markers or len(markers) != inventory.get('map_components'):
        raise ValueError('Demand inventory disagrees with served markers')
    if len({marker['id'] for marker in markers}) != len(markers):
        raise ValueError('Duplicate served demand markers')
    totals = {}
    for marker in markers:
        country = marker.get('country')
        if country not in countries:
            raise ValueError('Unexpected demand country')
        row = totals.setdefault(country, {'annual': 0., 'mw': 0., 'count': 0})
        annual, mw = number(marker['annual_energy_gwh']), number(marker['p_set'])
        row['annual'] += annual
        row['mw'] += mw
        row['count'] += 1
        conserved(mw, annual * 1000 / 8760)
        sectors = marker.get('demand_breakdown', [])
        template_key = marker.get('demand_template_key')
        if template_key:
            if not template_key.startswith(country + ':'):
                raise ValueError('Demand template belongs to a different country')
            sectors = payload.get('demand_templates', {}).get(template_key, [])
            # Templates are shared ratios, deliberately not expanded per bus
            # over the wire. Validate them even when this bus's annual total is 0.
            conserved(sum(number(sector['share']) for sector in sectors), 1)
            for sector in sectors:
                conserved(sum(number(sub['share_of_total']) for sub in sector.get('subsectors', [])), sector['share'])
        def scaled(node, field, total, share):
            return number(node[field]) if field in node else total * number(node[share])
        if countries[country].get('composition_loaded'):
            if not sectors:
                raise ValueError('Published ETM composition is missing from a demand bus')
            conserved(sum(scaled(sector, 'annual_energy_gwh', annual, 'share') for sector in sectors), annual)
            conserved(sum(scaled(sector, 'p_set_mw', mw, 'share') for sector in sectors), mw)
            for sector in sectors:
                for field, total in [('annual_energy_gwh', annual), ('p_set_mw', mw)]:
                    conserved(sum(scaled(subsector, field, total, 'share_of_total') for subsector in sector.get('subsectors', [])), scaled(sector, field, total, 'share'))
        elif sectors:
            raise ValueError('Unknown ETM country has substituted sector shares')
    if set(totals) != set(countries):
        raise ValueError('Demand country missing from served map')
    for country, actual in totals.items():
        expected = countries[country]
        conserved(actual['annual'], expected['annual_demand_gwh'])
        conserved(actual['mw'], expected['flat_total_mw'])
        if actual['count'] != expected['weighted_buses']:
            raise ValueError('Weighted demand bus count differs from served map')


def inventory_summary(payload):
    # A legitimate empty response can be cached, but it is not data readiness.
    return {name: {key: value for key, value in payload[name].items()
                   if key in {'loaded', 'reason', 'scenario', 'year', 'provisional', 'proxy', 'profile', 'countries', 'annual_demand_gwh_per_country'}}
            for name in ('source_inventory', 'demand_inventory') if isinstance(payload.get(name), dict)}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='http://127.0.0.1:5001')
    parser.add_argument('--compare-url', help='Optional independently running uncached API; compare every response byte-for-byte.')
    parser.add_argument('--require-initial-hit', action='store_true', help='Verify persisted entries after restarting the API; fail if any network needs parsing.')
    parser.add_argument('--countries', help='Comma-separated ISO2 country codes; omitted means every catalogued country.')
    parser.add_argument('--levels', default=','.join(LEVELS), help='Comma-separated resolution keys.')
    parser.add_argument('--scopes', default='grid', help='Comma-separated component scopes: ' + ','.join(SCOPES))
    parser.add_argument('--demand-scenario', help='Demand scenario; omitted uses the API default.')
    parser.add_argument('--demand-year', type=int, help='Demand year; use the same year as the UI/study.')
    parser.add_argument('--annual-demand-gwh', type=float, help='Provisional annual demand per country; omitted uses the API default.')
    parser.add_argument('--report', type=Path, help='Write timings, counts and hashes (not network payloads) to this JSON file.')
    args = parser.parse_args(argv)
    countries = {value.strip().upper() for value in args.countries.split(',')} if args.countries else None
    levels = [value.strip().lower() for value in args.levels.split(',')]
    scopes = [value.strip().lower() for value in args.scopes.split(',')]
    if set(scopes) - set(SCOPES):
        parser.error('Unknown scope; choose from ' + ', '.join(SCOPES))
    demand_options = {key: value for key, value in {
        'demand_scenario': args.demand_scenario, 'demand_year': args.demand_year,
        'annual_demand_gwh_per_country': args.annual_demand_gwh,
    }.items() if value is not None}
    if set(levels) - set(LEVELS):
        parser.error('Unknown level; choose from ' + ', '.join(LEVELS))
    catalog = json.loads(request(args.base_url, '/api/pypsa/list-files')[0])
    entries = select_requests(catalog, countries, levels)
    if not entries:
        parser.error('No matching validated geographic/full-nodal networks in the API catalogue.')
    if countries and countries - {country for country, _, _ in entries}:
        parser.error('Requested countries missing from catalogue: ' + ', '.join(sorted(countries - {c for c, _, _ in entries})))
    entries = expand_scopes(entries, scopes, demand_options)
    print(json.dumps({'event': 'start', 'entries': len(entries), 'countries': len({c for c, _, _ in entries}), 'scopes': scopes}), flush=True)
    results = []
    started = time.perf_counter()
    failed = False
    for index, (country, level, body) in enumerate(entries, 1):
        scope = body['component_scope']
        print(json.dumps({'event': 'loading', 'index': index, 'country': country, 'level': level, 'scope': scope}), flush=True)
        try:
            metrics = {}
            raw, cache, seconds = request(args.base_url, '/api/pypsa/parse-nc', body, metrics=metrics)
            if args.require_initial_hit and cache != 'hit':
                raise ValueError('Expected persisted hit without parsing after restart')
            payload = json.loads(raw)
            validate_payload(payload, scope)
            hit, hit_cache, hit_seconds = request(args.base_url, '/api/pypsa/parse-nc', body)
            if hit_cache != 'hit' or hit != raw:
                raise ValueError('Repeated response was not an exact persistent cache hit')
            item = {'country': country, 'level': level, 'scope': scope, 'filename': body['filename'],
                    'nodes': payload['total'], 'connections': payload['total_connections'],
                    'inventories': inventory_summary(payload), 'demand_options': demand_options if scope in {'demand', 'full'} else {},
                    'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
                    'initial_cache': cache, 'initial_seconds': seconds, 'hit_seconds': hit_seconds, **metrics}
            if args.compare_url:
                baseline, _, baseline_seconds = request(args.compare_url, '/api/pypsa/parse-nc', body)
                if baseline != raw:
                    raise ValueError('Response differs from independent baseline API')
                item.update(baseline_equal=True, baseline_seconds=baseline_seconds)
            results.append(item)
            print(json.dumps({'event': 'verified', 'index': index, **item}), flush=True)
        except Exception as error:
            failed = True
            # Keep errors concise; do not dump response bodies or credentials.
            item = {'country': country, 'level': level, 'scope': scope, 'error': type(error).__name__ + ': ' + str(error)}
            results.append(item)
            print(json.dumps({'event': 'failed', **item}), flush=True)
    successful = [item for item in results if 'hit_seconds' in item]
    report = {'entries': len(entries), 'verified': len(successful), 'failed': len(entries) - len(successful),
              'elapsed_seconds': round(time.perf_counter() - started, 3),
              'median_hit_seconds': statistics.median([item['hit_seconds'] for item in successful]) if successful else None,
              'max_hit_seconds': max([item['hit_seconds'] for item in successful], default=None), 'results': results}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({'event': 'complete', **{key: value for key, value in report.items() if key != 'results'}}), flush=True)
    return int(failed)


if __name__ == '__main__':
    sys.exit(main())
