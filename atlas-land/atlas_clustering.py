"""Lazy Eurostat regional clustering service for Nohm Atlas."""

from __future__ import annotations

from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
import json
import math
import os
from pathlib import Path
import statistics
import threading
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import Blueprint, jsonify, request


CLUSTER_BLUEPRINT = Blueprint("atlas_clustering", __name__)
EUROSTAT_ROOT = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"
GISCO_URL = "https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_20M_2024_4326.geojson"
PALETTE = ("#dabd1d", "#14b8a6", "#f59e0b", "#8b5cf6", "#ec4899", "#22c55e", "#38bdf8", "#f97316")
COUNTRY_ALIASES = {"GR": "EL", "GB": "UK"}
INDICATORS = {
    "density": {
        "label": "Population density", "short": "Density", "unit": "people / km²",
        "dataset": "demo_r_d3dens", "query": {"unit": "PER_KM2"}, "levels": (2, 3),
    },
    "gdp": {
        "label": "GDP per inhabitant", "short": "GDP / inhabitant", "unit": "PPS",
        "dataset": "nama_10r_3gdp", "query": {"unit": "PPS_EU27_2020_HAB"}, "levels": (2, 3),
    },
    "employment": {
        "label": "Employment rate", "short": "Employment", "unit": "% · age 20–64",
        "dataset": "lfst_r_lfe2emprt", "query": {"unit": "PC", "sex": "T", "age": "Y20-64"}, "levels": (2,),
    },
    "unemployment": {
        "label": "Unemployment rate", "short": "Unemployment", "unit": "% · age 15–74",
        "dataset": "lfst_r_lfu3rt",
        "query": {"unit": "PC", "sex": "T", "age": "Y15-74", "isced11": "TOTAL"}, "levels": (2,),
    },
}

_CACHE_ROOT = Path(os.getenv(
    "NOHM_ATLAS_CLUSTER_CACHE_DIR",
    Path(__file__).parent / ".atlas-runtime" / "clustering",
))
_CACHE_LOCK = threading.RLock()
_RESULT_CACHE: OrderedDict[tuple, dict] = OrderedDict()
_MAX_RESULTS = 24
_MAX_UPSTREAM_BYTES = 32 * 1024 * 1024


class ClusterRequestError(ValueError):
    """A user-visible validation failure."""


def _ordered_categories(index) -> list[str]:
    if isinstance(index, list):
        return [str(value) for value in index]
    if isinstance(index, dict):
        return [str(code) for code, _ in sorted(index.items(), key=lambda item: int(item[1]))]
    raise ClusterRequestError("Eurostat returned an unsupported category index.")


def _json_stat_observations(payload: dict, level: int, countries: tuple[str, ...]) -> list[dict]:
    ids = payload.get("id")
    sizes = payload.get("size")
    dimensions = payload.get("dimension")
    if not isinstance(ids, list) or not isinstance(sizes, list) or not isinstance(dimensions, dict) or len(ids) != len(sizes):
        raise ClusterRequestError("Eurostat returned an unexpected JSON-stat schema.")
    try:
        geo_position = ids.index("geo")
        geo = dimensions["geo"]["category"]
    except (ValueError, KeyError, TypeError) as exc:
        raise ClusterRequestError("Eurostat did not return a geography dimension.") from exc
    unresolved = [name for index, name in enumerate(ids) if name != "geo" and int(sizes[index]) != 1]
    if unresolved:
        raise ClusterRequestError(f"Eurostat requires an explicit {unresolved[0]} selection.")
    stride = math.prod(int(size) for size in sizes[geo_position + 1 :])
    values = payload.get("value") or {}
    labels = geo.get("label") if isinstance(geo, dict) else {}
    labels = labels if isinstance(labels, dict) else {}
    pattern_length = 4 if level == 2 else 5
    prefixes = tuple(COUNTRY_ALIASES.get(code, code) for code in countries)
    rows = []
    for index, code in enumerate(_ordered_categories(geo.get("index"))):
        if len(code) != pattern_length or not code[:2].isalpha() or not code[2:].isalnum():
            continue
        if prefixes and not code.startswith(prefixes):
            continue
        flat_index = index * stride
        if isinstance(values, list):
            value = values[flat_index] if flat_index < len(values) else None
        elif isinstance(values, dict):
            value = values.get(str(flat_index))
        else:
            value = None
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
            continue
        rows.append({"code": code, "name": str(labels.get(code) or code), "value": float(value)})
    return rows


