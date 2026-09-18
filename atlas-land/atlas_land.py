"""Viewport-first Land & Constraints API for Nohm Atlas.

The service renders local PyPSA/EEA rasters into transparent XYZ tiles.  It
does not require a Carto, Mapbox, or cloud GIS key and it never sends a user's
candidate location to a third party.
"""

from __future__ import annotations

from functools import lru_cache
from io import BytesIO
import json
import math
from pathlib import Path
import threading

from flask import Blueprint, Response, jsonify, request
import numpy as np
from PIL import Image
from pyproj import Transformer
from shapely import contains_xy, intersects_xy, make_valid, prepare, union_all
from shapely.geometry import shape


LAND_ROOT = Path(__file__).resolve().parent
WORKSPACE_ROOT = LAND_ROOT.parent
CORINE_PATH = (
    WORKSPACE_ROOT
    / "data"
    / "corine"
    / "archive"
    / "v18_5"
    / "corine"
    / "g250_clc06_V18_5.tif"
)
CORINE_OVERVIEW_PATH = CORINE_PATH.with_suffix(CORINE_PATH.suffix + ".ovr")
NATURA_PATH = (
    WORKSPACE_ROOT
    / "data"
    / "natura"
    / "archive"
    / "2025-08-15"
    / "natura.tiff"
)
NATURA_OVERVIEW_DIR = LAND_ROOT / "data" / "processed"
COUNTRY_BOUNDARIES_PATH = LAND_ROOT / "app" / "public" / "europe.geojson"

Image.MAX_IMAGE_PIXELS = None
land_blueprint = Blueprint("atlas_land", __name__)
_raster_lock = threading.RLock()
_inspect_lock = threading.RLock()
_to_laea = Transformer.from_crs("EPSG:4326", "EPSG:3035", always_xy=True)


def _load_country_boundaries() -> tuple[dict[str, object], dict[str, str]]:
    payload = json.loads(COUNTRY_BOUNDARIES_PATH.read_text(encoding="utf-8"))
    geometries: dict[str, object] = {}
    names: dict[str, str] = {}
    for feature in payload.get("features", []):
        properties = feature.get("properties") or {}
        code = str(properties.get("ISO2") or "").strip().upper()
        geometry_payload = feature.get("geometry")
        if len(code) != 2 or not geometry_payload:
            continue
        geometry = shape(geometry_payload)
        geometries[code] = make_valid(geometry) if not geometry.is_valid else geometry
        names[code] = str(properties.get("NAME") or code).strip()
    if not geometries:
        raise ValueError("Country boundary file contains no ISO2 geometries")
    return geometries, names


try:
    _country_geometries, _country_names = _load_country_boundaries()
    _country_load_error = None
except Exception as exc:
    _country_geometries, _country_names = {}, {}
    _country_load_error = str(exc)


# Strategic screening groups.  The CLC grid stores GRID_CODE values 1..44;
# labels retain the original three-digit CLC codes for traceability.
CLC_CLASSES = {
    1: (111, "Continuous urban fabric"),
    2: (112, "Discontinuous urban fabric"),
    3: (121, "Industrial or commercial units"),
    4: (122, "Road and rail networks and associated land"),
    5: (123, "Port areas"),
    6: (124, "Airports"),
    7: (131, "Mineral extraction sites"),
    8: (132, "Dump sites"),
    9: (133, "Construction sites"),
    10: (141, "Green urban areas"),
    11: (142, "Sport and leisure facilities"),
    12: (211, "Non-irrigated arable land"),
    13: (212, "Permanently irrigated land"),
    14: (213, "Rice fields"),
    15: (221, "Vineyards"),
    16: (222, "Fruit trees and berry plantations"),
    17: (223, "Olive groves"),
    18: (231, "Pastures"),
    19: (241, "Annual crops associated with permanent crops"),
    20: (242, "Complex cultivation patterns"),
    21: (243, "Agriculture with significant natural vegetation"),
    22: (244, "Agro-forestry areas"),
    23: (311, "Broad-leaved forest"),
    24: (312, "Coniferous forest"),
    25: (313, "Mixed forest"),
    26: (321, "Natural grasslands"),
    27: (322, "Moors and heathland"),
    28: (323, "Sclerophyllous vegetation"),
    29: (324, "Transitional woodland-shrub"),
    30: (331, "Beaches, dunes and sands"),
    31: (332, "Bare rocks"),
    32: (333, "Sparsely vegetated areas"),
    33: (334, "Burnt areas"),
    34: (335, "Glaciers and perpetual snow"),
    35: (411, "Inland marshes"),
    36: (412, "Peat bogs"),
    37: (421, "Salt marshes"),
    38: (422, "Salines"),
    39: (423, "Intertidal flats"),
    40: (511, "Water courses"),
    41: (512, "Water bodies"),
    42: (521, "Coastal lagoons"),
    43: (522, "Estuaries"),
    44: (523, "Sea and ocean"),
}

