import json
import pytest
from shapely.geometry import shape, mapping, box, Polygon
from shapely.ops import unary_union
import atlas_network_clustering as service


def source_fixture(monkeypatch, count=200):
    nodes, features = [], {}
    for i in range(count):
        country = 'ES' if i % 2 else 'FR'
        x, y = i % 20, 40 + i // 20
        nodes.append({'key': json.dumps([country,'native.nc',str(i)]),
                      'country': country, 'longitude': x+.5, 'latitude': y+.5})
        features.setdefault(country, []).append({'properties': {'id':f'{country}{i:03d}','name':str(i)},
            'geometry': {'type':'Polygon','coordinates':[[[x,y],[x+1,y],[x+1,y+1],[x,y+1],[x,y]]]}})
    monkeypatch.setattr(service,'load_country_boundaries',lambda country,level:(features[country],{'provider':'fixture'}))
    return nodes


def test_two_hundred_regions_become_twenty_geographic_identities_not_country_colours(monkeypatch):
    nodes=source_fixture(monkeypatch)
    result=service.build_groups({'level':'regions','regionLevel':'nuts3','clusters':20,'nodes':nodes})
    assert len(result['groups'])==20
    assert result['regionCount']==200
    assert result['assignedCount']==200
    assert sorted(m for g in result['groups'] for m in g['members'])==sorted(n['key'] for n in nodes)
    assert sum(g['regionCount'] for g in result['groups'])==200
    assert any(len(g['countryCodes'])==2 for g in result['groups'])
    assert all(shape(g['geometry']).is_valid and not shape(g['geometry']).is_empty for g in result['groups'])


def test_cannot_invent_more_groups_than_occupied_regions(monkeypatch):
    nodes=source_fixture(monkeypatch,2)
    nodes.extend([dict(nodes[0],key=json.dumps(['FR','native.nc','extra']))])
    with pytest.raises(ValueError,match='Only 2 occupied'):
        service.build_groups({'level':'regions','clusters':3,'nodes':nodes})


def test_same_indicator_cluster_across_borders_is_one_geographic_identity():
    features=[{'properties':{'NUTS_ID':f'{country}001','cluster':1},
               'geometry':{'type':'Polygon','coordinates':[[[x,0],[x+1,0],[x+1,2],[x,2],[x,0]]]}}
              for country,x in [('ES',0),('FR',1)]]
    nodes=[{'key':json.dumps([country,'native.nc','a']),'country':country,'longitude':x+.5,'latitude':1}
           for country,x in [('ES',0),('FR',1)]]
    result=service.build_groups({'level':'evidence','nodes':nodes,'boundaryFeatures':features})
    assert len(result['groups'])==1
    assert set(result['groups'][0]['countryCodes'])=={'ES','FR'}
    assert result['groups'][0]['regionCount']==2


def test_missing_coverage_stays_explicit_and_native(monkeypatch):
    nodes=source_fixture(monkeypatch,4)
    nodes.append({'key':'uncovered','country':'ES','latitude':0.,'longitude':-1.})
    result=service.build_groups({'level':'regions','clusters':2,'nodes':nodes})
    assert result['unmatched']==['uncovered']
    assert result['assignedCount']==4
    assert len(result['groups'])==2


def test_invalid_source_level_is_rejected_before_work(monkeypatch):
    nodes=source_fixture(monkeypatch,4)
    with pytest.raises(ValueError,match='Choose NUTS'):
        service.validate({'level':'regions','regionLevel':'unknown','clusters':2,'nodes':nodes})


def test_indicator_membership_uses_full_geometry_not_the_coarse_display_polygon(monkeypatch):
    full={'properties':{'id':'ES001','name':'Region'},
          'geometry':{'type':'Polygon','coordinates':[[[0,0],[2,0],[2,2],[0,2],[0,0]]]}}
    coarse={'properties':{'NUTS_ID':'ES001','cluster':1},
            'geometry':{'type':'Polygon','coordinates':[[[0,0],[1,0],[1,2],[0,2],[0,0]]]}}
    monkeypatch.setattr(service,'load_country_boundaries',lambda country,level:([full],{'provider':'fixture'}))
    result=service.build_groups({'level':'evidence','nodes':[{'key':'physical','country':'ES','latitude':1.,'longitude':1.5}],
                                'boundaryFeatures':[coarse],'evidenceMeta':{'level':3}})
    assert result['assignedCount']==1
    assert result['groups'][0]['members']==['physical']