def _quantile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = int(math.floor(position))
    upper = min(len(ordered) - 1, lower + 1)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def _normalise(
    rows: list[dict],
    indicators: tuple[str, ...],
    scaling: str,
    weights: dict[str, float],
) -> list[list[float]]:
    columns = []
    for indicator in indicators:
        values = [float(row["values"][indicator]) for row in rows]
        if scaling == "robust":
            centre = _quantile(values, 0.5)
            spread = _quantile(values, 0.75) - _quantile(values, 0.25)
        else:
            centre = statistics.fmean(values)
            spread = math.sqrt(statistics.fmean((value - centre) ** 2 for value in values))
        spread = spread or 1.0
        # Influence weights the squared-distance objective. The square root
        # makes a 2× selection contribute twice, rather than four times.
        influence = math.sqrt(weights[indicator])
        columns.append([(value - centre) / spread * influence for value in values])
    return [[column[row_index] for column in columns] for row_index in range(len(rows))]


def _distance(left: list[float], right: list[float]) -> float:
    return sum((value - right[index]) ** 2 for index, value in enumerate(left))


def _kmeans(points: list[list[float]], count: int) -> tuple[list[int], list[list[float]]]:
    unique = sorted({tuple(point) for point in points})
    if len(unique) < count:
        raise ClusterRequestError(f"Only {len(unique)} distinct regional profiles are available for {count} clusters.")
    centres = [list(unique[0])]
    while len(centres) < count:
        candidate = max(unique, key=lambda point: min(_distance(list(point), centre) for centre in centres))
        centres.append(list(candidate))
    assignments = [-1] * len(points)
    for _ in range(60):
        next_assignments = [
            min(range(count), key=lambda cluster: (_distance(point, centres[cluster]), cluster))
            for point in points
        ]
        stable = next_assignments == assignments
        assignments = next_assignments
        next_centres = []
        for cluster, centre in enumerate(centres):
            members = [point for index, point in enumerate(points) if assignments[index] == cluster]
            next_centres.append([
                statistics.fmean(point[dimension] for point in members)
                for dimension in range(len(centre))
            ] if members else centre)
        centres = next_centres
        if stable:
            break
    order = sorted(range(count), key=lambda cluster: tuple(centres[cluster]))
    remap = {old: new for new, old in enumerate(order)}
    return [remap[cluster] for cluster in assignments], [centres[old] for old in order]


def _fetch_json_cached(url: str, cache_name: str, ttl_seconds: int) -> tuple[dict, bool]:
    _CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    path = _CACHE_ROOT / cache_name
    with _CACHE_LOCK:
        if path.is_file() and time.time() - path.stat().st_mtime <= ttl_seconds:
            return json.loads(path.read_text(encoding="utf-8")), True
    try:
        request_object = Request(url, headers={"User-Agent": "Nohm-Atlas/1.0"})
        with urlopen(request_object, timeout=35) as response:  # nosec B310 - fixed official HTTPS hosts
            body = response.read(_MAX_UPSTREAM_BYTES + 1)
        if len(body) > _MAX_UPSTREAM_BYTES:
            raise RuntimeError("Upstream response exceeded the Atlas safety limit.")
        payload = json.loads(body.decode("utf-8"))
        if not isinstance(payload, dict):
            raise RuntimeError("Upstream response was not a JSON object.")
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        os.replace(temporary, path)
        return payload, False
    except Exception:
        with _CACHE_LOCK:
            if path.is_file():
                return json.loads(path.read_text(encoding="utf-8")), True
        raise


