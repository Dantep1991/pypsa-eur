const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { createPreviewServer } = require('./preview.cjs');

test('production build contract matches the Nohm mount', () => {
  const contractPath = path.join(__dirname, '..', 'build', '.nohm-atlas-build.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  assert.equal(contract.ApiBase, '/atlas-api');
  assert.equal(contract.Homepage, '/atlas');
  assert.ok(Number.isFinite(Date.parse(contract.BuiltAt)));
  assert.equal(contract.ContractVersion, 2);
  assert.match(contract.SourceTreeSha256, /^[a-f0-9]{64}$/);
  assert.match(contract.AssetManifestSha256, /^[a-f0-9]{64}$/);
  assert.match(contract.MainBundleSha256, /^[a-f0-9]{64}$/);
  assert.match(contract.MainBundle, /^\/atlas\/static\/js\/main\.[a-f0-9]+\.js$/);
  const buildRoot = path.join(__dirname, '..', 'build');
  const digest = filePath => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  assert.equal(digest(path.join(buildRoot, 'asset-manifest.json')), contract.AssetManifestSha256);
  assert.equal(digest(path.join(buildRoot, contract.MainBundle.replace(/^\/atlas\//, ''))), contract.MainBundleSha256);
});

let root, server, upstream, origin, upstreamOrigin;
const upstreamRequests = [];
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-preview-test-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<html>Atlas fixture</html>');
  fs.writeFileSync(path.join(root, 'main.abcdef12.js'), 'console.log("compiled")');
  fs.writeFileSync(path.join(root, 'large.abcdef12.js'), `const atlas = "${'network-data-'.repeat(600)}";`);
  fs.writeFileSync(path.join(root, 'europe.geojson'), '{"type":"FeatureCollection","features":[]}');
  upstream = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    upstreamRequests.push({ url: req.url, headers: req.headers, body, method: req.method });
    if (req.url === '/gzip') {
      const zipped = zlib.gzipSync('{"source":"candidate"}');
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Content-Length': zipped.length });
      return res.end(zipped);
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end('{"source":"candidate"}');
  });
  await listen(upstream);
  upstreamOrigin = `http://127.0.0.1:${upstream.address().port}`;
  server = createPreviewServer({ buildDir: root, backend: upstreamOrigin });
  await listen(server);
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await close(server);
  await close(upstream);
  // Only this test-created, uniquely named temporary fixture directory.
  fs.rmSync(root, { recursive: true });
});

test('compiled assets and extensionless routes work under a subpath', async () => {
  const response = await fetch(`${origin}/atlas/`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Atlas fixture/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  assert.match(response.headers.get('content-security-policy'), /connect-src 'self' https:\/\/api\.openai\.com wss:\/\/api\.openai\.com/);
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(response.headers.get('permissions-policy'), 'camera=(), geolocation=(), microphone=(self)');
  const script = await fetch(`${origin}/atlas/main.abcdef12.js`);
  assert.match(script.headers.get('cache-control'), /immutable/);
  assert.match(script.headers.get('content-type'), /javascript/);
  assert.equal((await fetch(`${origin}/atlas/project/France`)).status, 200);
  const redirect = await fetch(`${origin}/atlas?scope=FR`, { redirect: 'manual' });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), '/atlas/?scope=FR');
});

test('compressible immutable assets negotiate and cache gzip without changing content', async () => {
  const raw = await fetch(`${origin}/atlas/large.abcdef12.js`, {
    headers: { 'Accept-Encoding': 'identity' },
  });
  const rawLength = Number(raw.headers.get('content-length'));
  const rawText = await raw.text();
  assert.equal(raw.headers.get('content-encoding'), null);
  assert.match(raw.headers.get('vary'), /Accept-Encoding/i);

  const compressed = await fetch(`${origin}/atlas/large.abcdef12.js`, {
    headers: { 'Accept-Encoding': 'gzip' },
  });
  assert.equal(compressed.headers.get('content-encoding'), 'gzip');
  assert.match(compressed.headers.get('vary'), /Accept-Encoding/i);
  assert.ok(Number(compressed.headers.get('content-length')) < rawLength / 4);
  assert.equal(await compressed.text(), rawText);

  const repeated = await fetch(`${origin}/atlas/large.abcdef12.js`, {
    headers: { 'Accept-Encoding': 'gzip' },
  });
  assert.equal(repeated.headers.get('content-length'), compressed.headers.get('content-length'));
  assert.equal(await repeated.text(), rawText);

  const disabled = await fetch(`${origin}/atlas/large.abcdef12.js`, {
    headers: { 'Accept-Encoding': 'gzip;q=0, identity' },
  });
  assert.equal(disabled.headers.get('content-encoding'), null);
  assert.equal(Number(disabled.headers.get('content-length')), rawLength);
});

test('data paths are JSON; missing data is not a successful HTML fallback', async () => {
  const data = await fetch(`${origin}/atlas/europe.geojson`);
  assert.equal((await data.json()).type, 'FeatureCollection');
  assert.match(data.headers.get('cache-control'), /max-age=86400/);
  assert.ok(data.headers.get('etag'));
  assert.equal((await fetch(`${origin}/europe.geojson`)).status, 404);
  const missing = await fetch(`${origin}/atlas/missing.geojson`);
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get('content-type'), /json/);
  const head = await fetch(`${origin}/atlas/europe.geojson`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(head.headers.get('etag'), data.headers.get('etag'));

  const unchanged = await fetch(`${origin}/atlas/europe.geojson`, {
    headers: { 'If-None-Match': data.headers.get('etag') },
  });
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), '');
});

