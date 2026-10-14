"""Exercise the existing parser without importing its legacy service bootstrap."""
import ast
import logging
import os
import re
from pathlib import Path
from types import SimpleNamespace
import pandas as pd
import pytest
import xarray as xr
from flask import Flask, jsonify, request


def parser_functions():
    source=Path(__file__).resolve().parents[3]/'Models/2026/nova-energy-analyst/app.py'
    tree=ast.parse(source.read_text(encoding='utf-8'))
    selected=[]
    for node in tree.body:
        if isinstance(node,ast.FunctionDef) and node.name in {
            '_decode_nc_value','_extract_pypsa_tables_from_netcdf','pypsa_parse_nc'}:
            node.decorator_list=[];selected.append(node)
    namespace={'logger':logging.getLogger(__name__),'request':request,'jsonify':jsonify,'os':os,'re':re}
    exec(compile(ast.Module(body=selected,type_ignores=[]),str(source),'exec'),namespace)
    return namespace


@pytest.mark.parametrize('compatibility',[False,True])
def test_grid_response_keeps_actual_voltage_changing_branches(tmp_path,compatibility):
    native=tmp_path/'resources/test-elec/networks/base_BE.nc';native.parent.mkdir(parents=True)
    data=xr.Dataset({
        'buses_x':('buses_i',[4.,4.01]),'buses_y':('buses_i',[50.,50.01]),
        'buses_country':('buses_i',['BE','BE']),
        'transformers_bus0':('transformers_i',['a']), 'transformers_bus1':('transformers_i',['b']),
        'transformers_s_nom':('transformers_i',[400.]),'transformers_x':('transformers_i',[.1]),
    },coords={'buses_i':['a','b'],'transformers_i':['voltage-change']})
    data.to_netcdf(native)
    ns=parser_functions()
    tables=ns['_extract_pypsa_tables_from_netcdf'](native)
    assert list(tables['transformers'].index)==['voltage-change']
    network=SimpleNamespace(**tables)
    def load(_):
        if compatibility:raise ImportError('Fixture compatibility path')
        return network
    ns.update(_get_pypsa_source_dir=lambda:str(tmp_path),_load_pypsa_network_compat=load,
        _infer_overlay_dir_from_network_filename=lambda _:'',_boto3_available=False,
        _normalize_pypsa_granularity_prefix=lambda _:'',_json_safe=lambda data:data,
        _apply_pypsa_component_scope=lambda markers,connections,scope:(list(markers.values()),connections))
    app=Flask(__name__)
    with app.test_request_context(json={'filename':'base_BE_full.nc','full_country':'BE',
        'component_scope':'grid','include_geojson_overlays':False}):
        response=app.make_response(ns['pypsa_parse_nc']())
        assert response.status_code==200
        payload=response.get_json()
        assert payload['total_connections']==1
        edge=payload['connections'][0]
        assert edge['type']=='transformer' and edge['collection']=='Transformer'
        assert (edge['from'],edge['to'])==('bus-BE-a','bus-BE-b')
        assert edge['s_nom']==400. and edge['x']==.1
        assert {m['id'] for m in payload['markers']}=={'bus-BE-a','bus-BE-b'}