CATEGORIES = {
    "protected": {
        "label": "Natura 2000",
        "role": "hard_constraint",
        "color": "#ff4d6d",
        "description": "EU Natura 2000 protected-site screening mask.",
        "codes": (),
    },
    "water": {
        "label": "Water & wetlands",
        "role": "hard_constraint",
        "color": "#38bdf8",
        "description": "Marsh, peat, wetland and open-water land-cover classes.",
        "codes": tuple(range(35, 45)),
    },
    "urban": {
        "label": "Built-up land",
        "role": "hard_constraint",
        "color": "#a78bfa",
        "description": "Continuous/discontinuous urban fabric and urban leisure land.",
        "codes": (1, 2, 10, 11),
    },
    "agriculture": {
        "label": "Agricultural land",
        "role": "conditional_constraint",
        "color": "#facc15",
        "description": "Arable, permanent-crop, pasture and mixed agricultural classes.",
        "codes": tuple(range(12, 23)),
    },
    "forest": {
        "label": "Forest & natural land",
        "role": "conditional_constraint",
        "color": "#4ade80",
        "description": "Forest, scrub, heath and natural grassland classes.",
        "codes": tuple(range(23, 30)),
    },
    "industrial": {
        "label": "Industrial & brownfield",
        "role": "opportunity",
        "color": "#22d3ee",
        "description": "Industrial, transport, port, airport, extraction, dump and construction land.",
        "codes": tuple(range(3, 10)),
    },
}

DEFAULT_CATEGORIES = ("protected", "water", "urban")
ROLE_LABELS = {
    "hard_constraint": "Hard screening constraint",
    "conditional_constraint": "Conditional / due-diligence constraint",
    "opportunity": "Previously developed / infrastructure opportunity",
    "other": "Other land cover",
    "unknown": "No local classification",
}


class RasterPyramid:
    """A georeferenced categorical raster with lazy overview readers."""

    def __init__(self, source: Path, origin_x: float, origin_y: float, pixel_size: float):
        self.source = source
        self.origin_x = origin_x
        self.origin_y = origin_y
        self.pixel_size = pixel_size
        self.levels: dict[int, Image.Image] = {}

    def add_level(self, factor: int, image: Image.Image) -> None:
        self.levels[factor] = image

    def factors(self) -> tuple[int, ...]:
        return tuple(sorted(self.levels))

    def nearest_factor(self, target: float) -> int:
        return min(self.levels, key=lambda factor: abs(math.log(max(target, 1.0) / factor, 2)))

    def sample(self, xs: np.ndarray, ys: np.ndarray, target_factor: float = 1.0) -> np.ndarray:
        factor = self.nearest_factor(target_factor)
        image = self.levels[factor]
        col = np.rint((xs - self.origin_x) / (self.pixel_size * factor)).astype(np.int64)
        row = np.rint((self.origin_y - ys) / (self.pixel_size * factor)).astype(np.int64)
        valid = (col >= 0) & (row >= 0) & (col < image.width) & (row < image.height)
        result = np.full(col.shape, 255, dtype=np.uint8)
        if not np.any(valid):
            return result
        min_col, max_col = int(col[valid].min()), int(col[valid].max())
        min_row, max_row = int(row[valid].min()), int(row[valid].max())
        with _raster_lock:
            window = np.asarray(
                image.crop((min_col, min_row, max_col + 1, max_row + 1)),
                dtype=np.uint8,
            )
        result[valid] = window[row[valid] - min_row, col[valid] - min_col]
        return result


