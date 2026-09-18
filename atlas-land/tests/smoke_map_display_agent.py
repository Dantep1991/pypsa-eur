"""Opt-in live Nohm planner/judge check, using production routes in process.

Makes real text-model calls but opens no listener, microphone or map workspace.
The judge observation is a labelled fixture, not evidence of live UI execution.
Run from the PyPSA root: python atlas-land/tests/smoke_map_display_agent.py
"""
import contextlib
import io
import json
import sys
from pathlib import Path


def main():
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        import run_atlas_backend_stable as runner
    client = runner.application.test_client()
    before = {'mapDisplay': {'nodeMarkers': True, 'geographicBoundaries': True, 'domainControls': True},
              'networkCarrier': 'electricity', 'loadedCountryCodes': ['FR'],
              'networkResolution': 'nuts3', 'visibleMapLayers': ['Grid'],
              'center': {'lat': 46.5, 'lng': 2.5}, 'zoom': 6}
    cases = [
        ('Hide the geographic boundaries, keep the grid and camera unchanged.', {'geographic_boundaries': False}),
        ('Oculta los puntos de los nodos y los límites geográficos, sin cambiar la red ni el zoom.',
         {'node_markers': False, 'geographic_boundaries': False}),
        ('Affiche les points des nœuds et les limites géographiques sans déplacer la carte.',
         {'node_markers': True, 'geographic_boundaries': True}),
    ]
    for message, expected in cases:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            response = client.post('/api/map-agent/interpret', json={'message': message, 'mapContext': before})
        data = response.get_json()
        assert response.status_code == 200 and data.get('provider') == 'nohm', 'Planner unavailable'
        actions = data.get('actions', [])
        assert actions and all(action['intent'] == 'set_map_display' for action in actions), actions
        actual = {key: value for action in actions for key, value in action['params'].items()}
        assert actual == expected, (actual, expected)
        print(json.dumps({'check': 'live planner', 'message': message, 'actions': actions}), flush=True)
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        response = client.post('/api/map-agent/judge', json={
            'message': cases[0][0], 'beforeContext': before,
            'afterContext': {**before, 'mapDisplay': {**before['mapDisplay'], 'domainControls': False}},
            'plannedActions': [{'intent': 'toggle_domain_controls', 'params': {'visible': False}}],
            'executionNotes': ['Collapsed domain controls.']})
    result = response.get_json()
    assert result.get('verdict') == 'repair', result
    assert any(action['intent'] == 'set_map_display' and action['params'].get('geographic_boundaries') is False
               for action in result.get('corrections', [])), result
    print(json.dumps({'check': 'live judge with fixture observations', 'result': result}), flush=True)


if __name__ == '__main__':
    main()
