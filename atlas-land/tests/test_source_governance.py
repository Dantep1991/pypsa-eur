import importlib.util
import sqlite3
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "audit_source_governance.py"
SPEC = importlib.util.spec_from_file_location("atlas_source_governance", MODULE_PATH)
SOURCE_GOVERNANCE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SOURCE_GOVERNANCE)
collect_registry = SOURCE_GOVERNANCE.collect_registry
render_markdown = SOURCE_GOVERNANCE.render_markdown
rights_status = SOURCE_GOVERNANCE.rights_status


def test_rights_triage_is_fail_closed():
    assert rights_status("CC BY 4.0") == "declared_open_terms"
    assert rights_status("ODbL 1.0") == "declared_open_terms"
    assert rights_status("Indicative MVP use; verify permission") == "permission_required"
    assert rights_status("Publisher terms") == "terms_review_required"
    assert rights_status("") == "terms_missing"


def test_registry_reads_source_tables_and_retains_a_hold(tmp_path):
    backend = tmp_path / "backend"
    database = backend / "data/test/processed/test.db"
    database.parent.mkdir(parents=True)
    with sqlite3.connect(database) as connection:
        connection.execute("CREATE TABLE source_registry (source_key TEXT, title TEXT, publisher TEXT, version TEXT, source_url TEXT, license TEXT, retrieved_at TEXT, notes TEXT)")
        connection.execute("INSERT INTO source_registry VALUES (?,?,?,?,?,?,?,?)", (
            "official", "Official source", "Publisher", "2026", "https://example.test/data",
            "Publisher terms", "2026-09-01T00:00:00+00:00", "Evidence only",
        ))
    manifest = database.parent / "manifest.json"
    manifest.write_text("{}\n", encoding="utf-8")
    pypsa = tmp_path / "pypsa"
    pypsa.mkdir()
    (pypsa / "CITATION.cff").write_text("version: v-test\n", encoding="utf-8")

    report = collect_registry(
        backend, pypsa,
        database_specs=(("test", "data/test/processed/test.db", "data/test/processed/manifest.json"),),
    )

    source = next(row for row in report["sources"] if row["source_key"] == "official")
    assert source["rights_status"] == "terms_review_required"
    assert source["release_manifest_sha256"]
    assert report["decision"] == "HOLD"
    assert report["summary"]["hold_findings"] > 0
    markdown = render_markdown(report)
    assert "HOLD for commercial production" in markdown
    assert "https://example.test/data" in markdown
    assert "legal approval" in markdown


def test_missing_database_and_manifest_are_reported_not_ignored(tmp_path):
    report = collect_registry(
        tmp_path, tmp_path,
        database_specs=(("missing", "missing.db", "manifest.json"),),
    )
    assert any("Missing database" in finding["message"] for finding in report["findings"])
    assert report["decision"] == "HOLD"
