"""Verify a staged multipart water DB through Flask and production JS geometry.

No running server, source DB, or runtime mirror is replaced. Requires --candidate.
"""
import argparse
import gzip
import json
from pathlib import Path
import subprocess
import sys

from flask import Flask


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate', type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    backend = root.parent / 'Models/2026/nova-energy-analyst'
    sys.path.insert(0, str(backend))
    import atlas_water
    candidate = args.candidate.resolve(strict=True)
    assert candidate != atlas_water.WATER_DB_PATH.resolve()
    app = Flask(__name__)
    app.register_blueprint(atlas_water.water_atlas_bp)
    client = app.test_client()
    countries = 'AL,AT,BA,BE,BG,CH,CZ,DE,DK,EE,ES,FI,FR,GB,GR,HR,HU,IE,IT,LT,LU,LV,ME,MK,NL,NO,PL,PT,RO,RS,SE,SI,SK,XK'
    route = f'/api/atlas/water/network?domains=Grid&countries={countries}'
    baseline = client.get(route)
    atlas_water.WATER_DB_PATH = candidate
    staged = client.get(route)
    assert baseline.status_code == staged.status_code == 200
    before, after = baseline.get_json(), staged.get_json()
    assert before['facilities'] == after['facilities']
    assert len(before['connections']) == len(after['connections'])
    for old, new in zip(before['connections'], after['connections'], strict=True):
        expected, actual = dict(old), dict(new)
        expected.pop('coordinates'); actual.pop('coordinates'); actual.pop('coordinate_paths', None)
        assert actual == expected, old['id']
    result = subprocess.run(['node', 'scripts/check-water-multipart.mjs'],
        cwd=root / 'atlas-land/app', input=json.dumps({'before': before['connections'], 'after': after['connections']}),
        text=True, encoding='utf-8', capture_output=True, check=True, timeout=90)
    geometry = json.loads(result.stdout)
    assert geometry['restored_links'] == 36 and geometry['unmapped_after'] == 0
    print(json.dumps(dict(transport='in-process Flask; no runtime replacement', candidate=str(candidate),
        countries=countries.split(','), facilities=len(after['facilities']),
        normal_bytes=len(baseline.data), multipart_bytes=len(staged.data),
        normal_gzip_bytes=len(gzip.compress(baseline.data)), multipart_gzip_bytes=len(gzip.compress(staged.data)),
        metadata_and_facilities_equal=True, geometry=geometry), indent=2))


if __name__ == '__main__':
    main()
