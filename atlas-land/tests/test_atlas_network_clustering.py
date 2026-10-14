import pytest
from flask import Flask
import atlas_network_clustering as clustering


def node(name, x, country='ES'):
    return {'key': name, 'country': country, 'latitude': 1., 'longitude': x}


def test_country_assignments_are_unique_and_conservative():
    source = {'level': 'country', 'nodes': [node('a',0),node('b',2),node('a-fr',0,'FR')]}
    states = []
    result = clustering.build_groups(source, lambda **state: states.append(state))
    assert result['assignedCount'] == 3
    assert len(result['groups']) == 2
    assert sorted(m for g in result['groups'] for m in g['members']) == ['a','a-fr','b']
    assert states[-1]['completed'] == 2


def test_spatial_count_above_old_limit_and_no_border_merging():
    result = clustering.build_groups({'level': 'spatial', 'clusters': 12,
        'nodes': [node(str(i),i/10,'ES' if i<12 else 'FR') for i in range(24)]})
    assert len(result['groups']) == 12
    assert all(len(g['countryCodes']) == 1 for g in result['groups'])


def test_boundary_holes_and_missing_country_remain_native(monkeypatch):
    geometry = {'type':'Polygon','coordinates':[[[0,0],[3,0],[3,3],[0,3],[0,0]],
                                               [[.5,.5],[1.5,.5],[1.5,1.5],[.5,1.5],[.5,.5]]]}
    def load(country, level):
        if country=='FR':
            raise ValueError('No ADM3 coverage for FR.')
        return [{'geometry':geometry,'properties':{'id':'west','name':'West'}}], {'provider':'fixture'}
    monkeypatch.setattr(clustering,'load_country_boundaries',load)
    result = clustering.build_groups({'level':'adm3','nodes':[node('covered',2),node('hole',1),node('fr',2,'FR')]})
    assert result['assignedCount']==1
    assert set(result['unmatched'])=={'hole','fr'}
    assert result['groups'][0]['members']==['covered']


@pytest.mark.parametrize('payload',[
    {'level':'country','nodes':[node('duplicate',1),node('duplicate',2)]},
    {'level':'spatial','clusters':True,'nodes':[node('a',1)]},
    {'level':'spatial','clusters':2049,'nodes':[node('a',1)]},
    {'level':'country','nodes':[dict(node('a',1),latitude=float('nan'))]},
    {'level':'country','nodes':[dict(node('a',1),longitude=181)]},
])
def test_validation_rejects_ambiguous_or_nonfinite_sources(payload):
    with pytest.raises(ValueError):
        clustering.validate(payload)


def test_route_has_dynamic_limit_and_bad_requests_are_json():
    app=Flask(__name__)
    app.register_blueprint(clustering.NETWORK_CLUSTER_BLUEPRINT)
    client=app.test_client()
    assert client.get('/api/atlas/network-clusters/options').get_json()['maxClusters']==2048
    response=client.post('/api/atlas/network-clusters/jobs',json={'level':'city','nodes':[]})
    assert response.status_code==400
    assert response.get_json()['error']


def test_eurostat_typology_becomes_exact_native_bus_membership():
    def feature(code, cluster, low, high):
        return {'properties': {'NUTS_ID':code,'cluster':cluster},
                'geometry': {'type':'Polygon','coordinates':[[[low,0],[high,0],[high,3],[low,3],[low,0]]]}}
    result=clustering.build_groups({'level':'evidence','nodes':[node('west',.5),node('east',2.5),node('outside',4)],
        'boundaryFeatures':[feature('ES01',1,0,1),feature('ES02',1,2,3)],'evidenceMeta':{'year':2023}})
    assert len(result['groups'])==1
    assert set(result['groups'][0]['members'])=={'west','east'}
    assert result['unmatched']==['outside']
