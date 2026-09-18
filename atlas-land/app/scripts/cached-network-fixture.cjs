const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');

const REQUIRED_SCOPES = ['grid', 'supply', 'storage', 'demand'];

function loadCachedNetwork(cacheDir, country) {
  const root = fs.realpathSync(cacheDir);
  const code = String(country || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) throw new Error(`Invalid fixture country: ${country}`);
  const filename = `base_${code}_full.nc`;
  const entries = new Map();
  for (const name of fs.readdirSync(root)) {
    if (!/^[a-f0-9]{64}\.json\.gz$/.test(name)) continue;
    const file = path.join(root, name);
    let payload;
    try { payload = JSON.parse(zlib.gunzipSync(fs.readFileSync(file))); }
    catch { continue; }
    const scope = String(payload.component_scope || '').toLowerCase();
    if (payload.filename !== filename || !REQUIRED_SCOPES.includes(scope)) continue;
    const candidate = {
      file,
      gzip: fs.readFileSync(file),
      markers: Array.isArray(payload.markers) ? payload.markers.length : Object.keys(payload.markers || {}).length,
      connections: Array.isArray(payload.connections) ? payload.connections.length : 0,
      acLines: Array.isArray(payload.connections) ? payload.connections.filter(item => String(item.type || '').toLowerCase() === 'line').length : 0,
      dcLinks: Array.isArray(payload.connections) ? payload.connections.filter(item => String(item.type || '').toLowerCase() === 'link').length : 0,
      overlays: Array.isArray(payload.geojson_overlays) ? payload.geojson_overlays.length : 0,
    };
    // Duplicate cache keys can represent equivalent parser identities. Prefer
    // the smallest exact payload for deterministic fixture transfer.
    if (!entries.has(scope) || candidate.gzip.length < entries.get(scope).gzip.length) entries.set(scope, candidate);
  }
  const missing = REQUIRED_SCOPES.filter(scope => !entries.has(scope));
  if (missing.length) throw new Error(`Cached ${filename} fixture is missing: ${missing.join(', ')}`);
  return { root, code, filename, entries };
}

function sendJson(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(status, {
    'Content-Type': 'application/json', 'Content-Length': body.length,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

function createCachedNetworkFixture({ cacheDir, country }) {
  const fixture = loadCachedNetwork(cacheDir, country);
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    requests.push(`${request.method} ${url.pathname}${url.search}`);
    if (request.method === 'GET' && url.pathname === '/api/pypsa/list-files') {
      return sendJson(response, 200, {
        source: 'local',
        capabilities: { parse_nc_omit_geojson_overlays: true },
        files: [{
          filename: fixture.filename,
          is_full_nodal_network: true,
          full_country: fixture.code,
          size_kb: Math.round(fixture.entries.get('grid').gzip.length / 102.4) / 10,
        }],
      });
    }
    if (request.method === 'POST' && url.pathname === '/api/pypsa/parse-nc') {
      let text = '';
      for await (const chunk of request) {
        text += chunk;
        if (text.length > 65536) return sendJson(response, 413, { error: 'Fixture request is too large.' });
      }
      let body;
      try { body = JSON.parse(text || '{}'); }
      catch { return sendJson(response, 400, { error: 'Malformed fixture request.' }); }
      const scope = String(body.component_scope || '').toLowerCase();
      const entry = body.filename === fixture.filename ? fixture.entries.get(scope) : null;
      if (!entry) return sendJson(response, 404, { error: `No fixture for ${body.filename || 'unknown'} / ${scope || 'unknown'}.` });
      response.writeHead(200, {
        'Content-Type': 'application/json', 'Content-Encoding': 'gzip',
        'Content-Length': entry.gzip.length, 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      return response.end(entry.gzip);
    }
    if (request.method === 'GET' && /\/api\/atlas\/(?:gas|water|liquids|logistics)\/status$/.test(url.pathname)) {
      return sendJson(response, 200, { available: false, countries: [] });
    }
    if (request.method === 'GET' && url.pathname === '/api/atlas/grid-access/map') {
      return sendJson(response, 200, { type: 'FeatureCollection', features: [] });
    }
    if (request.method === 'GET' && url.pathname.startsWith('/api/atlas/land/')) {
      return sendJson(response, 200, { available: false, supported: false, reason: 'Not part of the network performance fixture.' });
    }
    if (request.method === 'GET' && url.pathname === '/api/health') return sendJson(response, 200, { status: 'healthy' });
    return sendJson(response, 404, { error: 'Fixture endpoint not found.' });
  });
  return { server, fixture, requests };
}

module.exports = { createCachedNetworkFixture, loadCachedNetwork, REQUIRED_SCOPES };
