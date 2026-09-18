# Country-boundary candidate — not active land data

Retrieved 2026-09-05 from Natural Earth's own linked repository:

- [Dataset](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/)
- [Pinned GeoJSON](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/f1890d9f152c896d250a77557a5751a93d494776/geojson/ne_10m_admin_0_countries.geojson)
- Repository tag: v5.1.2; commit: `f1890d9f152c896d250a77557a5751a93d494776`
- SHA-256 of `countries.geojson`: `239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255`
- [Published terms](https://www.naturalearthdata.com/about/terms-of-use/): public domain.
- Generalized cartography at 1:10 million, using the publisher's default
  de facto boundaries. Not cadastral or legally authoritative jurisdiction data.

The Kosovo feature (`ADM0_A3=KOS`) is a valid polygon with bounds
`[20.024751, 41.844010, 21.772758, 43.263071]`. It is **not** installed in
`app/public/europe.geojson` or used for land clipping. Its planar overlap as a
percentage of the candidate's area with the existing polygons is RS 97.191%,
AL 1.380%, MK 0.986%, ME 0.443%. This reveals both the older Serbia inclusion
of Kosovo and mismatched border generalization. Appending this feature alone
would not produce coherent country masks.

Resolve the whole boundary topology/provenance before activating a replacement.
Do not substitute network-cluster regions for a complete country boundary.
Do not claim this candidate supports parcel-precision land screening.

## Reproducible topology audit (2026-09-05)

From the PyPSA root, run
`python atlas-land/scripts/audit_country_boundaries.py`. This is read-only and
asserts the pinned candidate SHA before processing. The active country-file SHA
at the time of this check was
`3a65d284559f048bb833d5cd08ab5b451771eb4b9ca26d656523d1932c0d53c7`.

Using Europe LAEA (EPSG:3035) for area, the candidate covers 10,913.075 km².
Its intersections with the current masks are RS 10,605.106 km², AL 151.385 km²,
MK 108.474 km² and ME 48.116 km². These are cartographic discrepancies between
sources, not claims that territory has changed jurisdiction. There is no candidate
area outside their current combined region. Subtracting the candidate from each
neighbour yields valid polygons with no overlap with XK and only 0.000166 km²
numerical union difference, but silently reassigns about 308 km² of existing
AL/MK/ME masks. **A zero-overlap result is not proof of positional accuracy.**

Replacing all four neighbours directly from the candidate also changes their
outer borders/coasts: AL/MK/ME symmetric differences are respectively
1,099.812 / 855.319 / 988.256 km². This needs a consistent country-source migration,
not an append or four-polygon replacement alongside unmatched older neighbours.
The audit also reports that the original NO geometry is invalid; the current
land loader already uses `make_valid`, but frontend geometry and source validity
are distinct checks. No active boundary was edited by this audit.

Other evaluated sources: GISCO administrative-unit terms explicitly exclude
commercial use without a separate agreement. geoBoundaries XKX ADM0 metadata
reports an OSM source and CC BY-SA 2.0 while linking to OSM's copyright page;
that per-boundary provenance needs reconciliation before redistribution.
These observations are dataset-selection evidence, not legal certification.
