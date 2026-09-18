"""The real API preloader must distinguish cache success from data availability."""
import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location('map_cache_warmup', Path(__file__).parents[1] / 'scripts/warm_grid_map_cache.py')
warmup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(warmup)


def test_scopes_preserve_country_sources_and_only_apply_demand_options_to_demand():
    entries = [('FR', 'nuts3', {'filename': 'FR.nc', 'geographic_country': 'FR', 'component_scope': 'grid'})]
    options = {'demand_year': 2025, 'demand_scenario': 'NT', 'annual_demand_gwh_per_country': 200}
    expanded = warmup.expand_scopes(entries, ['grid', 'supply', 'storage', 'demand', 'full', 'grid'], options)
    assert len(expanded) == 5
    assert entries[0][2]['component_scope'] == 'grid'
    for country, level, body in expanded:
        assert (country, level, body['filename'], body['geographic_country']) == ('FR', 'nuts3', 'FR.nc', 'FR')
        assert ('demand_year' in body) == (body['component_scope'] in {'demand', 'full'})
    assert expanded[-1][2]['annual_demand_gwh_per_country'] == 200


@pytest.mark.parametrize('scope', warmup.SCOPES)
def test_response_validation_does_not_misrepresent_missing_components(scope):
    payload = {'component_scope': scope, 'markers': [], 'connections': [],
               'demand_inventory': {'loaded': False, 'reason': 'Weights not built', 'source_file': '/private/input'}}
    if scope in {'grid', 'lines_only'}:
        with pytest.raises(ValueError, match='nonempty'):
            warmup.validate_payload(payload, scope)
    else:
        warmup.validate_payload(payload, scope)
    assert warmup.inventory_summary(payload) == {'demand_inventory': {'loaded': False, 'reason': 'Weights not built'}}
    payload['source_inventory'] = {'error': 'Source unavailable'}
    payload['markers'] = [{'id': 'bus'}]
    with pytest.raises(ValueError, match='Incomplete'):
        warmup.validate_payload(payload, scope)
    payload['component_scope'] = 'incorrect'
    with pytest.raises(ValueError, match='valid'):
        warmup.validate_payload(payload, scope)


def test_catalog_selects_only_validated_local_networks():
    catalog = {'files': [
        {'filename': 'FR.nc', 'geographic_country': 'FR', 'geographic_level': 'nuts3', 'validation_passed': True},
        {'filename': 'BE.nc', 'geographic_country': 'BE', 'geographic_level': 'nuts3', 'validation_passed': False},
        {'filename': 'full_FR.nc', 'full_country': 'FR', 'is_full_nodal_network': True},
        {'filename': 'distill.nc'},
    ]}
    selected = warmup.select_requests(catalog)
    assert [(c, level) for c, level, _ in selected] == [('FR', 'nuts3'), ('FR', 'full')]
    assert all(body['component_scope'] == 'grid' for _, _, body in selected)
    assert warmup.select_requests(catalog, {'BE'}) == []


def demand_payload():
    annual, mw = 100., 100000 / 8760
    sector = {'annual_energy_gwh': annual, 'p_set_mw': mw, 'subsectors': [{'annual_energy_gwh': annual, 'p_set_mw': mw}]}
    return {'component_scope': 'demand', 'markers': {'a': {'id': 'a', 'country': 'FR', 'provisional_demand': True,
                'annual_energy_gwh': annual, 'p_set': mw, 'demand_breakdown': [sector]}}, 'connections': [],
            'demand_inventory': {'loaded': True, 'map_components': 1, 'countries': {'FR': {
                'annual_demand_gwh': annual, 'flat_total_mw': mw, 'weighted_buses': 1, 'composition_loaded': True}}}}


def test_demand_validation_checks_actual_bus_and_subsector_totals():
    payload = demand_payload()
    warmup.validate_payload(payload, 'demand')
    payload['markers']['a']['demand_breakdown'][0]['subsectors'][0]['annual_energy_gwh'] = 99
    with pytest.raises(ValueError, match='not conserved'):
        warmup.validate_payload(payload, 'demand')


def test_compact_shared_etm_templates_are_validated_without_per_bus_expansion():
    payload = demand_payload()
    marker = payload['markers']['a']
    marker.pop('demand_breakdown')
    marker['demand_template_key'] = 'FR:NT:2030'
    payload['demand_templates'] = {'FR:NT:2030': [{'share': 1., 'subsectors': [{'share_of_total': 1.}]}]}
    warmup.validate_payload(payload, 'demand')
    payload['demand_templates']['FR:NT:2030'][0]['subsectors'][0]['share_of_total'] = .9
    with pytest.raises(ValueError, match='not conserved'):
        warmup.validate_payload(payload, 'demand')


@pytest.mark.parametrize('change', ['annual', 'missing', 'invalid', 'substitution'])
def test_demand_validation_rejects_plausible_but_wrong_responses(change):
    payload = demand_payload()
    marker = payload['markers']['a']
    if change == 'annual':
        marker['annual_energy_gwh'] = 1
    elif change == 'missing':
        payload['markers'] = {}
    elif change == 'invalid':
        marker['p_set'] = float('nan')
    else:
        payload['demand_inventory']['countries']['FR']['composition_loaded'] = False
    with pytest.raises(ValueError):
        warmup.validate_payload(payload, 'demand')