def _load_pyramids() -> tuple[RasterPyramid, RasterPyramid]:
    if not CORINE_PATH.is_file() or not NATURA_PATH.is_file():
        missing = [str(path) for path in (CORINE_PATH, NATURA_PATH) if not path.is_file()]
        raise FileNotFoundError("Missing land raster(s): " + ", ".join(missing))

    corine = RasterPyramid(CORINE_PATH, -2_700_000.0, 5_500_000.0, 250.0)
    if CORINE_OVERVIEW_PATH.is_file():
        probe = Image.open(CORINE_OVERVIEW_PATH)
        for frame in range(getattr(probe, "n_frames", 1)):
            reader = Image.open(CORINE_OVERVIEW_PATH)
            reader.seek(frame)
            corine.add_level(2 ** (frame + 1), reader)

    natura = RasterPyramid(NATURA_PATH, 2_232_800.0, 5_700_800.0, 100.0)
    for factor in (4, 16, 64, 256):
        overview = NATURA_OVERVIEW_DIR / f"natura-2025-08-15-x{factor}.tiff"
        if overview.is_file():
            natura.add_level(factor, Image.open(overview))
    return corine, natura


try:
    _corine, _natura = _load_pyramids()
    _inspect_corine = Image.open(CORINE_OVERVIEW_PATH)
    _inspect_corine.seek(0)  # 2x source = 500 m
    _inspect_natura = Image.open(NATURA_OVERVIEW_DIR / "natura-2025-08-15-x4.tiff")
    _load_error = None
except Exception as exc:  # status endpoint still explains what is missing
    _corine = _natura = None
    _inspect_corine = _inspect_natura = None
    _load_error = str(exc)


def _tile_lon_lat(z: int, x: int, y: int, size: int = 256) -> tuple[np.ndarray, np.ndarray]:
    grid = (np.arange(size, dtype=np.float64) + 0.5) / size
    tile_count = 2**z
    lon = ((x + grid) / tile_count) * 360.0 - 180.0
    mercator_y = math.pi * (1.0 - 2.0 * ((y + grid) / tile_count))
    lat = np.degrees(np.arctan(np.sinh(mercator_y)))
    return np.meshgrid(lon, lat)


def _factor_for_zoom(z: int, source_resolution_m: float) -> float:
    # Web-Mercator metres per output pixel at the equator. The pyramid picks
    # the nearest available factor; this bounds each TIFF crop around tile size.
    return max(1.0, (156543.03392804097 / (2**z)) / source_resolution_m)


def _normalise_categories(raw: str | None) -> tuple[str, ...]:
    if raw is None:
        return DEFAULT_CATEGORIES
    requested = [value.strip().lower() for value in raw.split(",") if value.strip()]
    if "all" in requested:
        return tuple(CATEGORIES)
    requested_set = set(requested)
    return tuple(category for category in CATEGORIES if category in requested_set)


class UnsupportedCountryScope(ValueError):
    def __init__(self, requested):
        self.requested = tuple(requested)
        super().__init__('Land overlay unavailable for the complete requested country scope; choose supported countries or explicitly choose all coverage.')


@land_blueprint.errorhandler(UnsupportedCountryScope)
def unsupported_country_scope(error):
    response = jsonify({'code': 'unsupported_country_scope', 'error': str(error),
                        'country_scope': list(error.requested),
                        'unsupported_countries': [code for code in error.requested if code not in _country_geometries]})
    response.headers['Cache-Control'] = 'no-store'
    return response, 422


def _normalise_countries(raw: str | None) -> tuple[str, ...]:
    """Only an explicitly unrestricted request may become an empty scope."""
    if not raw:
        return ()
    requested = tuple(sorted({value.strip().upper() for value in raw.split(',') if value.strip()}))
    if len(requested) == 1 and requested[0] in {'ALL', 'EUROPE', '*'}:
        return ()
    if not requested or any(code not in _country_geometries for code in requested):
        raise UnsupportedCountryScope(requested)
    return requested


@lru_cache(maxsize=128)
def _country_scope_geometry(countries_csv: str):
    countries = _normalise_countries(countries_csv)
    if not countries:
        return None
    geometry = union_all([_country_geometries[code] for code in countries])
    # A country union contains tens of thousands of coastline vertices. The
    # land renderer tests all 65,536 tile pixels against that same geometry;
    # without a prepared spatial index this can take tens of seconds and tie
    # up every web worker. Preparation is in-place in Shapely 2 and the
    # lru_cache keeps the indexed geometry for every later tile in this scope.
    prepare(geometry)
    return geometry


