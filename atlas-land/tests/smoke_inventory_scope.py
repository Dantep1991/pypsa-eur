"""Opt-in source-capacity conservation across real Atlas country resolutions.

Run from the PyPSA root: python atlas-land/tests/smoke_inventory_scope.py XK
Uses the normal combined Flask application in process; opens no listener.
No model, voice or solve request is made. Exits nonzero on missing/misassigned
inventory or capacity loss. Published source totals are not operational forecasts.
"""
import contextlib
import io
import json
import math
from pathlib import Path
import sys


def main():
    countries = sys.argv[1:] or ['XK']
    if any(len(code) != 2 or not code.isalpha() or not code.isupper() for code in countries):
        raise SystemExit('Use uppercase ISO2 country codes')
    root = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(root / 'scripts'))
    results = []
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        import run_atlas_backend_stable as runner
        client = runner.application.test_client()
        plants, _ = runner.atlas._load_pypsa_source_powerplants()
        for country in countries:
            name = runner.atlas._PYPSA_SOLVE_NETWORK_COUNTRIES[country]
            if country in {'GB', 'UK'}:
                name = 'United Kingdom'
            selected = plants[plants['Country'].str.casefold().eq(name.casefold())]
            if selected.empty:
                raise AssertionError(f'{country}: no source inventory available')
            storage_rows = selected['Set'].str.casefold().isin(['store', 'storage'])
            for level in ['bidding_zone', 'ehighway', 'nuts1', 'nuts2', 'nuts3', 'full']:
                for scope, rows in [('supply', selected[~storage_rows]), ('storage', selected[storage_rows])]:
                    body = {'filename': f'base_{country}_{level}.nc', 'component_scope': scope}
                    if level == 'full':
                        body['full_country'] = country
                    else:
                        body.update(geographic_country=country, geographic_level=level)
                    response = client.post('/api/pypsa/parse-nc', json=body)
                    assert response.status_code == 200, f'{country}/{level}/{scope}: HTTP {response.status_code}'
                    payload = response.get_json()
                    inventory = payload.get('source_inventory', {})
                    markers = [m for m in payload['markers'] if m.get('source_inventory')]
                    expected = float(rows['Capacity'].sum())
                    actual = sum(float(m.get('p_nom') or 0) for m in markers)
                    assert math.isclose(actual, expected, abs_tol=1e-6), (country, level, scope, actual, expected)
                    assert all(m['country'] == country for m in markers), (country, level, scope, 'foreign marker')
                    if not rows.empty:
                        assert inventory.get('loaded') and inventory.get('source_rows') == len(rows), inventory
                    results.append({'country': country, 'level': level, 'scope': scope,
                                    'source_rows': len(rows), 'map_components': len(markers),
                                    'capacity_mw': round(actual, 6), 'status': response.status_code})
    print(json.dumps({'transport': 'in-process Flask test_client; live port unchanged',
                      'results': results}, indent=2))


if __name__ == '__main__':
    main()
