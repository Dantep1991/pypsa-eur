from __future__ import annotations

import math
from io import BytesIO
from pathlib import Path
import sys

from flask import Flask
import numpy as np
import pytest
from PIL import Image
from shapely import is_prepared


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from atlas_land import register_land_blueprint  # noqa: E402
import atlas_land


def make_client():
    app = Flask(__name__)
    register_land_blueprint(app)
    return app.test_client()


@pytest.mark.parametrize('scope', ['XK', 'ZZ', 'BE,XK', 'BE,ALL', ',,'])
@pytest.mark.parametrize('path', [
    '/tiles/5/16/10.png?categories=forest', '/inspect?lat=50.85&lng=4.35',
    '/viewport-stats?west=2&south=48&east=7&north=52',
])
def test_unsupported_or_ambiguous_scope_never_becomes_global(scope, path):
    response = make_client().get('/api/atlas/land' + path + '&countries=' + scope)
    assert response.status_code == 422
    assert response.is_json
    assert response.json['code'] == 'unsupported_country_scope'
    assert 'country_scope' in response.json
    assert 'immutable' not in response.headers.get('Cache-Control', '')


def test_normalizer_distinguishes_explicit_global_scope_from_unknown():
    assert atlas_land._normalise_countries('be, BE,fr') == ('BE', 'FR')
    for scope in [None, '', 'ALL', 'europe', '*']:
        assert atlas_land._normalise_countries(scope) == ()
    with pytest.raises(ValueError):
        atlas_land._country_scope_mask(np.asarray([4.35]), np.asarray([50.85]), 'XK')


def test_country_scope_geometry_is_prepared_once_for_tile_point_queries():
    atlas_land._country_scope_geometry.cache_clear()
    geometry = atlas_land._country_scope_geometry('BE,FR')
    assert is_prepared(geometry)
    assert atlas_land._country_scope_geometry('BE,FR') is geometry


def xyz_for(lon: float, lat: float, zoom: int) -> tuple[int, int]:
    x = int((lon + 180.0) / 360.0 * 2**zoom)
    y = int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * 2**zoom)
    return x, y


def test_status_exposes_local_sources_and_screening_limitations():
    response = make_client().get("/api/atlas/land/status")
    payload = response.get_json()
    assert response.status_code == 200
    assert payload["ready"] is True
    assert payload["mode"] == "local-first"
    assert {source["id"] for source in payload["sources"]} == {"natura2000", "corine"}
    assert {category["id"] for category in payload["categories"]} == {
        "protected", "water", "urban", "agriculture", "forest", "industrial"
    }
    assert payload["country_filtering"] is True
    assert {country["code"] for country in payload["countries"]} >= {"BE", "FR", "ES"}
    assert payload["limitations"]


def test_tile_is_a_cacheable_transparent_png():
    zoom = 5
    x, y = xyz_for(2.35, 48.86, zoom)
    response = make_client().get(
        f"/api/atlas/land/tiles/{zoom}/{x}/{y}.png?categories=protected,urban,agriculture&opacity=65"
    )
    assert response.status_code == 200
    assert response.data.startswith(b"\x89PNG\r\n\x1a\n")
    assert len(response.data) > 1_000
    assert "immutable" in response.headers["Cache-Control"]


def test_non_default_land_cover_categories_are_rendered():
    zoom = 7
    x, y = xyz_for(2.35, 48.86, zoom)
    response = make_client().get(
        f"/api/atlas/land/tiles/{zoom}/{x}/{y}.png?categories=agriculture,forest,industrial&opacity=65"
    )
    alpha = np.asarray(Image.open(BytesIO(response.data)))[:, :, 3]
    assert response.headers["X-Atlas-Land-Categories"] == "agriculture,forest,industrial"
    assert np.count_nonzero(alpha) > 0


def test_inspection_reports_statutory_and_land_cover_evidence():
    # This point in Sierra Nevada is protected in the staged 2025 Natura mask.
    response = make_client().get("/api/atlas/land/inspect?lat=37.1&lng=-3.4")
    payload = response.get_json()
    assert response.status_code == 200
    assert payload["protected"] is True
    assert payload["screening"]["role"] == "hard_constraint"
    assert payload["land_cover"]["clc_code"] == 323


def test_viewport_statistics_are_bounded_percentages():
    response = make_client().get(
        "/api/atlas/land/viewport-stats?west=-5&south=42&east=8&north=51&zoom=6"
    )
    payload = response.get_json()
    assert response.status_code == 200
    assert payload["sample_count"] > 0
    assert payload["approximate"] is True
    for value in payload["coverage_percent"].values():
        assert 0 <= value <= 100