def _country_scope_mask(lon: np.ndarray, lat: np.ndarray, countries_csv: str) -> np.ndarray:
    geometry = _country_scope_geometry(countries_csv)
    if geometry is None:
        return np.ones(lon.shape, dtype=bool)
    return np.asarray(contains_xy(geometry, lon, lat) | intersects_xy(geometry, lon, lat), dtype=bool)


def _country_at_point(lon: float, lat: float) -> tuple[str | None, str | None]:
    for code, geometry in _country_geometries.items():
        if bool(contains_xy(geometry, lon, lat) or intersects_xy(geometry, lon, lat)):
            return code, _country_names.get(code, code)
    return None, None


def _category_for_clc(code: int) -> str | None:
    for category, spec in CATEGORIES.items():
        if code in spec["codes"]:
            return category
    return None


@lru_cache(maxsize=768)
def _render_tile(
    z: int,
    x: int,
    y: int,
    categories_csv: str,
    opacity_percent: int,
    countries_csv: str = "",
) -> bytes:
    if _corine is None or _natura is None:
        raise RuntimeError(_load_error or "Land rasters unavailable")
    categories = _normalise_categories(categories_csv)
    lon, lat = _tile_lon_lat(z, x, y)
    country_scope = _country_scope_mask(lon, lat, countries_csv)
    if not np.any(country_scope):
        buffer = BytesIO()
        Image.fromarray(np.zeros((*lon.shape, 4), dtype=np.uint8)).save(buffer, format="PNG", optimize=True)
        return buffer.getvalue()
    laea_x, laea_y = _to_laea.transform(lon, lat)
    clc = _corine.sample(
        laea_x,
        laea_y,
        _factor_for_zoom(z, _corine.pixel_size),
    )
    natura = _natura.sample(
        laea_x,
        laea_y,
        _factor_for_zoom(z, _natura.pixel_size),
    )

    rgba = np.zeros((*clc.shape, 4), dtype=np.uint8)
    opacity = int(round(255 * max(0.15, min(1.0, opacity_percent / 100.0))))
    # Low-to-high priority; statutory and water constraints remain legible.
    for category in ("agriculture", "forest", "industrial", "urban", "water", "protected"):
        if category not in categories:
            continue
        if category == "protected":
            mask = natura == 1
        else:
            mask = np.isin(clc, CATEGORIES[category]["codes"])
        color = CATEGORIES[category]["color"].lstrip("#")
        rgb = tuple(int(color[index : index + 2], 16) for index in (0, 2, 4))
        rgba[mask, :3] = rgb
        rgba[mask, 3] = opacity
        if category == "protected":
            # A subtle hatch differentiates legal protection from ordinary
            # land cover even for colour-vision deficiencies.
            yy, xx = np.indices(mask.shape)
            hatch = mask & (((xx + yy) % 9) < 3)
            rgba[hatch, :3] = (255, 148, 166)
            rgba[hatch, 3] = min(255, opacity + 35)

    rgba[~country_scope, 3] = 0

    buffer = BytesIO()
    Image.fromarray(rgba).save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def _sample_points(lon: np.ndarray, lat: np.ndarray, zoom: int = 9) -> tuple[np.ndarray, np.ndarray]:
    if _corine is None or _natura is None:
        raise RuntimeError(_load_error or "Land rasters unavailable")
    xs, ys = _to_laea.transform(lon, lat)
    return (
        _corine.sample(xs, ys, _factor_for_zoom(zoom, _corine.pixel_size)),
        _natura.sample(xs, ys, _factor_for_zoom(zoom, _natura.pixel_size)),
    )


def _source_payload() -> list[dict]:
    return [
        {
            "id": "natura2000",
            "title": "Natura 2000 protected sites",
            "provider": "European Environment Agency / European Commission",
            "snapshot": "2025-08-15 local PyPSA raster",
            "resolution_m": 100,
            "interactive_resolution_m": 400,
            "source_url": "https://www.eea.europa.eu/en/datahub/datahubitem-view/6fc8ad2d-195d-40f4-bdec-576e7d1268e4",
            "local": True,
        },
        {
            "id": "corine",
            "title": "CORINE Land Cover",
            "provider": "Copernicus Land Monitoring Service / EEA",
            "snapshot": "CLC 2006 v18.5 local PyPSA archive",
            "resolution_m": 250,
            "interactive_resolution_m": 500,
            "source_url": "https://land.copernicus.eu/en/products/corine-land-cover",
            "local": True,
        },
    ]


