"""Persistent map groupings on D:, separate from executable model databases.

Project scopes are metadata, never filesystem paths. Definitions are immutable
and source records remain untouched. Lightweight metadata avoids loading every
saved bus mapping when the Geography card opens.
"""
import json
import math
import os
from pathlib import Path
import re
import threading
import uuid
from shapely.geometry import shape

from flask import Blueprint, jsonify, request
from atlas_cluster_boundaries import CACHE_ROOT

REGISTRY_BLUEPRINT = Blueprint('atlas_cluster_registry', __name__)
REGISTRY_ROOT = Path(os.getenv('NOHM_ATLAS_CLUSTER_REGISTRY_DIR', str(CACHE_ROOT.parent / 'schemes')))
_LOCK = threading.RLock()


def _segment(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', value):
        raise ValueError('Invalid grouping or project identity.')
    return value


def _path(identity, suffix='json'):
    root = REGISTRY_ROOT.resolve()
    if os.name == 'nt' and root.drive.upper() != 'D:':
        raise ValueError('Manual grouping data must be stored on D:.')
    path = (root / f'{_segment(identity)}.{suffix}').resolve()
    if root not in path.parents:
        raise ValueError('Grouping is outside its registry.')
    return path


def validate_definition(definition):
    if not isinstance(definition, dict) or definition.get('schema') != 'nohm.atlas.manual-clusters.v1':
        raise ValueError('Unsupported manual grouping schema.')
    _segment(definition.get('id'))
    if not isinstance(definition.get('name'), str) or not 1 <= len(definition['name'].strip()) <= 200:
        raise ValueError('Choose a grouping name of at most 200 characters.')
    groups = definition.get('groups')
    if not isinstance(groups, list) or not 1 <= len(groups) <= 50000:
        raise ValueError('No valid groups are present.')
    members, identities = set(), set()
    for group in groups:
        if not isinstance(group, dict) or not group.get('id') or group['id'] in identities:
            raise ValueError('Every group needs a unique identity.')
        identities.add(group['id'])
        for field,limit in (('latitude',90),('longitude',180)):
            value=group.get(field)
            if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or abs(value)>limit:
                raise ValueError('Every group needs valid centre coordinates.')
        if not isinstance(group.get('name'), str) or not group['name'].strip():
            raise ValueError('Every group needs a name.')
        if not isinstance(group.get('members'), list):
            raise ValueError('Every group needs source members.')
        if group.get('geographyOnly') is True and group['members']:
            raise ValueError('Geography-only regions cannot hide source grid buses.')
        if not group['members']:
            try:
                footprint = shape(group.get('geometry', {}))
                allowed = (group.get('territoryOnly') is True and bool(group.get('regionIds'))
                           and (footprint.geom_type in {'Polygon', 'MultiPolygon'} or
                                (footprint.geom_type == 'GeometryCollection' and all(p.geom_type in {'Polygon','MultiPolygon'} for p in footprint.geoms)))
                           and footprint.is_valid and not footprint.is_empty and footprint.area > 0)
            except (ValueError, TypeError, AttributeError):
                allowed = False
            if not allowed:
                raise ValueError('Empty membership requires an explicit, valid territorial footprint.')
        if not isinstance(group.get('countryCodes'),list) or not group['countryCodes']:
            raise ValueError('Every group needs its source countries.')
        for member in group['members']:
            if not isinstance(member, str) or len(member) > 1024 or member in members:
                raise ValueError('Source membership is invalid or duplicated.')
            identity = json.loads(member)
            if not isinstance(identity, list) or len(identity) != 3 or not all(isinstance(v,str) for v in identity):
                raise ValueError('Invalid source bus identity.')
            members.add(member)
    if len(members) > 50000:
        raise ValueError('A grouping may contain at most 50000 source buses.')
    if any(mode not in {'sum','mean','capacity_weighted'} for mode in definition.get('policies',{}).values()):
        raise ValueError('Unsupported property aggregation rule.')
    return definition


def save_definition(project, definition):
    project = _segment(project)
    definition = validate_definition(definition)
    record = {**definition, 'projectId': project}
    metadata = {key: record.get(key) for key in ('id','name','projectId','level','savedAt','sourceNetworks','sourceCount')}
    metadata.update(groupCount=len(record['groups']), countryCodes=sorted({c for g in record['groups'] for c in g['countryCodes']}))
    with _LOCK:
        path = _path(record['id'])
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists() and json.loads(path.read_text(encoding='utf-8')) != record:
            raise ValueError('This grouping identity already exists. Save it as a new grouping.')
        for destination, data in ((path,record),(_path(record['id'],'meta.json'),metadata)):
            temporary = destination.with_name(f'{destination.name}.{uuid.uuid4().hex}.tmp')
            temporary.write_text(json.dumps(data, separators=(',',':'),allow_nan=False),encoding='utf-8')
            os.replace(temporary,destination)
    return metadata


@REGISTRY_BLUEPRINT.get('/api/atlas/network-clusters/schemes')
def list_schemes():
    try:
        project = _segment(request.args.get('project','reference'))
        with _LOCK:
            records = []
            for path in REGISTRY_ROOT.glob('*.meta.json'):
                record=json.loads(path.read_text(encoding='utf-8'))
                if record.get('projectId') == project:
                    records.append(record)
        return jsonify(schemes=sorted(records,key=lambda r:r.get('savedAt') or '',reverse=True))
    except (ValueError,OSError) as error:
        return jsonify(error=str(error)),400


@REGISTRY_BLUEPRINT.get('/api/atlas/network-clusters/schemes/<identity>')
def get_scheme(identity):
    try:
        project = _segment(request.args.get('project','reference'))
        record = json.loads(_path(identity).read_text(encoding='utf-8'))
        if record.get('projectId') != project:
            raise FileNotFoundError()
        return jsonify(scheme=record)
    except (FileNotFoundError,ValueError):
        return jsonify(error='Saved grouping not found in this project.'),404


@REGISTRY_BLUEPRINT.post('/api/atlas/network-clusters/schemes')
def create_scheme():
    if request.content_length and request.content_length > 12*1024*1024:
        return jsonify(error='Grouping exceeds the 12 MB limit.'),413
    try:
        payload=request.get_json(silent=True) or {}
        return jsonify(scheme=save_definition(payload.get('project'),payload.get('scheme'))),201
    except (ValueError,OSError,TypeError,KeyError) as error:
        return jsonify(error=str(error)),400
