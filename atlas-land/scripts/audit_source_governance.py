#!/usr/bin/env python3
"""Build a fail-closed inventory of every source family published by Atlas.

This is an engineering evidence generator, not legal approval.  A named open
licence is recorded as declared terms; only the destination acceptance record
can promote a source for commercial production.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


SCHEMA = "nohm.atlas.source-governance.v1"
DATABASE_SPECS = (
    ("methane", "data/gas/processed/atlas_gas.db", "data/gas/processed/manifest.json"),
    ("water", "data/water/processed/atlas_water.db", "data/water/processed/manifest.json"),
    ("liquids", "data/liquids/processed/atlas_liquids.db", "data/liquids/processed/manifest.json"),
    ("logistics", "data/logistics/processed/atlas_logistics.db", "data/logistics/processed/manifest.json"),
    ("grid_access", "data/grid_access/processed/atlas_grid_access.db", "data/grid_access/processed/manifest.json"),
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rights_status(declared_terms: str) -> str:
    value = " ".join(str(declared_terms or "").lower().split())
    if not value:
        return "terms_missing"
    if "indicative mvp" in value or "verify permission" in value:
        return "permission_required"
    named_open_terms = (
        "cc by 4.0", "cc-by-4.0", "cc0", "odbl 1.0",
        "neso open data licence", "copernicus full, free and open",
    )
    if any(term in value for term in named_open_terms):
        return "declared_open_terms"
    return "terms_review_required"


def _database_rows(database: Path) -> list[dict]:
    with sqlite3.connect(f"file:{database.as_posix()}?mode=ro", uri=True) as connection:
        connection.row_factory = sqlite3.Row
        columns = {row[1] for row in connection.execute("PRAGMA table_info(source_registry)")}
        if not columns:
            raise ValueError("source_registry table is missing")
        return [dict(row) for row in connection.execute("SELECT * FROM source_registry ORDER BY source_key")]


def _supplemental_sources(pypsa_root: Path) -> list[dict]:
    citation = pypsa_root / "CITATION.cff"
    checkout_version = None
    if citation.is_file():
        for line in citation.read_text(encoding="utf-8").splitlines():
            if line.startswith("version:"):
                checkout_version = line.split(":", 1)[1].strip()
                break
    network_versions: dict[str, int] = {}
    network_count = 0
    try:
        import h5py
        for network in sorted((pypsa_root / "resources" / "test-elec" / "networks").glob("base_*.nc")):
            # Only the 34 currently published country bases. Historical
            # experimental cNNN cluster files are not served by Atlas.
            if not re.fullmatch(r"base_[A-Z]{2}\.nc", network.name):
                continue
            network_count += 1
            try:
                with h5py.File(network, "r") as source:
                    raw_meta = source.attrs.get("meta")
                if isinstance(raw_meta, bytes):
                    raw_meta = raw_meta.decode("utf-8", errors="replace")
                meta = json.loads(raw_meta) if isinstance(raw_meta, str) else {}
                version = str(meta.get("version") or "version not recorded")
            except (OSError, TypeError, ValueError, json.JSONDecodeError):
                version = "version not recorded"
            network_versions[version] = network_versions.get(version, 0) + 1
    except ImportError:
        pass
    cached_version_summary = ", ".join(
        f"{version}: {count} file{'s' if count != 1 else ''}"
        for version, count in sorted(network_versions.items())
    ) or "cache metadata not inspected"
    return [
        {
            "dataset": "electricity",
            "source_key": "pypsa_eur_networks",
            "title": "PyPSA-Eur cached country networks",
            "publisher": "PyPSA-Eur contributors and upstream data publishers",
            "version": cached_version_summary,
            "source_url": "https://pypsa-eur.readthedocs.io/en/latest/data-sources/",
            "declared_terms": "Composite: PyPSA-Eur data files CC BY 4.0; upstream inputs retain source-specific terms",
            "rights_status": "terms_review_required",
            "retrieved_at": None,
            "notes": (
                f"Each NetCDF records its creating PyPSA-Eur version in meta.version; {network_count} files inspected. "
                f"The current checkout is {checkout_version or 'not recorded'} and must not be substituted for per-file provenance."
            ),
        },
        {
            "dataset": "land",
            "source_key": "natura2000",
            "title": "Natura 2000 protected sites",
            "publisher": "European Environment Agency / European Commission",
            "version": "2025-08-15 local PyPSA raster",
            "source_url": "https://www.eea.europa.eu/en/datahub/datahubitem-view/6fc8ad2d-195d-40f4-bdec-576e7d1268e4",
            "declared_terms": "EEA legal notice and dataset metadata; attribution and source-specific rights apply",
            "rights_status": "terms_review_required",
            "retrieved_at": None,
            "notes": "Derived interactive overview of a staged source raster; not parcel-level evidence.",
        },
        {
            "dataset": "land",
            "source_key": "corine_2006",
            "title": "CORINE Land Cover 2006",
            "publisher": "Copernicus Land Monitoring Service / EEA",
            "version": "CLC 2006 v18.5 local PyPSA archive",
            "source_url": "https://land.copernicus.eu/en/products/corine-land-cover/clc-2006",
            "declared_terms": "Copernicus full, free and open data policy; source citation required",
            "rights_status": "declared_open_terms",
            "retrieved_at": None,
            "notes": "Derived interactive overview; 25 ha source minimum mapping unit remains material.",
        },
        {
            "dataset": "basemap",
            "source_key": "esri_world_dark_gray",
            "title": "Esri World Dark Gray basemap and reference labels",
            "publisher": "Esri and credited data contributors",
            "version": "live tile service",
            "source_url": "https://www.esri.com/en-us/legal/terms/full-master-agreement",
            "declared_terms": "Esri service terms and source-specific contributor attribution",
            "rights_status": "terms_review_required",
            "retrieved_at": None,
            "notes": "External display dependency; not included in local Atlas source databases.",
        },
    ]


def collect_registry(backend_root: Path, pypsa_root: Path, database_specs=DATABASE_SPECS) -> dict:
    entries: list[dict] = []
    findings: list[dict] = []
    for dataset, database_rel, manifest_rel in database_specs:
        database = backend_root / database_rel
        manifest = backend_root / manifest_rel
        if not database.is_file():
            findings.append({"dataset": dataset, "severity": "hold", "message": f"Missing database: {database}"})
            continue
        manifest_hash = sha256(manifest) if manifest.is_file() else None
        if not manifest_hash:
            findings.append({"dataset": dataset, "severity": "hold", "message": f"Missing release manifest: {manifest}"})
        try:
            rows = _database_rows(database)
        except (sqlite3.Error, ValueError) as error:
            findings.append({"dataset": dataset, "severity": "hold", "message": f"Unreadable source registry: {error}"})
            continue
        for row in rows:
            declared_terms = row.get("license") or ""
            entries.append({
                "dataset": dataset,
                "source_key": row.get("source_key"),
                "country_scope": row.get("country_code"),
                "title": row.get("title"),
                "publisher": row.get("publisher"),
                "version": row.get("version"),
                "source_url": row.get("source_url"),
                "declared_terms": declared_terms or None,
                "rights_status": rights_status(declared_terms),
                "retrieved_at": row.get("retrieved_at"),
                "artifact_sha256": row.get("sha256"),
                "release_manifest": manifest_rel if manifest.is_file() else None,
                "release_manifest_sha256": manifest_hash,
                "notes": row.get("notes"),
            })
    entries.extend(_supplemental_sources(pypsa_root))
    entries.sort(key=lambda row: (row["dataset"], str(row["source_key"])))
    counts = {status: sum(row["rights_status"] == status for row in entries) for status in (
        "declared_open_terms", "terms_review_required", "permission_required", "terms_missing"
    )}
    for row in entries:
        if row["rights_status"] != "declared_open_terms":
            findings.append({
                "dataset": row["dataset"], "source_key": row["source_key"], "severity": "hold",
                "message": f"{row['rights_status']}: commercial publication is not approved by this audit",
            })
    return {
        "schema": SCHEMA,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "decision": "HOLD",
        "decision_reason": "Engineering inventory only; accountable data/licensing owner approval is required.",
        "summary": {"source_count": len(entries), **counts, "hold_findings": len(findings)},
        "sources": entries,
        "findings": findings,
    }


def render_markdown(report: dict) -> str:
    lines = [
        "# Nohm Atlas data-source register",
        "",
        "> Status: **HOLD for commercial production**. This generated engineering inventory",
        "> records declared source terms; it is not legal approval. Every source still needs",
        "> an accountable owner, required attribution and destination-release sign-off.",
        "",
        f"Schema: `{report['schema']}`  ",
        f"Generated: `{report['generated_at']}`  ",
        f"Sources: **{report['summary']['source_count']}**; open terms declared: **{report['summary']['declared_open_terms']}**; review/permission/missing: **{report['summary']['source_count'] - report['summary']['declared_open_terms']}**.",
        "",
        "| Dataset | Source | Publisher | Version | Declared terms | Engineering status |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for row in report["sources"]:
        clean = lambda value: str(value or "—").replace("|", "\\|").replace("\n", " ")
        title = clean(row["title"])
        if row.get("source_url"):
            title = f"[{title}]({row['source_url']})"
        lines.append("| " + " | ".join(map(clean, (
            row["dataset"], title, row["publisher"], row["version"],
            row["declared_terms"], row["rights_status"],
        ))) + " |")
    lines.extend([
        "", "## Promotion rule", "",
        "`declared_open_terms` means only that a named/open reuse statement is recorded; it",
        "does not mean the Atlas product complies with attribution, share-alike, database-right,",
        "third-party or trademark obligations. Sources marked `terms_review_required`,",
        "`permission_required` or `terms_missing` keep the production data gate on HOLD.",
        "The immutable release must link this register plus the legal/data-owner decision in",
        "`PRODUCTION_ACCEPTANCE.md`.", "",
    ])
    return "\n".join(lines)


def main() -> int:
    atlas_root = Path(__file__).resolve().parents[1]
    pypsa_root = atlas_root.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend-root", type=Path, default=pypsa_root.parent / "Models" / "2026" / "nova-energy-analyst")
    parser.add_argument("--json", type=Path, default=atlas_root / "data-governance" / "source-register.json")
    parser.add_argument("--markdown", type=Path, default=atlas_root / "DATA_SOURCE_REGISTER.md")
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    report = collect_registry(args.backend_root.resolve(), pypsa_root.resolve())
    if not args.check_only:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        args.markdown.write_text(render_markdown(report), encoding="utf-8")
    print(json.dumps(report["summary"], sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
