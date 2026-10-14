import json
import random

import pytest
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

from atlas_evidence_growth import build_evidence_groups, grow_regions
import atlas_network_clustering as service


def fixture(count=20, values=None):
    return [{'country':'BE','members':[],'values':{'density':float(i+1)} if values is None else values[i],
             'feature':{'properties':{'id':f'BE{i:03d}','name':f'Place {i}'},
                        'geometry':mapping(box(i%5, i//5, i%5+1, i//5+1))}}
            for i in range(count)]


def test_top_density_seeds_exact_count_full_coverage_and_contiguous_groups():
    regions, labels, seeds, scores, detached = grow_regions(fixture(), ['density'], {'density':1}, 6)
    assert seeds == [19,18,17,16,15,14]
    assert len(set(labels.values())) == 6 and len(labels) == 20
    assert not detached
    for label, seed in enumerate(seeds):
        assert labels[seed] == label
        footprint=unary_union([shape(r['feature']['geometry']) for i,r in enumerate(regions) if labels[i]==label])
        assert footprint.geom_type == 'Polygon' and footprint.is_valid


def test_missing_evidence_does_not_leave_blanks_or_become_zero():
    values=[{'density':50.},{},{'density':30.},{'density':20.},{'density':10.}]
    regions, labels, seeds, _, _=grow_regions(fixture(5,values),['density'],{'density':1},2)
    assert len(labels)==5 and seeds==[0,2]
    assert regions[1]['values']=={}


def test_weighted_composite_changes_seeds_and_evidence_influences_boundaries():
    values=[{'density':10.,'gdp':90.},{'density':40.,'gdp':30.},{'density':60.,'gdp':10.},
            {'density':90.,'gdp':40.},{'density':30.,'gdp':60.}]
    source=fixture(5,values)
    a=grow_regions(source,['density','gdp'],{'density':4,'gdp':.25},2)
    b=grow_regions(source,['density','gdp'],{'density':.25,'gdp':4},2)
    assert a[2]!=b[2]
    changed=False
    randomizer=random.Random(74)
    for _ in range(50):
        values=[{'density':float(randomizer.randrange(100))} for _ in range(20)]
        source=fixture(20,values)
        pure=grow_regions(source,['density'],{'density':1},3,influence=0)
        composite=grow_regions(source,['density'],{'density':1},3,influence=4)
        assert pure[2]==composite[2]
        changed|=pure[1]!=composite[1]
    assert changed, 'Evidence must change frontier stopping points, not just pick seeds.'


def test_island_fallback_is_explicit_and_does_not_create_more_clusters():
    source=fixture(4)
    source[-1]['feature']['geometry']=mapping(box(30,30,31,31))
    source[-1]['values']={}
    _,labels,seeds,_,detached=grow_regions(source,['density'],{'density':1},2)
    assert len(set(labels.values()))==2 and len(labels)==4
    assert detached==[['BE003']]


def test_all_equal_evidence_retains_exact_seeds_and_stable_input_order():
    source=fixture(20,[{'density':1.}]*20)
    a=grow_regions(source,['density'],{'density':1},10)
    b=grow_regions(source[::-1],['density'],{'density':1},10)
    assert a==b and a[2]==list(range(10))


def test_too_few_complete_seed_profiles_is_an_honest_error():
    with pytest.raises(ValueError,match='Only 1 source regions'):
        grow_regions(fixture(2,[{'density':1.},{}]),['density'],{'density':1},2)


def test_source_membership_geometry_and_zero_bus_regions_are_conserved():
    source=fixture(20)
    nodes=[{'country':'BE','key':json.dumps(['BE','source.nc',str(i)]), 'longitude':i%5+.5,'latitude':i//5+.5}
           for i in range(0,20,2)]
    nodes.append({'country':'BE','key':json.dumps(['BE','source.nc','offshore']), 'longitude':-2.,'latitude':-2.})
    edges=[{'id':str(i),'from':a['key'],'to':b['key']} for i,(a,b) in enumerate(zip(nodes,nodes[1:]))]
    def load_indicator(*_):
        return [{'code':r['feature']['properties']['id'],'value':r['values']['density']} for r in source],True
    progress=[]
    result=build_evidence_groups({'level':'growth','nodes':nodes,'clusters':10,'gridConnections':edges,
        'evidence':{'indicators':['density'],'year':2023}},
        lambda *_:([r['feature'] for r in source],{'provider':'fixture'}),load_indicator,lambda **state:progress.append(state))
    assert len(result['groups'])==10 and result['regionCount']==20
    assert result['assignedCount']==10 and result['unmatched']==[nodes[-1]['key']]
    assert sorted(m for g in result['groups'] for m in g['members'])==sorted(n['key'] for n in nodes[:-1])
    assert sum(g['territoryOnly'] for g in result['groups'])==0
    assert result['networkChecks']['everyRegionSourceConnected']
    assert not result['networkChecks']['isolatedRegionIds']
    footprints=[shape(g['geometry']) for g in result['groups']]
    assert unary_union(footprints).equals(box(0,0,5,4))
    assert sum(a.intersection(b).area for i,a in enumerate(footprints) for b in footprints[i+1:])==0
    assert progress[-1]['completed']==20


@pytest.mark.parametrize('evidence',[{'indicators':[{}]}, {'indicators':['employment']},
    {'indicators':['density','density']},{'year':True},{'weights':{'density':float('nan')}},
    {'evidenceInfluence':-1},{'scaling':'bad'}])
def test_invalid_evidence_is_rejected_before_work(evidence):
    with pytest.raises(ValueError):
        service.validate({'level':'growth','regionLevel':'nuts3','clusters':10,
            'nodes':[{'country':'BE','key':'a','longitude':1.,'latitude':1.}], 'evidence':evidence})


def test_growth_count_validation_is_structural_but_requires_loaded_grid():
    source=service.validate({'level':'growth','clusters':10,'gridConnections':[],
        'nodes':[{'country':'BE','key':'a','longitude':1.,'latitude':1.}]})
    assert source['clusters']==10
    with pytest.raises(ValueError,match='native Grid'):
        service.validate({k:v for k,v in source.items() if k!='gridConnections'})


def test_empty_territory_must_not_become_an_empty_electrical_region():
    source=fixture(5)
    nodes=[{'country':'BE','key':'physical','longitude':.5,'latitude':.5}]
    with pytest.raises(ValueError,match='Only 1 independent'):
        build_evidence_groups({'nodes':nodes,'clusters':2,'gridConnections':[],
            'evidence':{'indicators':['density']}},lambda *_:([r['feature'] for r in source],{}),
            lambda *_:([{'code':r['feature']['properties']['id'],'value':r['values']['density']} for r in source],True))
