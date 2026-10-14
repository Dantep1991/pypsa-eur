"""Country-specific boundary evidence, never inferred administrative names."""
import json
import os
import uuid
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ISO3 = dict(item.split(':') for item in (
    'AL:ALB AT:AUT BA:BIH BE:BEL BG:BGR CH:CHE CY:CYP CZ:CZE DE:DEU DK:DNK '
    'EE:EST ES:ESP FI:FIN FR:FRA GB:GBR UK:GBR GR:GRC EL:GRC HR:HRV HU:HUN '
    'IE:IRL IS:ISL IT:ITA LT:LTU LU:LUX LV:LVA MD:MDA ME:MNE MK:MKD MT:MLT '
    'NL:NLD NO:NOR PL:POL PT:PRT RO:ROU RS:SRB SE:SWE SI:SVN SK:SVK TR:TUR '
    'UA:UKR XK:XKX').split())
LEVELS = [
    {'id': 'growth', 'label': 'Eurostat-seeded geographic regions'},
    {'id': 'regions', 'label': 'Aggregate NUTS regions into geographic clusters'},
    {'id': 'country', 'label': 'Country'},
    {'id': 'nuts1', 'label': 'NUTS 1 · major regions'},
    {'id': 'nuts2', 'label': 'NUTS 2 · regions'},
    {'id': 'nuts3', 'label': 'NUTS 3 · small regions'},
    {'id': 'adm1', 'label': 'Administrative level 1 · regions / states'},
    {'id': 'adm2', 'label': 'Administrative level 2 · counties / districts'},
    {'id': 'adm3', 'label': 'Administrative level 3 · local districts / municipalities'},
    {'id': 'spatial', 'label': 'Custom spatial clusters'},
    {'id': 'evidence', 'label': 'Current Eurostat indicator clusters'},
]
CACHE_ROOT = Path(os.getenv('NOHM_ATLAS_CLUSTER_CACHE_DIR',
    str(Path(__file__).parent / '.atlas-runtime' / 'clustering'))) / 'boundaries'


def _load(url, name):
    """Only declared public providers; never fetch a client-provided URL."""
    parsed = urlparse(url)
    allowed = parsed.scheme == 'https' and (
        parsed.hostname in {'gisco-services.ec.europa.eu', 'www.geoboundaries.org'}
        or (parsed.hostname in {'github.com', 'raw.githubusercontent.com'}
            and parsed.path.startswith('/wmgeolab/geoBoundaries/')))
    if not allowed:
        raise ValueError('The boundary provider returned an unsupported download URL.')
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    path = CACHE_ROOT / name
    if path.is_file():
        return json.loads(path.read_text(encoding='utf-8'))
    with urlopen(Request(url, headers={'User-Agent': 'Nohm-Atlas/1.0'}), timeout=40) as response:
        content = response.read(256 * 1024 * 1024 + 1)
    if len(content) > 256 * 1024 * 1024:
        raise ValueError('Boundary geometry exceeds the 256 MB limit.')
    payload = json.loads(content)
    temp = path.with_name(f'{path.name}.{uuid.uuid4().hex}.tmp')
    temp.write_text(json.dumps(payload, separators=(',', ':')), encoding='utf-8')
    os.replace(temp, path)
    return payload


def load_country_boundaries(country, level):
    if level.startswith('nuts'):
        url = 'https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_01M_2024_4326.geojson'
        data = _load(url, 'nuts-2024-01m.json')
        alias = {'GR': 'EL', 'GB': 'UK'}.get(country, country)
        features = [f for f in data.get('features', [])
                    if str(f.get('properties', {}).get('NUTS_ID', '')).startswith(alias)
                    and f.get('properties', {}).get('LEVL_CODE') == int(level[-1])]
        fields = ('NUTS_ID', 'NAME_LATN')
        source = {'provider': 'GISCO', 'url': url, 'level': level, 'year': '2024', 'canonical': level.upper()}
    else:
        iso = ISO3.get(country)
        if not iso:
            raise ValueError(f'No boundary country identity is declared for {country}.')
        url = f'https://www.geoboundaries.org/api/current/gbOpen/{iso}/{level.upper()}/'
        metadata = _load(url, f'{iso}-{level}-metadata.json')
        if not isinstance(metadata, dict) or not metadata.get('gjDownloadURL'):
            raise ValueError(f'{level.upper()} boundaries are not available for {country}.')
        # Full geometry is important: simplified boundaries can drop buses near borders.
        data = _load(metadata['gjDownloadURL'], f'{iso}-{level}-geometry.json')
        features = data.get('features', [])
        fields = ('shapeID', 'shapeName')
        source = {'provider': 'geoBoundaries', 'url': url, 'level': level,
                  'year': metadata.get('boundaryYearRepresented'),
                  'canonical': metadata.get('boundaryCanonical'), 'license': metadata.get('boundaryLicense')}
    if not features:
        raise ValueError(f'{level.upper()} boundaries are not available for {country}.')
    return [dict(f, properties={'id': str(f['properties'].get(fields[0]) or ''),
                               'name': str(f['properties'].get(fields[1]) or f['properties'].get(fields[0]))})
            for f in features], source
