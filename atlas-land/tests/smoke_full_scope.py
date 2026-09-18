"""Opt-in real-data smoke test via Flask test_client; no listener or restart.

Run from the PyPSA root: python atlas-land/tests/smoke_full_scope.py FR ES BE
Uses the normal combined application's setup and real local NetCDF/source data.
"""
import contextlib
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
    # Keep startup/provider configuration logs out of test output. This test
    # invokes only network parsing, never a model provider or voice handshake.
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        import run_atlas_backend_stable as runner
        client = runner.application.test_client()
        results = []
        for country in countries:
            response = client.post('/api/pypsa/parse-nc', json={
                'filename': f'base_{country}_full.nc', 'full_country': country,
                'component_scope': 'full', 'demand_scenario': 'NT', 'demand_year': 2030,
            })
            payload = response.get_json() or {}
            if response.status_code != 200:
                raise RuntimeError(f'{country}: full-scope HTTP {response.status_code}')
            markers = payload['markers']
            assert isinstance(markers, list) and all(isinstance(row, dict) for row in markers)
            assert payload['component_scope'] == 'full'
            assert not payload.get('source_inventory', {}).get('error')
            assert not payload.get('demand_inventory', {}).get('error')
            loads = [row for row in markers if row.get('type') == 'Load']
            for row in loads:
                if row.get('demand_template_key'):
                    assert row['demand_template_key'] in payload['demand_templates']
            results.append({'country': country, 'status': 200, 'markers': len(markers),
                            'connections': len(payload['connections']), 'loads': len(loads),
                            'annual_demand_gwh': sum(row.get('annual_energy_gwh') or 0 for row in loads),
                            'shared_templates': len(payload['demand_templates'])})
    print(json.dumps({'transport': 'in-process Flask test_client; live port not restarted', 'results': results}, indent=2))


if __name__ == '__main__':
    main()
