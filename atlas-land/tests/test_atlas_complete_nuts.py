import json
import pytest
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union
import atlas_network_clustering as service
import atlas_cluster_registry as registry


def feature(code, left):
    return {'properties':{'id':code,'name':code},'geometry':mapping(box(left,0,left+1,2))}


def node(name, longitude, country='BE'):
    return {'key':json.dumps([country,'native.nc',name]),'country':country,'longitude':longitude,'latitude':1.}


@pytest.mark.parametrize('level',['nuts2','nuts3'])
def test_every_official_region_has_geography_even_without_a_bus(monkeypatch,level):
    features=[feature(f'BE{i}',i) for i in range(6)]
    before=json.dumps(features)
    monkeypatch.setattr(service,'load_country_boundaries',lambda *_:(features,{'provider':'fixture'}))
    nodes=[node('west',.5),node('east',5.5),node('offshore',-1)]
    result=service.build_groups({'level':level,'nodes':nodes})
    assert len(result['groups'])==6
    assert result['networkGroupCount']==2 and result['geographyOnlyGroupCount']==4
    assert result['sourceRegionCount']==6 and result['assignedCount']==2
    assert result['unmatched']==[nodes[-1]['key']]
    assert sorted(m for g in result['groups'] for m in g['members'])==sorted(n['key'] for n in nodes[:2])
    footprints=[shape(g['geometry']) for g in result['groups']]
    assert unary_union(footprints).equals(box(0,0,6,2))
    assert sum(a.intersection(b).area for i,a in enumerate(footprints) for b in footprints[i+1:])==0
    assert all(g['geographyOnly']==(not g['members']) for g in result['groups'])
    assert all(g['territoryOnly'] for g in result['groups'] if g['geographyOnly'])
    assert json.dumps(features)==before
    registry.validate_definition({**result,'id':'complete','name':'Full country'})


@pytest.mark.parametrize('level',['nuts2','nuts3'])
def test_selected_countries_keep_separate_complete_geographies(monkeypatch,level):
    source={'BE':[feature('BE1',0),feature('BE2',1)],'NL':[feature('NL1',2),feature('NL2',3)]}
    monkeypatch.setattr(service,'load_country_boundaries',lambda country,_:(source[country],{}))
    result=service.build_groups({'level':level,'nodes':[node('a',.5),node('b',2.5,'NL')]})
    assert len(result['groups'])==4 and result['networkGroupCount']==2
    assert unary_union([shape(g['geometry']) for g in result['groups']]).equals(box(0,0,4,2))
    assert all(len(g['countryCodes'])==1 for g in result['groups'])


@pytest.mark.parametrize('level',['nuts2','nuts3'])
def test_missing_country_boundaries_do_not_publish_partial_country_coverage(monkeypatch,level):
    def load(country,_):
        if country=='NL':raise ValueError('No source geometry')
        return [feature('BE1',0)],{}
    monkeypatch.setattr(service,'load_country_boundaries',load)
    with pytest.raises(ValueError,match=f'complete {level.upper()} geography for NL'):
        service.build_groups({'level':level,'nodes':[node('a',.5),node('b',2.5,'NL')]})


def test_real_source_holes_are_not_filled_or_assigned_invented_assets(monkeypatch):
    polygon={'type':'Polygon','coordinates':[[[0,0],[3,0],[3,3],[0,3],[0,0]],
        [[.5,.5],[1.5,.5],[1.5,1.5],[.5,1.5],[.5,.5]]]}
    monkeypatch.setattr(service,'load_country_boundaries',lambda *_:([{'properties':{'id':'BE1','name':'One'},'geometry':polygon}],{}))
    original=node('hole',1)
    result=service.build_groups({'level':'nuts3','nodes':[original]})
    assert shape(result['groups'][0]['geometry']).equals(shape(polygon))
    assert result['groups'][0]['members']==[] and result['groups'][0]['geographyOnly']
    assert result['unmatched']==[original['key']]


def test_geography_only_flag_cannot_hide_real_members():
    definition={'schema':'nohm.atlas.manual-clusters.v1','id':'invalid','name':'Invalid',
        'groups':[{'id':'BE1','name':'Region','members':[json.dumps(['BE','native.nc','a'])],
                   'countryCodes':['BE'],'longitude':1,'latitude':1,'geographyOnly':True}]}
    with pytest.raises(ValueError,match='cannot hide'):registry.validate_definition(definition)