test('proxy preserves Origin, body, query and encoded paths', async () => {
  const response = await fetch(`${origin}/atlas-api/api/item/France%20Grid?q=NUTS%203`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{"country":"FR"}',
  });
  assert.equal(response.status, 200);
  const request = upstreamRequests.at(-1);
  assert.equal(request.url, '/api/item/France%20Grid?q=NUTS%203');
  assert.equal(request.headers.origin, origin);
  assert.equal(request.body, '{"country":"FR"}');
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.host, new URL(upstreamOrigin).host);
});

test('compressed API responses stream without a decoder or content-length mismatch', async () => {
  const response = await fetch(`${origin}/atlas-api/gzip`);
  assert.equal(response.headers.get('content-encoding'), 'gzip');
  assert.deepEqual(await response.json(), { source: 'candidate' });
});

test('project model requests can use Emil without redirecting ordinary Atlas APIs', async () => {
  const modelRequests = [];
  const modelUpstream = http.createServer((req, res) => {
    modelRequests.push(req.url);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"source":"emil-model"}');
  });
  await listen(modelUpstream);
  const split = createPreviewServer({
    buildDir: root,
    backend: upstreamOrigin,
    modelBackend: `http://127.0.0.1:${modelUpstream.address().port}`,
  });
  await listen(split);
  try {
    const splitOrigin = `http://127.0.0.1:${split.address().port}`;
    const modelResponse = await fetch(`${splitOrigin}/atlas-api/api/atlas/projects/TYNDP/scene?layers=grid`);
    assert.deepEqual(await modelResponse.json(), { source: 'emil-model' });
    assert.equal(modelRequests.at(-1), '/api/atlas/projects/TYNDP/scene?layers=grid');

    const solutionResponse = await fetch(`${splitOrigin}/atlas-api/api/solutions/TYNDP/runs`);
    assert.deepEqual(await solutionResponse.json(), { source: 'emil-model' });
    assert.equal(modelRequests.at(-1), '/api/solutions/TYNDP/runs');

    const ordinaryResponse = await fetch(`${splitOrigin}/atlas-api/api/atlas/land/status`);
    assert.deepEqual(await ordinaryResponse.json(), { source: 'candidate' });
    assert.equal(upstreamRequests.at(-1).url, '/api/atlas/land/status');
  } finally {
    await close(split);
    await close(modelUpstream);
  }
});