@land_blueprint.get("/api/atlas/land/status")
def land_status():
    ready = _corine is not None and _natura is not None and bool(_country_geometries)
    return jsonify(
        {
            "ready": ready,
            "mode": "local-first",
            "api_version": "1.3",
            "coverage": "European coverage supplied by the staged rasters",
            "country_filtering": True,
            "countries": [
                {"code": code, "name": _country_names[code]}
                for code in sorted(_country_names, key=lambda item: (_country_names[item], item))
            ],
            "categories": [
                {key: value for key, value in spec.items() if key != "codes"} | {"id": category}
                for category, spec in CATEGORIES.items()
            ],
            "defaults": list(DEFAULT_CATEGORIES),
            "sources": _source_payload(),
            "limitations": [
                "Strategic screening only; not parcel, ownership, permitting or legal advice.",
                "CORINE has a 25 ha minimum mapping unit and does not resolve small sites.",
                "Interactive tiles use lossless categorical overviews (400 m Natura; 500 m CORINE) for responsive strategic screening.",
                "A visible opportunity class is not proof that land is developable.",
                "National and local planning constraints require a later due-diligence stage.",
            ],
            "error": _load_error or _country_load_error,
            "pyramids": {
                "corine": list(_corine.factors()) if _corine else [],
                "natura": list(_natura.factors()) if _natura else [],
            },
        }
    ), (200 if ready else 503)


@land_blueprint.get("/api/atlas/land/tiles/<int:z>/<int:x>/<int:y>.png")
def land_tile(z: int, x: int, y: int):
    if z < 0 or z > 16 or x < 0 or y < 0 or x >= 2**z or y >= 2**z:
        return jsonify({"error": "Invalid XYZ tile coordinate"}), 400
    categories = _normalise_categories(request.args.get("categories"))
    countries = _normalise_countries(request.args.get("countries"))
    try:
        opacity = int(round(float(request.args.get("opacity", "68"))))
    except ValueError:
        opacity = 68
    try:
        payload = _render_tile(
            z,
            x,
            y,
            ",".join(categories),
            max(15, min(100, opacity)),
            ",".join(countries),
        )
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503
    response = Response(payload, mimetype="image/png")
    response.headers["Cache-Control"] = "public, max-age=604800, immutable"
    response.headers["X-Atlas-Land-Categories"] = ",".join(categories)
    response.headers["X-Atlas-Land-Countries"] = ",".join(countries) or "all"
    return response


@land_blueprint.get("/api/atlas/land/inspect")
def inspect_land():
    try:
        lat = float(request.args["lat"])
        lon = float(request.args.get("lng", request.args.get("lon")))
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "lat and lng must be valid numbers"}), 400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({"error": "Coordinate outside WGS84 bounds"}), 400
    countries = _normalise_countries(request.args.get("countries"))
    if _inspect_corine is None or _inspect_natura is None:
        return _rasters_unavailable_response()
    country_code, country_name = _country_at_point(lon, lat)
    in_scope = not countries or bool(country_code in countries)
    # Dedicated overview readers keep an interactive click out of the first
    # batch of XYZ tile work. This intentionally matches the strategic map
    # resolution rather than implying parcel-level precision.
    x_laea, y_laea = _to_laea.transform(lon, lat)
    corine_col = round((x_laea + 2_700_000.0) / 500.0)
    corine_row = round((5_500_000.0 - y_laea) / 500.0)
    natura_col = round((x_laea - 2_232_800.0) / 400.0)
    natura_row = round((5_700_800.0 - y_laea) / 400.0)
    with _inspect_lock:
        grid_code = int(_inspect_corine.getpixel((corine_col, corine_row))) if (
            0 <= corine_col < _inspect_corine.width and 0 <= corine_row < _inspect_corine.height
        ) else 255
        protected = bool(_inspect_natura.getpixel((natura_col, natura_row)) == 1) if (
            0 <= natura_col < _inspect_natura.width and 0 <= natura_row < _inspect_natura.height
        ) else False
    category = _category_for_clc(grid_code)
    clc_code, label = CLC_CLASSES.get(grid_code, (None, "Outside local CORINE coverage"))
    if protected:
        role = "hard_constraint"
    elif category:
        role = CATEGORIES[category]["role"]
    elif grid_code in CLC_CLASSES:
        role = "other"
    else:
        role = "unknown"
    return jsonify(
        {
            "coordinate": {"latitude": lat, "longitude": lon},
            "country": {"code": country_code, "name": country_name},
            "country_scope": list(countries),
            "in_scope": in_scope,
            "protected": protected,
            "land_cover": {
                "grid_code": grid_code if grid_code in CLC_CLASSES else None,
                "clc_code": clc_code,
                "label": label,
                "category": category,
            },
            "screening": {"role": role, "label": ROLE_LABELS[role]},
            "provenance": [source["id"] for source in _source_payload()],
            "disclaimer": "Strategic screening result; verify against current local planning and environmental records.",
        }
    )


