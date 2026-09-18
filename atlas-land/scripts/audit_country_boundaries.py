"""Read-only topology/provenance audit of the staged Kosovo boundary candidate.

No country masks are written or activated. Areas use Europe LAEA (EPSG:3035).
Run from the PyPSA root: python atlas-land/scripts/audit_country_boundaries.py
"""
import hashlib
import json
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import shape
from shapely.ops import transform, unary_union


def main():
    root = Path(__file__).resolve().parents[1]
    candidate_path = root / 'data/sources/natural-earth-5.1.2/countries.geojson'
    candidate_bytes = candidate_path.read_bytes()
    expected_sha = '239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255'
    assert hashlib.sha256(candidate_bytes).hexdigest() == expected_sha, 'Candidate source changed'
    old_bytes = (root / 'app/public/europe.geojson').read_bytes()
    old_features = json.loads(old_bytes)['features']
    old = {feature['properties']['ISO2']: shape(feature['geometry']) for feature in old_features}
    source_features = json.loads(candidate_bytes)['features']
    kosovo_feature = next(feature for feature in source_features if feature['properties']['ADM0_A3'] == 'KOS')
    kosovo = shape(kosovo_feature['geometry'])
    project = Transformer.from_crs('EPSG:4326', 'EPSG:3035', always_xy=True).transform
    area = lambda geometry: transform(project, geometry).area / 1e6
    neighbours = ['RS', 'AL', 'MK', 'ME']
    existing_region = unary_union([old[code] for code in neighbours])
    contributions = {code: area(old[code].intersection(kosovo)) for code in neighbours}
    carved = {code: old[code].difference(kosovo) for code in neighbours}
    carved_union = unary_union([*carved.values(), kosovo])
    report = {
        'mode': 'read-only; no proposed geometry is activated',
        'active_sha256': hashlib.sha256(old_bytes).hexdigest(),
        'candidate_sha256': expected_sha,
        'active_country_count': len(old),
        'active_invalid_countries': [code for code, geometry in old.items() if not geometry.is_valid],
        'kosovo_valid': kosovo.is_valid,
        'kosovo_area_km2': round(area(kosovo), 3),
        'candidate_area_currently_assigned_km2': {code: round(value, 3) for code, value in contributions.items()},
        'candidate_area_outside_old_region_km2': round(area(kosovo.difference(existing_region)), 6),
        'carve_analysis': {
            'union_change_km2': round(area(carved_union.symmetric_difference(existing_region)), 6),
            'invalid_result_codes': [code for code, geometry in carved.items() if not geometry.is_valid],
            'overlap_with_kosovo_km2': {code: round(area(geometry.intersection(kosovo)), 9) for code, geometry in carved.items()},
            'warning': 'A topologically clean carve would still transfer the listed existing AL/MK/ME land to XK. Geometry validity alone does not establish jurisdiction accuracy.',
        },
        'source_neighbour_comparison': [],
    }
    for code in neighbours:
        feature = next(feature for feature in source_features if feature['properties'].get('ISO_A2') == code)
        geometry = shape(feature['geometry'])
        report['source_neighbour_comparison'].append({
            'country': code, 'candidate_valid': geometry.is_valid,
            'old_area_km2': round(area(old[code]), 3), 'source_area_km2': round(area(geometry), 3),
            'symmetric_difference_km2': round(area(old[code].symmetric_difference(geometry)), 3),
        })
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