test('host/origin checks reject foreign writes before they reach the candidate', async () => {
  const beforeCount = upstreamRequests.length;
  assert.equal((await fetch(`${origin}/atlas-api/change`, {
    method: 'POST', headers: { Origin: 'https://foreign.example' }, body: 'change',
  })).status, 403);
  // Raw HTTP avoids the fetch implementation's special Host handling.
  const status = await new Promise(resolve => {
    http.get(`${origin}/atlas-api/change`, { headers: { Host: 'foreign.example' } }, response => {
      response.resume(); resolve(response.statusCode);
    });
  });
  assert.equal(status, 403);
  assert.equal(upstreamRequests.length, beforeCount);
});

test('an explicit Nohm loopback origin can embed static assets without weakening foreign-origin checks', async () => {
  const embedded = createPreviewServer({
    buildDir: root,
    backend: upstreamOrigin,
    allowedOrigins: ['http://localhost:5176'],
  });
  await listen(embedded);
  try {
    const embeddedOrigin = `http://127.0.0.1:${embedded.address().port}`;
    const allowed = await fetch(`${embeddedOrigin}/atlas/`, {
      headers: { Origin: 'http://localhost:5176' },
    });
    assert.equal(allowed.status, 200);
    assert.match(allowed.headers.get('content-security-policy'), /frame-ancestors 'self' http:\/\/localhost:5176/);
    assert.equal((await fetch(`${embeddedOrigin}/atlas/`, {
      headers: { Origin: 'http://foreign.example' },
    })).status, 403);
  } finally { await close(embedded); }
});

test('static files reject writes, hidden files and encoded traversal', async () => {
  assert.equal((await fetch(`${origin}/atlas/index.html`, { method: 'POST', body: 'x' })).status, 405);
  assert.equal((await fetch(`${origin}/atlas/.env`)).status, 400);
  assert.equal((await fetch(`${origin}/atlas/%2e%2e%2foutside`)).status, 400);
  assert.equal((await fetch(`${origin}/atlas/%5coutside`)).status, 400);
  assert.equal((await fetch(`${origin}/atlas/%00`)).status, 400);
});

test('preview configuration refuses remote targets and overlapping mounts', () => {
  for (const backend of ['https://127.0.0.1', 'http://remote.example', 'http://user:pass@127.0.0.1', 'http://127.0.0.1/api']) {
    assert.throws(() => createPreviewServer({ buildDir: root, backend }), /loopback/);
  }
  for (const modelBackend of ['https://127.0.0.1', 'http://remote.example', 'http://user:pass@127.0.0.1']) {
    assert.throws(() => createPreviewServer({ buildDir: root, backend: upstreamOrigin, modelBackend }), /model backend.*loopback/i);
  }
  assert.throws(() => createPreviewServer({ buildDir: root, apiPrefix: '/atlas/api' }), /overlap/);
  for (const allowedOrigin of ['*', 'https://localhost:5176', 'http://remote.example', 'http://localhost:5176/path']) {
    assert.throws(() => createPreviewServer({ buildDir: root, allowedOrigins: [allowedOrigin] }), /loopback origins/);
  }
});

test('unavailable candidate reports 502 JSON, not SPA content', async () => {
  const closed = http.createServer();
  await listen(closed);
  const target = `http://127.0.0.1:${closed.address().port}`;
  await close(closed);
  const broken = createPreviewServer({ buildDir: root, backend: target });
  await listen(broken);
  try {
    const response = await fetch(`http://127.0.0.1:${broken.address().port}/atlas-api/health`);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'Candidate API is unavailable.' });
  } finally { await close(broken); }
});

test('deployment manifest separates browser runtime from build and test tooling', () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.dependencies).sort(), [
    'leaflet', 'lucide-react', 'react', 'react-dom', 'react-leaflet', 'recharts',
  ]);
  for (const developmentOnly of ['react-scripts', 'tailwindcss', '@testing-library/react']) {
    assert.ok(manifest.devDependencies[developmentOnly], `${developmentOnly} is not development-only`);
  }
  assert.equal(manifest.dependencies['lucide-react'], '0.468.0');
});