def _rasters_unavailable_response():
    response = jsonify({"error": "Local land rasters unavailable."})
    response.headers["Cache-Control"] = "no-store"
    return response, 503


@land_blueprint.get("/api/atlas/land/viewport-stats")
def viewport_stats():
    try:
        west = float(request.args["west"])
        south = float(request.args["south"])
        east = float(request.args["east"])
        north = float(request.args["north"])
        zoom = int(request.args.get("zoom", 7))
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "west, south, east and north are required numbers"}), 400
    if not all(math.isfinite(value) for value in (west, south, east, north)) or not (
        -180 <= west < east <= 180 and -90 <= south < north <= 90
    ):
        return jsonify({"error": "Invalid viewport bounds"}), 400
    countries = _normalise_countries(request.args.get("countries"))
    if _corine is None or _natura is None:
        return _rasters_unavailable_response()
    # Fixed sample count keeps pan/zoom response time predictable.
    grid_size = 96
    lon_values = np.linspace(west, east, grid_size)
    lat_values = np.linspace(south, north, grid_size)
    lon, lat = np.meshgrid(lon_values, lat_values)
    try:
        clc, natura = _sample_points(lon, lat, zoom=max(3, min(14, zoom)))
    except RuntimeError:
        return _rasters_unavailable_response()
    scope_mask = _country_scope_mask(lon, lat, ",".join(countries))
    # Only documented CLC classes are evidence. Unknown/nodata pixels must not
    # dilute constraint percentages or imply that unsurveyed land is available.
    valid = np.isin(clc, list(CLC_CLASSES)) & scope_mask
    sample_count = int(np.count_nonzero(valid))
    scope_count = int(np.count_nonzero(scope_mask))
    denominator = max(1, sample_count)
    coverage = {}
    for category, spec in CATEGORIES.items():
        mask = natura == 1 if category == "protected" else np.isin(clc, spec["codes"])
        coverage[category] = round(100.0 * np.count_nonzero(mask & valid) / denominator, 2)
    hard = (natura == 1) | np.isin(clc, CATEGORIES["water"]["codes"] + CATEGORIES["urban"]["codes"])
    conditional = np.isin(clc, CATEGORIES["agriculture"]["codes"] + CATEGORIES["forest"]["codes"])
    return jsonify(
        {
            "sample_count": sample_count,
            "scope_sample_count": scope_count,
            "coverage_sample_percent": round(100.0 * sample_count / scope_count, 2) if scope_count else None,
            "no_data_reason": (None if sample_count else
                               "no_local_land_cover" if scope_count else "outside_selected_countries"),
            "country_scope": list(countries),
            "coverage_percent": coverage if sample_count else None,
            "roles_percent": {
                "hard_constraint": round(100.0 * np.count_nonzero(hard & valid) / denominator, 2),
                "conditional_constraint": round(100.0 * np.count_nonzero(conditional & valid) / denominator, 2),
                "opportunity": coverage["industrial"],
            } if sample_count else None,
            "approximate": True,
            "method": f"{grid_size}x{grid_size} systematic viewport sample",
        }
    )


def register_land_blueprint(app) -> None:
    if "atlas_land" not in app.blueprints:
        app.register_blueprint(land_blueprint)
