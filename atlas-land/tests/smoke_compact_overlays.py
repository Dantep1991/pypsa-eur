"""Opt-in exact-payload comparison for geographic layer-only responses.

Run: python atlas-land/tests/smoke_compact_overlays.py FR ES BE
Uses the combined Flask application in process; no listener, restart or provider.
"""
import contextlib
import gzip
import io
import json
import sys
from pathlib import Path


def main():
    countries = sys.argv[1:] or ['FR']
    if any(len(code) != 2 or not code.isalpha() or not code.isupper() for code in countries):
        raise SystemExit('Use uppercase ISO2 country codes')
    root = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(root / 'scripts'))
    results = []
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        import run_atlas_backend_stable as runner
        client = runner.application.test_client()
        catalogue = client.get('/api/pypsa/list-files').get_json()
        assert catalogue['capabilities']['parse_nc_omit_geojson_overlays'] is True
        for country in countries:
            for scope in ['grid', 'supply', 'storage', 'demand']:
                body = dict(filename=f'base_{country}_nuts3.nc', geographic_country=country,
                            geographic_level='nuts3', component_scope=scope,
                            demand_scenario='NT', demand_year=2030)
                regular = client.post('/api/pypsa/parse-nc', json=body)
                compact = client.post('/api/pypsa/parse-nc', json={**body, 'include_geojson_overlays': False})
                assert regular.status_code == compact.status_code == 200, (country, scope)
                expected, actual = regular.get_json(), compact.get_json()
                assert expected['geojson_overlays'], (country, scope, 'missing baseline boundaries')
                assert actual['geojson_overlays'] == []
                expected['geojson_overlays'] = []
                assert actual == expected, (country, scope, 'non-boundary data changed')
                again = client.post('/api/pypsa/parse-nc', json={**body, 'include_geojson_overlays': False})
                assert again.data == compact.data and again.headers['X-Atlas-Map-Cache'] == 'hit'
                compressed_sizes = []
                for request_body, identity in [(body, regular),
                                               ({**body, 'include_geojson_overlays': False}, compact)]:
                    compressed = client.post('/api/pypsa/parse-nc', json=request_body,
                                             headers={'Accept-Encoding': 'gzip'})
                    assert compressed.status_code == 200
                    assert compressed.headers.get('Content-Encoding') == 'gzip'
                    assert gzip.decompress(compressed.data) == identity.data
                    compressed_sizes.append(len(compressed.data))
                results.append(dict(country=country, scope=scope, normal_bytes=len(regular.data),
                                    compact_bytes=len(compact.data), markers=len(actual['markers']),
                                    connections=len(actual['connections']), cache_hit=True,
                                    normal_gzip_bytes=compressed_sizes[0],
                                    compact_gzip_bytes=compressed_sizes[1]))
        for value in [None, 0, 1, 'false', 'true', [], {}]:
            bad = client.post('/api/pypsa/parse-nc', json={**body, 'include_geojson_overlays': value})
            assert bad.status_code == 400
    print(json.dumps({'transport': 'in-process test client; live server unchanged', 'results': results,
                      'invalid_boolean_checks': 7}, indent=2))


if __name__ == '__main__':
    main()
