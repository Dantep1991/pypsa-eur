#!/usr/bin/env python3
"""Run the combined local ATLAS API through a bounded, production WSGI server.

Waitress can serve lightweight UI/health calls concurrently. ATLAS serializes
NetCDF/HDF5 parsing inside the application because those libraries are not
guaranteed to be thread-safe on the Windows local stack.
"""

from __future__ import annotations

import os
from pathlib import Path
import re
import shutil
import sys
from atlas_runtime_config import (
    resolve_atlas_root, load_shared_nohm_key, server_options, configure_nohm_platform_path,
    load_shared_nohm_voice_key,
)


RUNNER_ROOT = Path(__file__).resolve().parents[1]
ATLAS_ROOT = resolve_atlas_root(RUNNER_ROOT)
LAND_EXTENSION_ROOT = RUNNER_ROOT / "atlas-land"


def _sync_runtime_file(source: Path, destination: Path) -> Path:
    """Mirror a staged data file into the writable local runtime cache."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    source_stat = source.stat()
    if destination.is_file():
        destination_stat = destination.stat()
        if (
            destination_stat.st_size == source_stat.st_size
            and destination_stat.st_mtime_ns >= source_stat.st_mtime_ns
        ):
            return destination
    temporary = destination.with_suffix(destination.suffix + ".copying")
    shutil.copy2(source, temporary)
    os.replace(temporary, destination)
    return destination


def _configure_runtime_atlas_databases() -> None:
    """Point SQLite-backed Atlas layers at workspace-local runtime copies.

    Managed Codex workspaces can expose the staged product repository through
    a read-only filesystem boundary. Ordinary file inspection still works, but
    SQLite cannot open those databases because it may create lock/journal files.
    The launcher therefore keeps a byte-identical local runtime mirror; source
    data remains authoritative and is recopied only when its size or timestamp
    changes.
    """
    import atlas_gas
    import atlas_liquids
    import atlas_logistics
    import atlas_water
    import atlas_grid_access

    runtime_root = Path(
        os.getenv("NOHM_ATLAS_RUNTIME_DATA", str(RUNNER_ROOT / ".atlas-runtime"))
    )
    configurations = (
        (atlas_gas, "gas", "GAS_DB_PATH", "GAS_MANIFEST_PATH"),
        (atlas_water, "water", "WATER_DB_PATH", "WATER_MANIFEST_PATH"),
        (atlas_liquids, "liquids", "LIQUIDS_DB_PATH", "LIQUIDS_MANIFEST_PATH"),
        (atlas_logistics, "logistics", "LOGISTICS_DB_PATH", "LOGISTICS_MANIFEST_PATH"),
        (atlas_grid_access, "grid_access", "GRID_ACCESS_DB_PATH", "GRID_ACCESS_MANIFEST_PATH"),
    )
    for module, carrier, database_attribute, manifest_attribute in configurations:
        source_database = Path(getattr(module, database_attribute))
        source_manifest = Path(getattr(module, manifest_attribute))
        carrier_root = runtime_root / carrier
        if module is atlas_grid_access:
            module.GRID_ACCESS_SOURCE_DB_PATH = source_database
            module.GRID_ACCESS_SOURCE_MANIFEST_PATH = source_manifest
        setattr(
            module,
            database_attribute,
            _sync_runtime_file(source_database, carrier_root / source_database.name),
        )
        if source_manifest.is_file():
            setattr(
                module,
                manifest_attribute,
                _sync_runtime_file(source_manifest, carrier_root / source_manifest.name),
            )


configure_nohm_platform_path()
# Legacy OpenAI configuration now applies to speech/other old modalities only.
# Map planning uses Nohm's shared text client and its existing secret resolver.
load_shared_nohm_key()
load_shared_nohm_voice_key()
# This standalone local product must never open an OAuth browser or wait on
# legacy Google log storage. Other launchers can still select Google explicitly.
os.environ.setdefault("NOHM_ATLAS_LOCAL_LOGS", "1")
os.chdir(ATLAS_ROOT)
sys.path.insert(0, str(ATLAS_ROOT))

print("[Atlas startup] Loading API modules", flush=True)
import app as atlas  # noqa: E402

print("[Atlas startup] Preparing local data runtime", flush=True)
_configure_runtime_atlas_databases()

# The land/constraint layer lives beside the PyPSA rasters so it remains fully
# local and can be developed independently of infrastructure carriers.
sys.path.insert(0, str(LAND_EXTENSION_ROOT))
from atlas_land import register_land_blueprint  # noqa: E402
from atlas_voice import register_voice_blueprint  # noqa: E402
from atlas_clustering import register_clustering_blueprint  # noqa: E402

register_land_blueprint(atlas.app)
register_voice_blueprint(atlas.app)
register_clustering_blueprint(atlas.app)
print("[Atlas startup] Land, voice and clustering extensions ready", flush=True)


_LAND_CATEGORY_ORDER = ("protected", "water", "urban", "agriculture", "forest", "industrial")
_LAND_COUNTRY_ALIASES = {
    "AL": ("albania",), "AM": ("armenia",), "AT": ("austria",), "BA": ("bosnia", "bosnia and herzegovina"),
    "BE": ("belgium",), "BG": ("bulgaria",), "BY": ("belarus",), "CH": ("switzerland",),
    "CZ": ("czechia", "czech republic"), "DE": ("germany",), "DK": ("denmark",), "EE": ("estonia",),
    "ES": ("spain",), "FI": ("finland",), "FR": ("france",), "GB": ("united kingdom", "great britain", "britain", "uk"),
    "GR": ("greece",), "HR": ("croatia",), "HU": ("hungary",), "IE": ("ireland",), "IT": ("italy",),
    "LT": ("lithuania",), "LU": ("luxembourg",), "LV": ("latvia",), "MD": ("moldova",),
    "ME": ("montenegro",), "MK": ("north macedonia", "macedonia"), "MT": ("malta",),
    "NL": ("netherlands", "holland"), "NO": ("norway",), "PL": ("poland",), "PT": ("portugal",),
    "RO": ("romania",), "RS": ("serbia",), "RU": ("russia",), "SE": ("sweden",),
    "SI": ("slovenia",), "SK": ("slovakia",), "TR": ("turkey",), "UA": ("ukraine",),
}


def _land_agent_params(message: str) -> dict | None:
    """Return the map-agent contract for land/siting language, if present."""
    text = re.sub(r"[^a-z0-9%]+", " ", str(message or "").lower()).strip()
    if not re.search(
        r"\b(land (and )?constraints?|land overlay|land (country )?(filter|scope)|siting constraints?|site constraints?|"
        r"protected (areas?|sites?)|natura ?2000|natura?l ?3000|agricultur(e|al) land|forest(ed)? land|"
        r"natural land|built up land|urban land|wetlands?|water constraints?|industrial land|brownfields?)\b",
        text,
    ):
        return None
    if re.search(r"\b(hide|disable|remove|close|turn off) (the )?(land (and )?constraints?|siting constraints?|land overlay)\b", text):
        return {"visible": False}
    categories = []
    patterns = (
        ("protected", r"\b(protected|natura ?2000|natura?l ?3000|conservation)\b"),
        ("water", r"\b(water|wetland|marsh|peat|bog)\w*\b"),
        ("urban", r"\b(urban|built up)\b"),
        ("agriculture", r"\b(agricultur|arable|pasture|cropland)\w*\b"),
        ("forest", r"\b(forest|natural land|scrub|heath)\w*\b"),
        ("industrial", r"\b(industrial|brownfield|port land|airport land|construction land)\w*\b"),
    )
    for category, pattern in patterns:
        if re.search(pattern, text):
            categories.append(category)
    params = {"visible": True, "mode": "replace"}
    if categories:
        params["categories"] = categories
        if re.search(r"\b(hide|remove|exclude|disable)\b", text):
            params["mode"] = "hide"
        elif re.search(r"\b(add|include|also)\b", text) or re.search(r"^(please )?overlay\b", text):
            params["mode"] = "add"
    opacity = re.search(r"\b(opacity|transparency) (to |at )?(\d{1,3}) ?(percent|%)?", text)
    if opacity:
        opacity_value = int(opacity.group(3))
    else:
        trailing_opacity = re.search(r"\b(\d{1,3}) ?(percent|%) (opacity|transparency)\b", text)
        opacity_value = int(trailing_opacity.group(1)) if trailing_opacity else None
    if opacity_value is not None:
        params["opacity"] = max(20, min(100, opacity_value))
    padded = f" {text} "
    country_codes = [
        code for code, aliases in _LAND_COUNTRY_ALIASES.items()
        if any(f" {alias} " in padded for alias in aliases)
    ]
    all_country_scope = bool(re.search(
        r"\b(all (of )?europe|all countries|clear (the )?land (country )?filter|no country filter)\b",
        text,
    ))
    if country_codes or all_country_scope:
        params["countries"] = country_codes
        params["country_mode"] = (
            "replace" if all_country_scope
            else "remove" if re.search(r"\b(remove|exclude)\b", text)
            else "add" if re.search(r"\b(add|include|also)\b", text)
            else "replace"
        )
    return params


def _extend_land_map_agent() -> None:
    """Teach the existing fast-planner/judge loop the land control contract."""
    atlas._MAP_AGENT_INTENT_NAMES.add("set_land_constraints")
    original_interpret = atlas._interpret_map_agent_command_with_ai
    original_compact = atlas._compact_map_agent_judge_context
    original_judge = atlas._judge_map_agent_result_with_ai

    def interpret(message, map_context=None, conversation_history=None):
        params = _land_agent_params(message)
        if params is not None:
            action = {"intent": "set_land_constraints", "params": params}
            return {
                "normalized_command": str(message or "").strip(),
                "intent": action["intent"],
                "params": params,
                "actions": [action],
                "confidence": 0.99,
                "provider": "atlas-land-control-contract",
            }
        return original_interpret(message, map_context=map_context, conversation_history=conversation_history)

    def compact(value):
        result = original_compact(value)
        if isinstance(value, dict) and "landConstraints" in value:
            result["landConstraints"] = value.get("landConstraints")
        return result

    def judge(message, planned_actions, before_context, after_context, execution_notes=None):
        land_actions = [
            action for action in (planned_actions or [])
            if isinstance(action, dict) and action.get("intent") == "set_land_constraints"
        ]
        if not land_actions:
            return original_judge(message, planned_actions, before_context, after_context, execution_notes)
        params = {**(land_actions[-1].get("params") or {}), **(_land_agent_params(message) or {})}
        after = (after_context or {}).get("landConstraints") or {}
        visible_ok = bool(after.get("enabled")) == bool(params.get("visible", True))
        requested = set(params.get("categories") or [])
        observed = set(after.get("categories") or [])
        mode = str(params.get("mode") or "replace").lower()
        categories_ok = True
        if requested:
            categories_ok = (
                observed == requested if mode == "replace"
                else requested.issubset(observed) if mode == "add"
                else requested.isdisjoint(observed) if mode == "hide"
                else False
            )
        opacity_ok = True
        if params.get("opacity") is not None:
            opacity_ok = abs(float(after.get("opacity", -999)) - float(params["opacity"])) < 1
        requested_countries = set(params.get("countries") or [])
        observed_countries = set(after.get("countries") or [])
        country_mode = str(params.get("country_mode") or "replace").lower()
        countries_ok = True
        if "countries" in params:
            countries_ok = (
                observed_countries == requested_countries if country_mode == "replace"
                else requested_countries.issubset(observed_countries) if country_mode == "add"
                else requested_countries.isdisjoint(observed_countries) if country_mode == "remove"
                else False
            )
        if visible_ok and categories_ok and opacity_ok and countries_ok:
            return {
                "verdict": "pass",
                "corrections": [],
                "summary": "the observed Land & Constraints overlay matches the requested visibility, classes, country scope, and opacity.",
                "confidence": 1.0,
                "provider": "atlas-land-state-judge",
            }
        return {
            "verdict": "repair",
            "corrections": [{"intent": "set_land_constraints", "params": params}],
            "summary": "the Land & Constraints state did not yet match, so the requested state will be re-applied.",
            "confidence": 1.0,
            "provider": "atlas-land-state-judge",
        }

    atlas._interpret_map_agent_command_with_ai = interpret
    atlas._compact_map_agent_judge_context = compact
    atlas._judge_map_agent_result_with_ai = judge


_extend_land_map_agent()


@atlas.app.get("/api/atlas/ready")
def atlas_api_ready():
    """Cheap routing readiness, separate from individual datasets/providers."""
    routes = {str(rule) for rule in atlas.app.url_map.iter_rules()}
    required = {
        "electricity": "/api/pypsa/parse-nc",
        "gas": "/api/atlas/gas/status",
        "water": "/api/atlas/water/status",
        "liquids": "/api/atlas/liquids/status",
        "logistics": "/api/atlas/logistics/status",
        "grid_access": "/api/atlas/grid-access/status",
        "land": "/api/atlas/land/status",
        "voice": "/api/voice/status",
        "clustering": "/api/atlas/clusters/status",
    }
    services = {name: path in routes for name, path in required.items()}
    ready = all(services.values())
    return atlas.jsonify(
        ready=ready, scope="api_routes", services=services,
        note="Dataset and provider availability are reported by each service's status endpoint.",
    ), 200 if ready else 503


# Importable WSGI entry point, with every extension registered.
application = atlas.app


if __name__ == "__main__":
    from waitress import serve

    options = server_options()
    print(f"[Atlas startup] Serving combined API on http://127.0.0.1:{options['port']}", flush=True)
    serve(application, **options)