def _load_indicator(
    indicator: str,
    year: int,
    level: int,
    countries: tuple[str, ...],
) -> tuple[list[dict], bool]:
    definition = INDICATORS[indicator]
    parameters = {"lang": "en", "time": year, **definition["query"]}
    url = f"{EUROSTAT_ROOT}/{definition['dataset']}?{urlencode(parameters)}"
    payload, cached = _fetch_json_cached(
        url,
        f"{definition['dataset']}-{year}.json",
        24 * 60 * 60,
    )
    return _json_stat_observations(payload, level, countries), cached


def _parse_request():
    try:
        level = int(request.args.get("level", "2"))
        year = int(request.args.get("year", "2023"))
        cluster_count = int(request.args.get("clusters", "4"))
    except ValueError as exc:
        raise ClusterRequestError("Level, year and clusters must be integers.") from exc
    if level not in (2, 3):
        raise ClusterRequestError("NUTS level must be 2 or 3.")
    if year < 2000 or year > time.gmtime().tm_year + 1:
        raise ClusterRequestError("Reference year is outside the supported range.")
    if cluster_count < 2 or cluster_count > len(PALETTE):
        raise ClusterRequestError(f"Clusters must be between 2 and {len(PALETTE)}.")
    scaling = request.args.get("scaling", "zscore").strip().lower()
    if scaling not in {"zscore", "robust"}:
        raise ClusterRequestError("Scaling must be zscore or robust.")
    indicators = tuple(dict.fromkeys(
        part.strip().lower()
        for part in request.args.get("indicators", "density,gdp,employment").split(",")
        if part.strip()
    ))
    if not indicators or any(indicator not in INDICATORS for indicator in indicators):
        raise ClusterRequestError("One or more Eurostat indicators are unsupported.")
    if any(level not in INDICATORS[indicator]["levels"] for indicator in indicators):
        raise ClusterRequestError("Employment indicators are available at NUTS 2 only.")
    countries = tuple(dict.fromkeys(
        part.strip().upper()
        for part in request.args.get("countries", "").split(",")
        if part.strip()
    ))
    if not countries or len(countries) > 50 or any(len(code) != 2 or not code.isalpha() for code in countries):
        raise ClusterRequestError("Select between 1 and 50 two-letter country codes.")
    weights = {indicator: 1.0 for indicator in indicators}
    for item in request.args.get("weights", "").split(","):
        if not item.strip():
            continue
        try:
            key, raw_value = item.split(":", 1)
            value = float(raw_value)
        except ValueError as exc:
            raise ClusterRequestError("Weights must use indicator:value pairs.") from exc
        if key not in weights or value < 0.25 or value > 4 or not math.isfinite(value):
            raise ClusterRequestError("Each active indicator weight must be between 0.25 and 4.")
        weights[key] = value
    return level, year, countries, indicators, weights, cluster_count, scaling


