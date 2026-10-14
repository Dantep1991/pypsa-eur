import pytest
from shapely.geometry import box, mapping
from atlas_grid_constraints import audit_groups, connected_blocks, source_graph, validate_grid
from atlas_evidence_growth import grow_regions


def unit(i,members,value):
    return {'country':'BE','members':members,'values':{'density':value},
        'feature':{'properties':{'id':str(i),'name':str(i)},'geometry':mapping(box(i,0,i+1,1))}}


def edge(a,b,kind='line'):
    return {'id':f'{kind}-{a}-{b}','from':a,'to':b}


def test_whole_region_closure_uses_actual_paths_not_implicit_internal_shorts():
    regions=[unit(0,['a','c'],30),unit(1,['b'],20),unit(2,['d'],10)]
    nodes=[{'key':key} for key in 'abcd']
    graph=source_graph(nodes,[edge('a','b'),edge('b','c','transformer'),edge('c','d')])
    blocks,members,adjacency,closures=connected_blocks(regions,graph)
    assert blocks=={0:{0,1},2:{2}}
    assert members[0]==set('abc') and adjacency=={0:{2},2:{0}}
    assert closures[0]['sourceBusPath']==['a','b','c']
    with pytest.raises(ValueError,match='no reported in-scope'):
        connected_blocks(regions,source_graph(nodes,[edge('a','b')]))


def test_empty_highest_ranked_seed_reserves_grid_core_and_all_groups_connected():
    regions=[unit(0,[],100),unit(1,['a'],70),unit(2,['b'],60),unit(3,['c'],50),unit(4,[],40)]
    nodes=[{'key':key} for key in 'abc'];edges=[edge('a','b'),edge('b','c')];meta={}
    grown,labels,seeds,_,_=grow_regions(regions,['density'],{'density':1},2,
        topology={'nodes':nodes,'gridConnections':edges},network_info=meta)
    assert seeds==[0,2] and len(set(labels.values()))==2 and len(labels)==5
    groups=[{'id':str(label),'seedRegionId':grown[seed]['feature']['properties']['id'],
        'members':[key for i,r in enumerate(grown) if labels[i]==label for key in r['members']]}
        for label,seed in enumerate(seeds)]
    checked=audit_groups(groups,nodes,edges)
    assert checked['everyRegionSourceConnected'] and not checked['isolatedRegionIds']
    assert checked['syntheticBranches']==0 and meta['seedAdjustments']


def test_true_source_islands_never_get_fake_links_to_meet_count():
    regions=[unit(i,[key],10-i) for i,key in enumerate('abc')];nodes=[{'key':key} for key in 'abc']
    with pytest.raises(ValueError,match='disconnected pieces'):
        grow_regions(regions,['density'],{'density':1},1,topology={'nodes':nodes,'gridConnections':[edge('a','b')]})
    with pytest.raises(ValueError,match='Only 3 source regions'):
        grow_regions(regions,['density'],{'density':1},4,topology={'nodes':nodes,'gridConnections':[]})


def test_endpoint_validation_does_not_accept_an_unreported_external_bus():
    payload={'nodes':[{'key':'a'}],'gridConnections':[edge('a','outside')]}
    with pytest.raises(ValueError,match='do not match'):validate_grid(payload)
    payload['gridConnections']=[{**edge('a','external:country/bus'),'toExternal':True}]
    validate_grid(payload)


def test_network_growth_is_deterministic_and_all_native_buses_are_conserved():
    regions=[unit(i,[str(i)],float(i%3)) for i in range(12)]
    edges=[edge(str(i),str(i+1),'transformer' if i%2 else 'line') for i in range(11)]
    nodes=[{'key':str(i)} for i in range(12)]
    a=grow_regions(regions,['density'],{'density':1},4,topology={'nodes':nodes,'gridConnections':edges})
    b=grow_regions(regions[::-1],['density'],{'density':1},4,topology={'nodes':nodes[::-1],'gridConnections':edges[::-1]})
    assert a==b and set(a[1])==set(range(12))
