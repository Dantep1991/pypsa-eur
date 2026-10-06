// Loopback-only production-bundle smoke host. This is NOT an authenticated
// Nohm deployment server. The proxy preserves Origin; the candidate API must
// explicitly allow the preview origin. No credentials are injected into HTML.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream');
const { promisify } = require('node:util');
const { gzip } = require('node:zlib');

const gzipAsync = promisify(gzip);
const MIN_COMPRESS_BYTES = 1024;
const MAX_COMPRESSED_CACHE_BYTES = 16 * 1024 * 1024;
const COMPRESSIBLE_EXTENSIONS = new Set(['.html', '.js', '.css', '.json', '.geojson', '.csv', '.svg', '.map']);
const STABLE_DATA_ASSETS = new Set(['europe.geojson', 'nodal_coordinates.csv']);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.geojson': 'application/geo+json', '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json',
};
const HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
]);
function endJson(res, status, error) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ error }));
}
function prefix(value) {
  if (!/^\/[a-zA-Z0-9_/-]*$/.test(value) || value.includes('//')) {
    throw new Error('Mount paths must be absolute URL paths without query strings or dots.');
  }
  return value.replace(/\/+$/, '');
}
function contains(root, file) {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
function forwardedHeaders(headers) {
  const excluded = new Set([
    ...HOP_HEADERS, ...(headers.connection || '').toLowerCase().split(',').map(value => value.trim()),
  ]);
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !excluded.has(name.toLowerCase())));
}
function acceptsGzip(value) {
  let wildcard = false;
  for (const part of String(value || '').toLowerCase().split(',')) {
    const [name, ...parameters] = part.trim().split(';');
    if (!name) continue;
    const quality = parameters.reduce((result, parameter) => {
      const match = parameter.trim().match(/^q\s*=\s*(0(?:\.0*)?|1(?:\.0*)?)$/);
      return match ? Number(match[1]) : result;
    }, 1);
    if (name === 'gzip') return quality > 0;
    if (name === '*' && quality > 0) wildcard = true;
  }
  return wildcard;
}

function cacheControl(file) {
  if (/[.-][a-f0-9]{8,}[.-]/i.test(path.basename(file))) return 'public, max-age=31536000, immutable';
  // These files are versioned with the Atlas release but retain stable names
  // for CRA's public-asset contract. A one-day freshness window removes repeat
  // transfers while still discovering a replaced release without a hard reload.
  if (STABLE_DATA_ASSETS.has(path.basename(file))) return 'public, max-age=86400, stale-while-revalidate=604800';
  return 'no-store';
}

