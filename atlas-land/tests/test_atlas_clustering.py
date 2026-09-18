from __future__ import annotations

from flask import Flask

import atlas_clustering


def make_client():
    app = Flask(__name__)
    atlas_clustering.register_clustering_blueprint(app)
    return app.test_client()


def json_stat_fixture():
    return {
        "id": ["freq", "geo", "time"],
        "size": [1, 3, 1],
        "value": {"0": 10.0, "1": 20.0, "2": 30.0},
        "dimension": {
            "geo": {
                "category": {
                    "index": {"ES11": 0, "EL30": 1, "FR10": 2},
                    "label": {"ES11": "Galicia", "EL30": "Attiki", "FR10": "Île de France"},
                }
            }
        },
    }


def test_json_stat_uses_dimension_stride_and_country_aliases():
    spanish = atlas_clustering._json_stat_observations(json_stat_fixture(), 2, ("ES",))
    greek = atlas_clustering._json_stat_observations(json_stat_fixture(), 2, ("GR",))
    assert spanish == [{"code": "ES11", "name": "Galicia", "value": 10.0}]
    assert greek == [{"code": "EL30", "name": "Attiki", "value": 20.0}]


def test_kmeans_is_deterministic_and_returns_every_cluster():
    points = [[0.0], [0.1], [4.9], [5.0], [9.9], [10.0]]
    first = atlas_clustering._kmeans(points, 3)
    second = atlas_clustering._kmeans(points, 3)
    assert first == second
    assert set(first[0]) == {0, 1, 2}


def test_status_is_read_only_capability_catalogue():
    response = make_client().get("/api/atlas/clusters/status")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["available"] is True
    assert payload["levels"] == [2, 3]
    assert {item["key"] for item in payload["indicators"]} == {
        "density", "gdp", "employment", "unemployment",
    }


def test_nuts3_rejects_nuts2_only_indicator():
    response = make_client().get(
        "/api/atlas/clusters?level=3&countries=ES&indicators=employment"
    )
    assert response.status_code == 400
    assert "NUTS 2" in response.get_json()["error"]


def test_cluster_endpoint_returns_scoped_map_and_profiles(monkeypatch):
    atlas_clustering._RESULT_CACHE.clear()

    values = {
        "density": [
            {"code": "ES11", "name": "Galicia", "value": 10.0},
            {"code": "ES12", "name": "Asturias", "value": 12.0},
            {"code": "ES13", "name": "Cantabria", "value": 30.0},
            {"code": "ES21", "name": "País Vasco", "value": 35.0},
        ],
        "gdp": [
            {"code": "ES11", "name": "Galicia", "value": 20.0},
            {"code": "ES12", "name": "Asturias", "value": 22.0},
            {"code": "ES13", "name": "Cantabria", "value": 50.0},
            {"code": "ES21", "name": "País Vasco", "value": 55.0},
        ],
    }
    monkeypatch.setattr(
        atlas_clustering,
        "_load_indicator",
        lambda indicator, year, level, countries: (values[indicator], True),
    )
    geometry = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"NUTS_ID": code, "LEVL_CODE": 2},
                "geometry": {"type": "Polygon", "coordinates": []},
            }
            for code in ("ES11", "ES12", "ES13", "ES21", "FR10")
        ],
    }
    monkeypatch.setattr(
        atlas_clustering,
        "_fetch_json_cached",
        lambda url, cache_name, ttl: (geometry, True),
    )

    client = make_client()
    response = client.get(
        "/api/atlas/clusters?level=2&year=2023&countries=ES"
        "&indicators=density,gdp&clusters=2&scaling=zscore"
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["meta"]["complete_regions"] == 4
    assert payload["meta"]["mapped_regions"] == 4
    assert len(payload["profiles"]) == 2
    assert {feature["properties"]["NUTS_ID"] for feature in payload["features"]} == {
        "ES11", "ES12", "ES13", "ES21",
    }
    cached_response = client.get(
        "/api/atlas/clusters?level=2&year=2023&countries=ES"
        "&indicators=density,gdp&clusters=2&scaling=zscore"
    )
    assert cached_response.headers["X-Atlas-Cluster-Cache"] == "HIT"
    assert cached_response.headers["Cache-Control"] == "private, max-age=300"


def test_invalid_geometry_level_is_skipped_instead_of_failing(monkeypatch):
    atlas_clustering._RESULT_CACHE.clear()
    monkeypatch.setattr(
        atlas_clustering,
        "_load_indicator",
        lambda indicator, year, level, countries: ([
            {"code": f"ES1{index}", "name": f"Region {index}", "value": float(index)}
            for index in range(1, 5)
        ], True),
    )
    monkeypatch.setattr(
        atlas_clustering,
        "_fetch_json_cached",
        lambda url, cache_name, ttl: ({
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": {"NUTS_ID": "ES11", "LEVL_CODE": None},
                "geometry": {"type": "Polygon", "coordinates": []},
            }],
        }, True),
    )

    response = make_client().get(
        "/api/atlas/clusters?level=2&countries=ES&indicators=density&clusters=2"
    )
    assert response.status_code == 200
    assert response.get_json()["meta"]["mapped_regions"] == 0