test('actual compiled bundle exposes its entrypoints and country data at the build subpath', {
  skip: !process.env.NOHM_ATLAS_TEST_BUILD,
}, async () => {
  const buildDir = path.resolve(process.env.NOHM_ATLAS_TEST_BUILD);
  const manifest = JSON.parse(fs.readFileSync(path.join(buildDir, 'asset-manifest.json'), 'utf8'));
  const compiled = createPreviewServer({ buildDir, backend: upstreamOrigin });
  await listen(compiled);
  const compiledOrigin = `http://127.0.0.1:${compiled.address().port}`;
  try {
    const html = await (await fetch(`${compiledOrigin}/atlas/`)).text();
    assert.ok(!html.includes('fonts.googleapis.com'), 'production HTML depends on Google Fonts');
    for (const entry of ['main.js', 'main.css']) {
      const url = manifest.files[entry];
      assert.ok(url.startsWith('/atlas/'), `${entry} is not built for /atlas/`);
      assert.ok(html.includes(url), `${entry} is not referenced by the HTML`);
      assert.equal((await fetch(`${compiledOrigin}${url}`)).status, 200);
    }
    const mainCss = fs.readFileSync(path.join(buildDir, 'static', 'css', path.basename(manifest.files['main.css'])), 'utf8');
    assert.ok(!mainCss.includes('fonts.googleapis.com'), 'production CSS depends on Google Fonts');
    const countries = await (await fetch(`${compiledOrigin}/atlas/europe.geojson`)).json();
    assert.ok(countries.features.some(feature => feature.properties?.ISO2 === 'FR'));
    const nodes = await fetch(`${compiledOrigin}/atlas/nodal_coordinates.csv`);
    assert.equal(nodes.status, 200);
    assert.match(nodes.headers.get('content-type'), /text\/csv/);
    assert.equal((await fetch(`${compiledOrigin}/europe.geojson`)).status, 404);
    // Public Nohm assets must not expose the application source tree. Optional
    // analysis code is still proven deferred by the emitted chunks and their
    // absence from the HTML; keep the startup asset within its release budget.
    const publicMaps = ['js', 'css'].flatMap(directory => (
      fs.readdirSync(path.join(buildDir, 'static', directory))
        .filter(filename => filename.endsWith('.map'))
        .map(filename => `${directory}/${filename}`)
    ));
    assert.deepEqual(publicMaps, [], 'production build exposes source maps');
    const mainCode = fs.readFileSync(path.join(buildDir, 'static/js', path.basename(manifest.files['main.js'])), 'utf8');
    assert.match(mainCode, /\/atlas-api/, 'production bundle does not contain the Nohm Atlas API prefix');
    assert.ok(Buffer.byteLength(mainCode) < 900_000, 'startup JavaScript exceeds the production release budget');
    assert.ok(!mainCode.includes('sourceMappingURL='), 'startup JavaScript advertises a public source map');
    for (const legacyText of ['Nova Assistant', 'Lola Live Website', 'Agent Activity']) {
      assert.ok(!mainCode.includes(legacyText), `unreachable prototype view remains compiled: ${legacyText}`);
    }
    const deferred = Object.entries(manifest.files).filter(([name]) => name.endsWith('.chunk.js'));
    assert.ok(deferred.length > 0, 'no deferred analysis chunks were emitted');
    for (const [, url] of deferred) {
      assert.ok(!html.includes(url), 'optional chunk eagerly referenced in HTML');
      const response = await fetch(`${compiledOrigin}${url}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /javascript/);
    }
  } finally { await close(compiled); }
});

test('compiled Nohm API contract reaches the candidate through same-origin /atlas-api', {
  skip: !process.env.NOHM_ATLAS_TEST_BUILD,
}, async () => {
  const buildDir = path.resolve(process.env.NOHM_ATLAS_TEST_BUILD);
  const compiled = createPreviewServer({ buildDir, backend: upstreamOrigin, apiPrefix: '/atlas-api', stripApiPrefix: true });
  await listen(compiled);
  try {
    const compiledOrigin = `http://127.0.0.1:${compiled.address().port}`;
    const response = await fetch(`${compiledOrigin}/atlas-api/api/pypsa/list-files?source=local`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { source: 'candidate' });
    assert.equal(upstreamRequests.at(-1).url, '/api/pypsa/list-files?source=local');
  } finally { await close(compiled); }
});