function weakEtag(stat) {
  return `W/"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
}

function etagMatches(header, etag) {
  return String(header || '').split(',').map(value => value.trim()).some(value => value === '*' || value === etag);
}

function normalizeAllowedOrigins(values) {
  if (!Array.isArray(values)) throw new Error('Preview allowed origins must be an array.');
  return new Set(values.map(value => {
    let parsed;
    try { parsed = new URL(String(value || '').trim()); }
    catch { throw new Error('Preview allowed origins must be exact HTTP loopback origins, without credentials or path.'); }
    if (parsed.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(parsed.hostname)
        || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new Error('Preview allowed origins must be exact HTTP loopback origins, without credentials or path.');
    }
    return parsed.origin;
  }));
}

function loopbackUpstream(value, label = 'Preview backend') {
  const upstream = new URL(value);
  if (upstream.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(upstream.hostname)
      || upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash) {
    throw new Error(`${label} must be an HTTP loopback origin, without credentials or path.`);
  }
  return upstream;
}

function createPreviewServer({
  buildDir, mount = '/atlas', apiPrefix = '/atlas-api', backend = 'http://127.0.0.1:5003',
  modelBackend = '', theoBackend = '', stripApiPrefix = true, allowedOrigins = [],
}) {
  const root = fs.realpathSync(buildDir);
  if (!fs.statSync(path.join(root, 'index.html')).isFile()) throw new Error('Build has no index.html.');
  const assetMount = prefix(mount);
  const proxyMount = prefix(apiPrefix);
  if (!proxyMount || assetMount === proxyMount || assetMount.startsWith(`${proxyMount}/`)
      || (assetMount && proxyMount.startsWith(`${assetMount}/`))) {
    throw new Error('Asset and API mounts must not overlap.');
  }
  const upstream = loopbackUpstream(backend);
  const modelUpstream = modelBackend ? loopbackUpstream(modelBackend, 'Preview model backend') : null;
  const theoUpstream = theoBackend ? loopbackUpstream(theoBackend, 'Preview Theo backend') : null;
  const configuredAllowedOrigins = normalizeAllowedOrigins(allowedOrigins);
  const frameAncestors = ["'self'", ...configuredAllowedOrigins].join(' ');
  const staticSecurityHeaders = Object.freeze({
    'Content-Security-Policy': [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      `frame-ancestors ${frameAncestors}`,
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://server.arcgisonline.com",
      "connect-src 'self' https://api.openai.com wss://api.openai.com",
      "media-src 'self' data: blob:",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "form-action 'self'",
    ].join('; '),
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=(self)',
  });
  // Production bundles are immutable and frequently requested by multiple tabs.
  // Cache their compressed representation by file signature so compression is
  // paid once without retaining an unbounded copy of staged data assets.
  const compressedAssets = new Map();
  let compressedAssetBytes = 0;
  async function compressedFile(file, stat) {
    const signature = `${stat.size}:${stat.mtimeMs}`;
    const existing = compressedAssets.get(file);
    if (existing?.signature === signature) {
      compressedAssets.delete(file);
      compressedAssets.set(file, existing);
      return existing.promise;
    }
    if (existing) {
      compressedAssets.delete(file);
      compressedAssetBytes -= existing.bytes || 0;
    }
    const entry = {
      signature,
      bytes: 0,
      promise: fs.promises.readFile(file).then((source) => gzipAsync(source, { level: 6 })),
    };
    compressedAssets.set(file, entry);
    try {
      const buffer = await entry.promise;
      // A newer file signature or LRU eviction may have replaced this pending
      // entry while compression was running. Return the valid bytes to its
      // caller, but do not account an object the cache no longer owns.
      if (compressedAssets.get(file) !== entry) return buffer;
      entry.bytes = buffer.length;
      compressedAssetBytes += buffer.length;
      while (compressedAssetBytes > MAX_COMPRESSED_CACHE_BYTES && compressedAssets.size > 1) {
        const [oldestFile, oldest] = compressedAssets.entries().next().value;
        compressedAssets.delete(oldestFile);
        compressedAssetBytes -= oldest.bytes || 0;
      }
      return buffer;
    } catch (error) {
      if (compressedAssets.get(file) === entry) compressedAssets.delete(file);
      throw error;
    }
  }
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch(() => {
      if (!res.headersSent && !res.destroyed) endJson(res, 500, 'Preview could not serve the request.');
      else res.destroy();
    });
  });
  async function handleRequest(req, res) {
    const expectedHost = `127.0.0.1:${server.address().port}`;
    if (req.headers.host !== expectedHost) return endJson(res, 403, 'Unexpected preview host.');
    const allowedRequestOrigins = new Set([`http://${expectedHost}`, ...configuredAllowedOrigins]);
    if (req.headers.origin && !allowedRequestOrigins.has(req.headers.origin)) {
      return endJson(res, 403, 'Unexpected preview origin.');
    }
    let pathname;
    const queryIndex = req.url.indexOf('?');
    const rawPathname = queryIndex < 0 ? req.url : req.url.slice(0, queryIndex);
    const query = queryIndex < 0 ? '' : req.url.slice(queryIndex);
    try { pathname = decodeURIComponent(rawPathname); }
    catch { return endJson(res, 400, 'Malformed URL.'); }
    if (!pathname.startsWith('/') || pathname.includes('\\') || pathname.includes('\0')
        || pathname.split('/').some(segment => segment.startsWith('.'))) {
      return endJson(res, 400, 'Invalid path.');
    }
    if (rawPathname === proxyMount || rawPathname.startsWith(`${proxyMount}/`)) {
      const proxiedPath = stripApiPrefix ? (rawPathname.slice(proxyMount.length) || '/') : rawPathname;
      const usesModelBackend = proxiedPath.startsWith('/api/atlas/projects')
        || proxiedPath.startsWith('/api/solutions') || proxiedPath.startsWith('/api/emil/database/');
      const upstreamPath = modelUpstream && proxiedPath.startsWith('/api/emil/database/')
        ? proxiedPath.replace('/api/emil/database/', '/api/database/') : proxiedPath;
      const selectedUpstream = theoUpstream && proxiedPath.startsWith('/api/theo/') ? theoUpstream : modelUpstream && usesModelBackend
        ? modelUpstream
        : upstream;
      const headers = forwardedHeaders(req.headers);
      headers.host = selectedUpstream.host;
      // Preserve browser Origin and cookies. Never substitute a permitted Origin.
      const proxy = http.request(selectedUpstream, {
        method: req.method,
        path: `${upstreamPath}${query}`,
        headers,
      }, response => {
        res.writeHead(response.statusCode, forwardedHeaders(response.headers));
        pipeline(response, res, () => {});
      });
      proxy.on('error', () => {
        if (!res.headersSent && !res.destroyed) endJson(res, 502, 'Candidate API is unavailable.');
        else res.destroy();
      });
      // Long model calls may run for minutes; disconnected browsers must not
      // leave an orphan HTTP request (this does not cancel a backend model job).
      res.on('close', () => { if (!res.writableFinished) proxy.destroy(); });
      req.on('aborted', () => proxy.destroy());
      req.pipe(proxy);
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) return endJson(res, 405, 'Static assets are read-only.');
    if (assetMount && pathname === assetMount) {
      res.writeHead(308, { Location: `${assetMount}/${query}`, 'Cache-Control': 'no-store' });
      return res.end();
    }
    if (!pathname.startsWith(`${assetMount}/`)) return endJson(res, 404, 'Not found.');
    let file = path.resolve(root, pathname.slice(assetMount.length + 1) || 'index.html');
    try {
      file = await fs.promises.realpath(file);
      if (!contains(root, file)) return endJson(res, 403, 'Asset is outside the build.');
      if (!(await fs.promises.stat(file)).isFile()) throw Object.assign(new Error(), { code: 'ENOENT' });
    } catch (error) {
      if (error.code !== 'ENOENT' || path.extname(pathname)) return endJson(res, 404, 'Asset not found.');
      // Only extensionless SPA routes fall back. Missing JSON/data is never HTML.
      file = path.join(root, 'index.html');
    }
    const stat = await fs.promises.stat(file);
    const extension = path.extname(file);
    const shouldCompress = stat.size >= MIN_COMPRESS_BYTES
      && COMPRESSIBLE_EXTENSIONS.has(extension)
      && acceptsGzip(req.headers['accept-encoding']);
    const responseHeaders = {
      ...staticSecurityHeaders,
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': cacheControl(file),
      'X-Content-Type-Options': 'nosniff',
      'Vary': 'Accept-Encoding',
    };
    if (responseHeaders['Cache-Control'] !== 'no-store') {
      responseHeaders.ETag = weakEtag(stat);
      if (etagMatches(req.headers['if-none-match'], responseHeaders.ETag)) {
        res.writeHead(304, responseHeaders);
        return res.end();
      }
    }
    if (shouldCompress) {
      const compressed = await compressedFile(file, stat);
      responseHeaders['Content-Encoding'] = 'gzip';
      responseHeaders['Content-Length'] = compressed.length;
      res.writeHead(200, responseHeaders);
      return res.end(req.method === 'HEAD' ? undefined : compressed);
    }
    responseHeaders['Content-Length'] = stat.size;
    res.writeHead(200, responseHeaders);
    if (req.method === 'HEAD') return res.end();
    pipeline(fs.createReadStream(file), res, () => {});
  }
  return server;
}

if (require.main === module) {
  const port = Number(process.env.NOHM_ATLAS_PREVIEW_PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid preview port.');
  const mount = process.env.NOHM_ATLAS_PREVIEW_MOUNT || '/atlas';
  const apiPrefix = process.env.NOHM_ATLAS_PREVIEW_API_PREFIX || '/atlas-api';
  const server = createPreviewServer({
    buildDir: path.resolve(__dirname, '..', process.env.NOHM_ATLAS_PREVIEW_BUILD || 'build-preview'),
    mount, apiPrefix, backend: process.env.NOHM_ATLAS_PREVIEW_BACKEND || 'http://127.0.0.1:5003',
    modelBackend: process.env.NOHM_ATLAS_PREVIEW_MODEL_BACKEND || '',
    theoBackend: process.env.NOHM_ATLAS_PREVIEW_THEO_BACKEND || '',
    allowedOrigins: String(process.env.NOHM_ATLAS_PREVIEW_ALLOWED_ORIGINS || '')
      .split(',').map(value => value.trim()).filter(Boolean),
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Atlas production preview: http://127.0.0.1:${port}${mount}/`);
    console.log('Loopback smoke host only; not an authenticated Nohm deployment.');
  });
}
module.exports = { createPreviewServer };
