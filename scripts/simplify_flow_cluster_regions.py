#!/usr/bin/env python3
"""Simplify generated Nohm Flow NUTS polygons for responsive map delivery.

The official GISCO source geometry remains unchanged under ``data/``.  This
script only rewrites the derived ``regions.geojson`` display artifacts in the
Flow cache.  Feature identities and attributes are preserved, while geometry
is simplified to approximately one-kilometre precision for browser rendering.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import geopandas as gpd


DEFAULT_ROOT = Path(__file__).resolve().parents[1] / "resources" / "flow-clusters"


def simplify_file(path: Path, tolerance: float, precision: float) -> dict:
    before = path.stat().st_size
    frame = gpd.read_file(path)
    feature_ids = frame["cluster_id"].astype(str).tolist()
    frame.geometry = frame.geometry.simplify(tolerance, preserve_topology=True)
    frame.geometry = frame.geometry.set_precision(precision)
    if not frame.geometry.is_valid.all():
        raise ValueError(f"Simplification produced invalid geometry: {path}")
    if frame["cluster_id"].astype(str).tolist() != feature_ids:
        raise ValueError(f"Feature identity changed during simplification: {path}")

    temporary = path.with_suffix(".tmp.geojson")
    frame.to_file(temporary, driver="GeoJSON")
    temporary.replace(path)
    after = path.stat().st_size
    return {
        "path": str(path),
        "features": len(frame),
        "bytes_before": before,
        "bytes_after": after,
        "reduction_percent": round((1 - after / before) * 100, 2) if before else 0.0,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--tolerance", type=float, default=0.01)
    parser.add_argument("--precision", type=float, default=0.001)
    args = parser.parse_args()

    paths = sorted(args.root.glob("[A-Z][A-Z]/nuts[123]/regions.geojson"))
    results = [simplify_file(path, args.tolerance, args.precision) for path in paths]
    payload = {
        "files": len(results),
        "features": sum(item["features"] for item in results),
        "bytes_before": sum(item["bytes_before"] for item in results),
        "bytes_after": sum(item["bytes_after"] for item in results),
        "reduction_percent": round(
            (1 - sum(item["bytes_after"] for item in results) / sum(item["bytes_before"] for item in results)) * 100,
            2,
        ) if results else 0.0,
        "tolerance_degrees": args.tolerance,
        "precision_degrees": args.precision,
    }
    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