def test_country_filter_clips_tile_pixels_and_is_part_of_cache_contract():
    zoom = 7
    x, y = xyz_for(4.35, 50.85, zoom)
    client = make_client()
    unfiltered = client.get(
        f"/api/atlas/land/tiles/{zoom}/{x}/{y}.png?categories=protected,urban,agriculture&opacity=65"
    )
    belgium = client.get(
        f"/api/atlas/land/tiles/{zoom}/{x}/{y}.png?categories=protected,urban,agriculture&opacity=65&countries=BE"
    )
    unfiltered_alpha = np.asarray(Image.open(BytesIO(unfiltered.data)))[:, :, 3]
    belgium_alpha = np.asarray(Image.open(BytesIO(belgium.data)))[:, :, 3]
    assert belgium.headers["X-Atlas-Land-Countries"] == "BE"
    assert np.count_nonzero(belgium_alpha) > 0
    assert np.count_nonzero(belgium_alpha) < np.count_nonzero(unfiltered_alpha)


def test_inspection_reports_when_a_point_is_outside_selected_country_scope():
    client = make_client()
    inside = client.get("/api/atlas/land/inspect?lat=50.85&lng=4.35&countries=BE").get_json()
    outside = client.get("/api/atlas/land/inspect?lat=50.85&lng=4.35&countries=FR").get_json()
    assert inside["country"]["code"] == "BE"
    assert inside["in_scope"] is True
    assert outside["in_scope"] is False
    assert outside["country_scope"] == ["FR"]


def test_viewport_statistics_use_only_selected_country_pixels():
    client = make_client()
    all_payload = client.get(
        "/api/atlas/land/viewport-stats?west=2&south=48&east=7&north=52&zoom=7"
    ).get_json()
    belgium_payload = client.get(
        "/api/atlas/land/viewport-stats?west=2&south=48&east=7&north=52&zoom=7&countries=BE"
    ).get_json()
    assert belgium_payload["country_scope"] == ["BE"]
    assert 0 < belgium_payload["sample_count"] < all_payload["sample_count"]


@pytest.mark.parametrize('bounds', [
    'west=nan&south=40&east=10&north=50',
    'west=0&south=40&east=inf&north=50',
    'west=-181&south=40&east=10&north=50',
    'west=0&south=-91&east=10&north=50',
    'west=0&south=40&east=181&north=50',
    'west=0&south=40&east=10&north=91',
    'west=10&south=40&east=0&north=50',
])
def test_viewport_rejects_invalid_wgs84_before_sampling(bounds, monkeypatch):
    def never_sample(*args, **kwargs):
        pytest.fail('Invalid bounds reached raster sampler')
    monkeypatch.setattr(atlas_land, '_sample_points', never_sample)
    response = make_client().get('/api/atlas/land/viewport-stats?' + bounds)
    assert response.status_code == 400
    assert response.is_json


def test_empty_country_sample_is_unknown_not_zero_constraints():
    payload = make_client().get(
        '/api/atlas/land/viewport-stats?west=-10&south=30&east=-9&north=31&countries=BE'
    ).get_json()
    assert payload['sample_count'] == 0
    assert payload['roles_percent'] is None
    assert payload['coverage_percent'] is None
    assert payload['no_data_reason'] == 'outside_selected_countries'


def test_unknown_corine_codes_are_not_counted_as_available_land(monkeypatch):
    def sample(lon, lat, **kwargs):
        clc = np.full(lon.shape, 255, dtype=np.uint8)
        clc.flat[0] = 0  # Raster nodata is not always 255.
        clc.flat[1] = 50  # Unknown categories must not enter the denominator.
        clc.flat[2] = 3  # One known industrial class.
        return clc, np.zeros(lon.shape, dtype=np.uint8)
    monkeypatch.setattr(atlas_land, '_sample_points', sample)
    payload = make_client().get(
        '/api/atlas/land/viewport-stats?west=2&south=48&east=7&north=52'
    ).get_json()
    assert payload['sample_count'] == 1
    assert payload['scope_sample_count'] == 96 * 96
    assert payload['coverage_sample_percent'] == 0.01
    assert payload['roles_percent']['opportunity'] == 100


def test_no_corine_coverage_is_explicit(monkeypatch):
    monkeypatch.setattr(atlas_land, '_sample_points', lambda lon, lat, **kwargs: (
        np.zeros(lon.shape, dtype=np.uint8), np.zeros(lon.shape, dtype=np.uint8)))
    payload = make_client().get(
        '/api/atlas/land/viewport-stats?west=2&south=48&east=7&north=52'
    ).get_json()
    assert payload['sample_count'] == 0
    assert payload['no_data_reason'] == 'no_local_land_cover'
    assert payload['roles_percent'] is None


@pytest.mark.parametrize('path', [
    '/inspect?lat=50.85&lng=4.35',
    '/viewport-stats?west=2&south=48&east=7&north=52',
])
def test_unavailable_rasters_return_service_error_not_traceback(path, monkeypatch):
    monkeypatch.setattr(atlas_land, '_corine', None)
    monkeypatch.setattr(atlas_land, '_inspect_corine', None)
    response = make_client().get('/api/atlas/land' + path)
    assert response.status_code == 503
    assert response.is_json
    assert response.json['error'] == 'Local land rasters unavailable.'
    assert response.headers['Cache-Control'] == 'no-store'