def test_empty_land_regions_are_included_once_without_inventing_source_buses(monkeypatch):
    features = [{'properties': {'id': f'BE{i}', 'name': str(i)},
                 'geometry': mapping(box(i, 0, i+1, 1))} for i in range(6)]
    nodes = [{'key': str(i), 'country': 'BE', 'longitude': i+.5, 'latitude': .5} for i in (0, 5)]
    monkeypatch.setattr(service, 'load_country_boundaries', lambda *_: (features, {'provider': 'fixture'}))
    result = service.build_groups({'level': 'regions', 'clusters': 2, 'nodes': nodes})
    assert result['regionCount'] == 6
    assert result['occupiedRegionCount'] == 2
    assert result['landOnlyRegionCount'] == 4
    assert result['disconnectedLandRegionCount'] == 0
    assert sorted(m for g in result['groups'] for m in g['members']) == ['0', '5']
    footprints = [shape(g['geometry']) for g in result['groups']]
    assert unary_union(footprints).equals(box(0, 0, 6, 1))
    assert footprints[0].intersection(footprints[1]).area == 0
    assert sorted(r for g in result['groups'] for r in g['regionIds']) == [f'BE{i}' for i in range(6)]
    assert all(shape(g['geometry']).geom_type == 'Polygon' for g in result['groups'])


def test_shared_borders_are_not_independently_simplified_into_gaps():
    seam = [(1., 0.), (1.003, .3), (.997, .6), (1., 1.)]
    left = Polygon([(0., 0.), *seam, (0., 1.)])
    right = Polygon([*seam, (2., 1.), (2., 0.)])
    groups = [{'id': 'left'}, {'id': 'right'}]
    service.attach_geography(groups, {g['id']: [{'properties': {'id': g['id']}, 'geometry': mapping(p)}]
                                     for g, p in zip(groups, [left, right])})
    footprints = [shape(g['geometry']) for g in groups]
    assert footprints[0].equals(left) and footprints[1].equals(right)
    assert unary_union(footprints).equals(box(0., 0., 2., 1.))
    assert footprints[0].intersection(footprints[1]).area == 0


def test_empty_island_uses_same_country_seed_without_creating_an_asset(monkeypatch):
    features = [{'properties': {'id': f'BE{i}'}, 'geometry': mapping(box(i*3, 0, i*3+1, 1))} for i in range(2)]
    monkeypatch.setattr(service, 'load_country_boundaries', lambda *_: (features, {'provider': 'fixture'}))
    result = service.build_groups({'level': 'regions', 'clusters': 1,
        'nodes': [{'key': 'physical', 'country': 'BE', 'longitude': .5, 'latitude': .5}]})
    assert result['groups'][0]['members'] == ['physical']
    assert result['groups'][0]['regionCount'] == 2
    assert result['disconnectedLandRegionCount'] == 1
    assert shape(result['groups'][0]['geometry']).equals(unary_union([shape(f['geometry']) for f in features]))


def test_country_without_occupied_region_cannot_borrow_another_countrys_assets(monkeypatch):
    monkeypatch.setattr(service, 'load_country_boundaries', lambda country, _: ([{
        'properties': {'id': country}, 'geometry': mapping(box(0, 0, 1, 1))}], {'provider': 'fixture'}))
    with pytest.raises(ValueError, match='No on-land source buses cover FR'):
        service.build_groups({'level': 'regions', 'clusters': 1, 'nodes': [
            {'key': 'BE-land', 'country': 'BE', 'longitude': .5, 'latitude': .5},
            {'key': 'FR-outside', 'country': 'FR', 'longitude': 10., 'latitude': 10.}]})


def test_full_territory_results_are_deterministic_when_inputs_are_reordered(monkeypatch):
    features = [{'properties': {'id': f'BE{i}'}, 'geometry': mapping(box(i, 0, i+1, 1))} for i in range(5)]
    nodes = [{'key': str(i), 'country': 'BE', 'longitude': i+.5, 'latitude': .5} for i in (0, 4)]
    monkeypatch.setattr(service, 'load_country_boundaries', lambda *_: (features, {'provider': 'fixture'}))
    first = service.build_groups({'level': 'regions', 'clusters': 2, 'nodes': nodes})
    features.reverse()
    second = service.build_groups({'level': 'regions', 'clusters': 2, 'nodes': nodes[::-1]})
    assert first == second


def test_full_country_builder_does_not_silently_omit_a_missing_country(monkeypatch):
    def load(country, _):
        if country == 'FR':
            raise ValueError('Provider has no coverage.')
        return [{'properties': {'id': 'BE'}, 'geometry': mapping(box(0, 0, 1, 1))}], {'provider': 'fixture'}
    monkeypatch.setattr(service, 'load_country_boundaries', load)
    with pytest.raises(ValueError, match='Cannot cover all of FR'):
        service.build_groups({'level': 'regions', 'clusters': 1, 'nodes': [
            {'key': 'BE', 'country': 'BE', 'longitude': .5, 'latitude': .5},
            {'key': 'FR', 'country': 'FR', 'longitude': .5, 'latitude': .5}]})
