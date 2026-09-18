#!/usr/bin/env python3
"""Build the compact, authoritative electricity interconnector map cache.

The country NetCDF caches are deliberately clipped at national borders. This
extract keeps the cross-border branches from the same local OSM source used by
PyPSA-Eur so the frontend can stitch them onto any active cluster resolution.
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "data" / "osm" / "archive" / "0.7"
OUTPUT = ROOT / "atlas-land" / "app" / "src" / "data" / "electricity-cross-border.json"


def _number(value):
    numeric = pd.to_numeric(value, errors="coerce")
    return None if pd.isna(numeric) else float(numeric)


def _records(component: str, buses: pd.DataFrame) -> list[dict]:
    path = SOURCE / f"{component}.csv"
    frame = pd.read_csv(path, dtype=str, quotechar="'")
    countries = buses["country"]
    country0 = frame["bus0"].map(countries)
    country1 = frame["bus1"].map(countries)
    selected = frame.loc[country0.notna() & country1.notna() & country0.ne(country1)].copy()
    selected["country0"] = country0.loc[selected.index].str.upper()
    selected["country1"] = country1.loc[selected.index].str.upper()
    identifier_column = "line_id" if component == "lines" else "link_id"
    output = []
    for row in selected.to_dict("records"):
        bus0 = buses.loc[row["bus0"]]
        bus1 = buses.loc[row["bus1"]]
        record = {
            "id": f"osm-{component[:-1]}-{row[identifier_column]}",
            "source_id": row[identifier_column],
            "type": "line" if component == "lines" else "link",
            "bus0": row["bus0"],
            "bus1": row["bus1"],
            "country0": row["country0"],
            "country1": row["country1"],
            "longitude0": _number(bus0["x"]),
            "latitude0": _number(bus0["y"]),
            "longitude1": _number(bus1["x"]),
            "latitude1": _number(bus1["y"]),
            "length": _number(row.get("length")),
            "voltage": _number(row.get("voltage")),
            "circuits": _number(row.get("circuits")),
            "s_nom": _number(row.get("s_nom")),
            "p_nom": _number(row.get("p_nom")),
        }
        required = ("longitude0", "latitude0", "longitude1", "latitude1")
        if all(record[key] is not None for key in required):
            output.append(record)
    return output


def main() -> int:
    buses = pd.read_csv(SOURCE / "buses.csv", dtype=str, quotechar="'").set_index("bus_id")
    records = _records("lines", buses) + _records("links", buses)
    records.sort(key=lambda row: (
        min(row["country0"], row["country1"]),
        max(row["country0"], row["country1"]),
        row["type"],
        row["id"],
    ))
    payload = {
        "schema": "nohm.atlas.electricity-cross-border.v1",
        "source": "PyPSA-Eur OSM archive 0.7",
        "records": records,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(records)} cross-border branches to {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