def _build_result(
    level: int,
    year: int,
    countries: tuple[str, ...],
    indicators: tuple[str, ...],
    weights: dict[str, float],
    cluster_count: int,
    scaling: str,
) -> dict:
    # The independent Eurostat series and GISCO geometry are fetched with a
    # small bounded pool. A cold request therefore waits for the slowest source
    # rather than the sum of every upstream request; warm reads use disk cache.
    with ThreadPoolExecutor(max_workers=min(5, len(indicators) + 1)) as executor:
        indicator_futures = [
            executor.submit(_load_indicator, indicator, year, level, countries)
            for indicator in indicators
        ]
        geometry_future = executor.submit(
            _fetch_json_cached,
            GISCO_URL,
            "NUTS_RG_20M_2024_4326.geojson",
            7 * 24 * 60 * 60,
        )
        loaded_series = [future.result() for future in indicator_futures]
        geometry, geometry_cached = geometry_future.result()
    series = [values for values, _ in loaded_series]
    cache_hits = [cached for _, cached in loaded_series]
    joined: dict[str, dict] = {}
    for indicator, values in zip(indicators, series):
        for item in values:
            row = joined.setdefault(
                item["code"],
                {"code": item["code"], "name": item["name"], "values": {}},
            )
            row["values"][indicator] = item["value"]
    rows = sorted(
        (
            row for row in joined.values()
            if all(indicator in row["values"] for indicator in indicators)
        ),
        key=lambda row: row["code"],
    )
    if len(rows) < cluster_count:
        raise ClusterRequestError("Too few complete regional observations for this configuration.")
    assignments, _ = _kmeans(
        _normalise(rows, indicators, scaling, weights),
        cluster_count,
    )
    assignment_by_code = {
        row["code"]: cluster for row, cluster in zip(rows, assignments)
    }
    row_by_code = {row["code"]: row for row in rows}
    features = []
    for feature in geometry.get("features", []):
        properties = feature.get("properties") or {}
        code = str(properties.get("NUTS_ID") or "")
        try:
            feature_level = int(properties.get("LEVL_CODE", -1))
        except (TypeError, ValueError):
            continue
        if feature_level != level or code not in assignment_by_code:
            continue
        cluster = assignment_by_code[code]
        row = row_by_code[code]
        values_label = " · ".join(
            f"{INDICATORS[key]['short']} {row['values'][key]:,.1f}"
            for key in indicators
        )
        features.append({
            "type": "Feature",
            "geometry": feature.get("geometry"),
            "properties": {
                "NUTS_ID": code,
                "name": f"{row['name']} · Cluster {cluster + 1} · {values_label}",
                "region_name": row["name"],
                "cluster": cluster + 1,
                "values": row["values"],
                "color": PALETTE[cluster],
                "fill": PALETTE[cluster],
            },
        })
    profiles = []
    for cluster in range(cluster_count):
        members = [
            row for row, assignment in zip(rows, assignments)
            if assignment == cluster
        ]
        profiles.append({
            "cluster": cluster + 1,
            "color": PALETTE[cluster],
            "regions": len(members),
            "averages": {
                indicator: statistics.fmean(
                    row["values"][indicator] for row in members
                )
                for indicator in indicators
            },
        })
    for row, assignment in zip(rows, assignments):
        row["cluster"] = assignment + 1
    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "level": level,
            "year": year,
            "countries": list(countries),
            "indicators": list(indicators),
            "weights": weights,
            "clusters": cluster_count,
            "scaling": scaling,
            "complete_regions": len(rows),
            "mapped_regions": len(features),
            "source": "Eurostat dissemination API + GISCO NUTS 2024",
            "cached": all(cache_hits) and geometry_cached,
        },
        "profiles": profiles,
        "assignments": rows,
    }


@CLUSTER_BLUEPRINT.get("/api/atlas/clusters/status")
def cluster_status():
    return jsonify(
        available=True,
        levels=[2, 3],
        years=[2021, 2022, 2023],
        indicators=[
            {"key": key, **definition}
            for key, definition in INDICATORS.items()
        ],
        source="Eurostat dissemination API + GISCO NUTS 2024",
    )


@CLUSTER_BLUEPRINT.get("/api/atlas/clusters")
def cluster_regions():
    try:
        parsed = _parse_request()
        cache_key = (
            parsed[0], parsed[1], parsed[2], parsed[3],
            tuple(sorted(parsed[4].items())), parsed[5], parsed[6],
        )
        with _CACHE_LOCK:
            cached = _RESULT_CACHE.get(cache_key)
            if cached is not None:
                _RESULT_CACHE.move_to_end(cache_key)
                response = jsonify(cached)
                response.headers["X-Atlas-Cluster-Cache"] = "HIT"
                response.headers["Cache-Control"] = "private, max-age=300"
                return response
        payload = _build_result(*parsed)
        with _CACHE_LOCK:
            _RESULT_CACHE[cache_key] = payload
            _RESULT_CACHE.move_to_end(cache_key)
            while len(_RESULT_CACHE) > _MAX_RESULTS:
                _RESULT_CACHE.popitem(last=False)
        response = jsonify(payload)
        response.headers["X-Atlas-Cluster-Cache"] = "MISS"
        response.headers["Cache-Control"] = "private, max-age=300"
        return response
    except ClusterRequestError as exc:
        return jsonify(error=str(exc)), 400
    except Exception:
        return jsonify(error="Regional clustering data is temporarily unavailable."), 502


def register_clustering_blueprint(app):
    if "atlas_clustering" not in app.blueprints:
        app.register_blueprint(CLUSTER_BLUEPRINT)
