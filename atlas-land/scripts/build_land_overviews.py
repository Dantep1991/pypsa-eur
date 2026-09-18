#!/usr/bin/env python3
"""Build compact nearest-neighbour overviews for the local Natura mask.

The PyPSA data bundle stores the source as a scanline-compressed GeoTIFF.  It
is ideal for modelling but expensive for continent-scale interactive map
tiles.  These deterministic overviews retain the binary protected/unprotected
classification and make low-zoom viewport rendering fast without a remote map
service.
"""

from __future__ import annotations

import json
from pathlib import Path
from time import perf_counter

from PIL import Image


LAND_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = LAND_ROOT.parent
SOURCE = WORKSPACE_ROOT / "data" / "natura" / "archive" / "2025-08-15" / "natura.tiff"
OUTPUT = LAND_ROOT / "data" / "processed"
FACTORS = (4, 16, 64, 256)


def build_overview(source: Image.Image, factor: int, output: Path) -> dict:
    width = (source.width + factor - 1) // factor
    height = (source.height + factor - 1) // factor
    started = perf_counter()
    result = Image.new("L", (width, height), 0)
    # The source uses one TIFF strip per row. Reading one representative row
    # for each output row is therefore much cheaper than decoding/resizing the
    # full 2.3-billion-pixel raster.
    for target_row, source_row in enumerate(range(factor // 2, source.height, factor)):
        row = source.crop((0, source_row, source.width, source_row + 1))
        row = row.resize((width, 1), Image.Resampling.NEAREST)
        result.paste(row, (0, target_row))
    output.parent.mkdir(parents=True, exist_ok=True)
    result.save(output, format="TIFF", compression="tiff_lzw")
    return {
        "factor": factor,
        "width": width,
        "height": height,
        "path": str(output.relative_to(LAND_ROOT)).replace("\\", "/"),
        "seconds": round(perf_counter() - started, 3),
    }


def main() -> None:
    if not SOURCE.is_file():
        raise FileNotFoundError(f"Natura raster not found: {SOURCE}")
    Image.MAX_IMAGE_PIXELS = None
    source = Image.open(SOURCE)
    rows = []
    for factor in FACTORS:
        target = OUTPUT / f"natura-2025-08-15-x{factor}.tiff"
        if target.is_file():
            overview = Image.open(target)
            rows.append(
                {
                    "factor": factor,
                    "width": overview.width,
                    "height": overview.height,
                    "path": str(target.relative_to(LAND_ROOT)).replace("\\", "/"),
                    "seconds": 0.0,
                    "reused": True,
                }
            )
            continue
        rows.append(build_overview(source, factor, target))
    manifest = {
        "source": str(SOURCE.relative_to(WORKSPACE_ROOT)).replace("\\", "/"),
        "source_width": source.width,
        "source_height": source.height,
        "source_crs": "EPSG:3035",
        "source_pixel_size_m": 100,
        "classification": "binary Natura 2000 mask",
        "overviews": rows,
    }
    (OUTPUT / "natura-overviews.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
