import json
import pytest
from flask import Flask
import atlas_cluster_registry as registry


def scheme(identity='manual-test'):
    return {'schema':'nohm.atlas.manual-clusters.v1','id':identity,'name':'Districts',
        'groups':[{'id':'region','name':'District','members':[json.dumps(['ES','native.nc','a'])],
                   'countryCodes':['ES'],'latitude':40,'longitude':1}],
        'policies':{'p_nom':'sum'},'sourceCount':1}


def client(tmp_path,monkeypatch):
    monkeypatch.setattr(registry,'REGISTRY_ROOT',tmp_path/'schemes')
    app=Flask(__name__);app.register_blueprint(registry.REGISTRY_BLUEPRINT)
    return app.test_client()


def test_saved_membership_persists_with_small_metadata_and_project_isolation(tmp_path,monkeypatch):
    first=client(tmp_path,monkeypatch)
    response=first.post('/api/atlas/network-clusters/schemes',json={'project':'one','scheme':scheme()})
    assert response.status_code==201
    assert response.get_json()['scheme']['groupCount']==1
    assert 'groups' not in response.get_json()['scheme']
    second=client(tmp_path,monkeypatch)
    assert len(second.get('/api/atlas/network-clusters/schemes?project=one').get_json()['schemes'])==1
    assert second.get('/api/atlas/network-clusters/schemes?project=two').get_json()['schemes']==[]
    assert second.get('/api/atlas/network-clusters/schemes/manual-test?project=one').get_json()['scheme']['groups']==scheme()['groups']
    assert second.get('/api/atlas/network-clusters/schemes/manual-test?project=two').status_code==404


def test_cannot_overwrite_existing_definition_or_create_traversal_path(tmp_path,monkeypatch):
    service=client(tmp_path,monkeypatch)
    assert service.post('/api/atlas/network-clusters/schemes',json={'project':'one','scheme':scheme()}).status_code==201
    changed=scheme();changed['name']='Changed'
    assert service.post('/api/atlas/network-clusters/schemes',json={'project':'one','scheme':changed}).status_code==400
    assert service.post('/api/atlas/network-clusters/schemes',json={'project':'../escape','scheme':scheme('new')}).status_code==400
    assert service.post('/api/atlas/network-clusters/schemes',json={'project':'one','scheme':scheme('../escape')}).status_code==400


def test_duplicate_source_members_cannot_be_saved(tmp_path,monkeypatch):
    service=client(tmp_path,monkeypatch)
    value=scheme();value['groups'][0]['members']*=2
    assert service.post('/api/atlas/network-clusters/schemes',json={'project':'one','scheme':value}).status_code==400


def test_land_only_region_requires_real_geometry_and_explicit_flag(tmp_path,monkeypatch):
    value=scheme();group=value['groups'][0];group['members']=[]
    service=client(tmp_path,monkeypatch)
    assert service.post('/api/atlas/network-clusters/schemes',json={'project':'one','scheme':value}).status_code==400
    group.update(territoryOnly=True,regionIds=['ES001'],geometry={'type':'Polygon','coordinates':[[[0,0],[1,0],[1,1],[0,1],[0,0]]]})
    assert service.post('/api/atlas/network-clusters/schemes',json={'project':'one','scheme':value}).status_code==201
    merged=scheme('merged');merged['groups'][0].update(group)
    merged['groups'][0]['geometry']={'type':'GeometryCollection','geometries':[group['geometry']]}
    assert service.post('/api/atlas/network-clusters/schemes',json={'project':'one','scheme':merged}).status_code==201
