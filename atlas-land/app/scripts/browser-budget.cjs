const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { createPreviewServer } = require('./preview.cjs');
const { createCachedNetworkFixture } = require('./cached-network-fixture.cjs');
const { isLandAtlasApiPath } = require('./atlas-api-paths.cjs');

const configuredTargetUrl = process.env.NOHM_ATLAS_PERF_URL || '';
const configuredCountry = String(process.env.NOHM_ATLAS_PERF_COUNTRY || '').trim().toUpperCase();
const configuredExtraCountries = [...new Set(String(process.env.NOHM_ATLAS_PERF_EXTRA_COUNTRIES || '')
  .split(',').map(value => value.trim().toUpperCase()).filter(Boolean))]
  .filter(country => country !== configuredCountry);
const configuredAgentCommand = String(process.env.NOHM_ATLAS_PERF_AGENT_COMMAND || '').trim();
const configuredAgentSoakCycles = Number(process.env.NOHM_ATLAS_PERF_AGENT_SOAK_CYCLES || 0);
const configuredAgentExpectedCountries = Number(process.env.NOHM_ATLAS_PERF_AGENT_EXPECT_COUNTRIES || 0);
const configuredAgentExpectedResolution = String(process.env.NOHM_ATLAS_PERF_AGENT_EXPECT_RESOLUTION || '').trim();
const configuredAgentExpectedLayers = [...new Set(String(process.env.NOHM_ATLAS_PERF_AGENT_EXPECT_LAYERS || '')
  .split(',').map(value => value.trim()).filter(Boolean))];
const configuredAgentExpectedCarriers = [...new Set(String(process.env.NOHM_ATLAS_PERF_AGENT_EXPECT_CARRIERS || '')
  .split(',').map(value => value.trim().toLowerCase()).filter(Boolean))];
const useLiveBackend = /^(1|true|yes|on)$/i.test(String(process.env.NOHM_ATLAS_PERF_LIVE_BACKEND || ''));
const configuredClustering = /^(1|true|yes|on)$/i.test(String(process.env.NOHM_ATLAS_PERF_CLUSTERING || ''));
const configuredResolutionSlider = /^(1|true|yes|on)$/i.test(String(process.env.NOHM_ATLAS_PERF_RESOLUTION_SLIDER || ''));
const configuredMapDisplay = /^(1|true|yes|on)$/i.test(String(process.env.NOHM_ATLAS_PERF_MAP_DISPLAY || ''));
const configuredPreviewPort = Number(process.env.NOHM_ATLAS_PERF_PREVIEW_PORT || 0);
const overlayCarrierLabels = Object.freeze({
  gas: 'Methane gas', water: 'Water & wastewater', liquids: 'Oil & energy liquids', logistics: 'Ports & air freight',
});
const agentCarrierLabels = Object.freeze({ electricity: 'Electricity', ...overlayCarrierLabels });
const configuredOverlayCarriers = [...new Set(String(process.env.NOHM_ATLAS_PERF_OVERLAY_CARRIERS || '')
  .split(',').map(value => value.trim().toLowerCase()).filter(Boolean))];
const coldBudgetMs = Number(process.env.NOHM_ATLAS_COLD_BUDGET_MS || 8000);
const warmBudgetMs = Number(process.env.NOHM_ATLAS_WARM_BUDGET_MS || 5000);
const heapBudgetMb = Number(process.env.NOHM_ATLAS_HEAP_BUDGET_MB || 160);
const coldLcpBudgetMs = Number(process.env.NOHM_ATLAS_COLD_LCP_BUDGET_MS || 5000);
const warmLcpBudgetMs = Number(process.env.NOHM_ATLAS_WARM_LCP_BUDGET_MS || 2500);
const longTaskBudgetMs = Number(process.env.NOHM_ATLAS_LONG_TASK_BUDGET_MS || 3000);
const layoutShiftBudget = Number(process.env.NOHM_ATLAS_LAYOUT_SHIFT_BUDGET || 0.1);
const cpuThrottle = Number(process.env.NOHM_ATLAS_CPU_THROTTLE || 4);
const settleMs = Number(process.env.NOHM_ATLAS_SETTLE_MS || 1200);
const gridLoadBudgetMs = Number(process.env.NOHM_ATLAS_GRID_LOAD_BUDGET_MS || 12000);
const layerLoadBudgetMs = Number(process.env.NOHM_ATLAS_LAYER_LOAD_BUDGET_MS || 8000);
const fullDomainBudgetMs = Number(process.env.NOHM_ATLAS_FULL_DOMAIN_BUDGET_MS || 20000);
const overlayLoadBudgetMs = Number(process.env.NOHM_ATLAS_OVERLAY_LOAD_BUDGET_MS || 30000);
const agentCommandBudgetMs = Number(process.env.NOHM_ATLAS_AGENT_COMMAND_BUDGET_MS || 180000);
const loadedHeapBudgetMb = Number(process.env.NOHM_ATLAS_LOADED_HEAP_BUDGET_MB || 200);
const soakHeapGrowthBudgetMb = Number(process.env.NOHM_ATLAS_SOAK_HEAP_GROWTH_BUDGET_MB || 20);
const loadedDomBudget = Number(process.env.NOHM_ATLAS_LOADED_DOM_BUDGET || 2500);
const retainedDomBudget = Number(process.env.NOHM_ATLAS_RETAINED_DOM_BUDGET || 12000);
const viewportWidth = Number(process.env.NOHM_ATLAS_VIEWPORT_WIDTH || 1366);
const viewportHeight = Number(process.env.NOHM_ATLAS_VIEWPORT_HEIGHT || 768);
const warmSampleCount = Number(process.env.NOHM_ATLAS_WARM_SAMPLES || 3);
const domainCycleCount = Number(process.env.NOHM_ATLAS_DOMAIN_CYCLES || 3);
if (!Number.isInteger(viewportWidth) || viewportWidth < 320 || viewportWidth > 3840
    || !Number.isInteger(viewportHeight) || viewportHeight < 480 || viewportHeight > 2160) {
  throw new Error('NOHM_ATLAS_VIEWPORT_WIDTH/HEIGHT must be integer CSS pixels within 320–3840 × 480–2160.');
}
if (!Number.isInteger(warmSampleCount) || warmSampleCount < 1 || warmSampleCount > 7 || warmSampleCount % 2 === 0) {
  throw new Error('NOHM_ATLAS_WARM_SAMPLES must be an odd integer from 1 to 7.');
}
if (!Number.isInteger(domainCycleCount) || domainCycleCount < 1 || domainCycleCount > 10) {
  throw new Error('NOHM_ATLAS_DOMAIN_CYCLES must be an integer from 1 to 10.');
}
if (!Number.isInteger(configuredPreviewPort) || configuredPreviewPort < 0 || configuredPreviewPort > 65535) {
  throw new Error('NOHM_ATLAS_PERF_PREVIEW_PORT must be 0 or an available port from 1 to 65535.');
}
if (configuredOverlayCarriers.some(carrier => !overlayCarrierLabels[carrier])) {
  throw new Error('NOHM_ATLAS_PERF_OVERLAY_CARRIERS accepts gas, water, liquids and logistics.');
}
if (configuredOverlayCarriers.length && !configuredCountry) {
  throw new Error('NOHM_ATLAS_PERF_OVERLAY_CARRIERS requires NOHM_ATLAS_PERF_COUNTRY.');
}
if (configuredExtraCountries.some(country => !/^[A-Z]{2}$/.test(country))) {
  throw new Error('NOHM_ATLAS_PERF_EXTRA_COUNTRIES accepts comma-separated two-letter country codes.');
}
if (configuredExtraCountries.length && !configuredCountry) {
  throw new Error('NOHM_ATLAS_PERF_EXTRA_COUNTRIES requires NOHM_ATLAS_PERF_COUNTRY.');
}
if (configuredClustering && !configuredCountry) {
  throw new Error('NOHM_ATLAS_PERF_CLUSTERING requires NOHM_ATLAS_PERF_COUNTRY.');
}
if (configuredResolutionSlider && !configuredCountry) {
  throw new Error('NOHM_ATLAS_PERF_RESOLUTION_SLIDER requires NOHM_ATLAS_PERF_COUNTRY.');
}
if (configuredMapDisplay && !configuredCountry) {
  throw new Error('NOHM_ATLAS_PERF_MAP_DISPLAY requires NOHM_ATLAS_PERF_COUNTRY.');
}
if (configuredExtraCountries.length && !useLiveBackend && !configuredTargetUrl) {
  throw new Error('Extra-country browser checks require a live backend or deployed target.');
}
if (configuredAgentCommand && !useLiveBackend && !configuredTargetUrl) {
  throw new Error('Agent browser checks require a live backend or deployed target.');
}
if (!Number.isInteger(configuredAgentSoakCycles) || configuredAgentSoakCycles < 0 || configuredAgentSoakCycles > 20) {
  throw new Error('NOHM_ATLAS_PERF_AGENT_SOAK_CYCLES must be an integer from 0 to 20.');
}
if (configuredAgentSoakCycles && !configuredAgentCommand) {
  throw new Error('NOHM_ATLAS_PERF_AGENT_SOAK_CYCLES requires NOHM_ATLAS_PERF_AGENT_COMMAND.');
}
if (!Number.isInteger(configuredAgentExpectedCountries) || configuredAgentExpectedCountries < 0 || configuredAgentExpectedCountries > 80) {
  throw new Error('NOHM_ATLAS_PERF_AGENT_EXPECT_COUNTRIES must be an integer from 0 to 80.');
}
if (configuredAgentExpectedLayers.some(layer => !['Grid', 'Storage', 'Supply', 'Demand'].includes(layer))) {
  throw new Error('NOHM_ATLAS_PERF_AGENT_EXPECT_LAYERS accepts Grid, Storage, Supply and Demand.');
}
if (configuredAgentExpectedCarriers.some(carrier => !agentCarrierLabels[carrier])) {
  throw new Error('NOHM_ATLAS_PERF_AGENT_EXPECT_CARRIERS accepts electricity, gas, water, liquids and logistics.');
}

const chromeCandidates = [
  process.env.NOHM_ATLAS_CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const chromePath = chromeCandidates.find(candidate => fs.existsSync(candidate));
if (!chromePath) throw new Error('Chrome was not found. Set NOHM_ATLAS_CHROME to its executable.');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const createActiveRun = () => ({
  responses: 0,
  parseResponses: 0,
  encodedBytes: 0,
  failedRequests: 0,
  canceledRequests: 0,
  failedApiRequests: 0,
  canceledApiRequests: 0,
  canceledApiUrls: [],
  agentExchanges: [],
  pendingDiagnostics: [],
});
const isSameOriginAtlasApi = (url, targetUrl) => {
  try {
    const candidate = new URL(url);
    const target = new URL(targetUrl);
    return candidate.origin === target.origin
      && (candidate.pathname.startsWith('/api/') || candidate.pathname.startsWith('/atlas-api/'));
  } catch (_) {
    return false;
  }
};
const waitUntil = async (check, timeoutMs, label, abortCheck = null) => {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (abortCheck) {
      const abortReason = await abortCheck();
      if (abortReason) throw new Error(`${label} stopped: ${abortReason}`);
    }
    try {
      const value = await check();
      if (value) return value;
    } catch (error) { lastError = error; }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`);
};

class CdpClient {
  constructor(webSocket) {
    this.webSocket = webSocket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    webSocket.onmessage = event => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
    };
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.webSocket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(listener);
    return () => this.listeners.get(method)?.delete(listener);
  }

  once(method, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { remove(); reject(new Error(`Timed out waiting for ${method}`)); }, timeoutMs);
      const remove = this.on(method, value => { clearTimeout(timer); remove(); resolve(value); });
    });
  }

  close() { this.webSocket.close(); }
}

const metricMap = metrics => Object.fromEntries(metrics.map(metric => [metric.name, metric.value]));
const mb = bytes => Math.round((bytes / 1024 / 1024) * 10) / 10;
const ms = seconds => Math.round(seconds * 1000);

async function main() {
  let previewServer = null;
  let fixtureServer = null;
  let fixture = null;
  let fixtureRequests = [];
  let targetUrl = configuredTargetUrl;
  let backend = 'http://127.0.0.1:5001';
  if (useLiveBackend && configuredTargetUrl) {
    throw new Error('NOHM_ATLAS_PERF_LIVE_BACKEND owns the managed production preview; remove NOHM_ATLAS_PERF_URL.');
  }
  if (configuredCountry && !configuredTargetUrl && !useLiveBackend) {
    const cacheDir = process.env.NOHM_ATLAS_MAP_CACHE_DIR
      || path.resolve(__dirname, '..', '..', '..', '.atlas-runtime', 'map-responses');
    ({ server: fixtureServer, fixture, requests: fixtureRequests } = createCachedNetworkFixture({ cacheDir, country: configuredCountry }));
    await new Promise((resolve, reject) => {
      fixtureServer.once('error', reject);
      fixtureServer.listen(0, '127.0.0.1', resolve);
    });
    backend = `http://127.0.0.1:${fixtureServer.address().port}`;
  }
  if (!targetUrl) {
    const buildDir = path.resolve(__dirname, '..', 'build');
    if (!fs.existsSync(path.join(buildDir, 'asset-manifest.json'))) {
      throw new Error('Production build not found. Run npm run build with PUBLIC_URL=/atlas first.');
    }
    // Exercise the compiled Nohm contract exactly as shipped. The browser calls
    // /atlas-api and the host proxy removes that mount before forwarding the
    // request to Atlas' native /api routes. Keeping the performance harness on
    // a different prefix can silently turn loaded-network checks into 404s.
    previewServer = createPreviewServer({ buildDir, backend, apiPrefix: '/atlas-api', stripApiPrefix: true });
    await new Promise((resolve, reject) => {
      previewServer.once('error', reject);
      previewServer.listen(configuredPreviewPort, '127.0.0.1', resolve);
    });
    targetUrl = `http://127.0.0.1:${previewServer.address().port}/atlas/`;
  }
  const tempRoot = fs.realpathSync(os.tmpdir());
  const profileDir = fs.mkdtempSync(path.join(tempRoot, 'nohm-atlas-browser-budget-'));
  if (path.dirname(fs.realpathSync(profileDir)) !== tempRoot) {
    throw new Error(`Refusing unexpected Chrome profile path: ${profileDir}`);
  }

  const chrome = spawn(chromePath, [
    '--headless=new', '--disable-background-networking', '--disable-component-update',
    '--disable-default-apps', '--disable-extensions', '--disable-sync', '--metrics-recording-only',
    '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`, `--window-size=${viewportWidth},${viewportHeight}`, 'about:blank',
  ], { stdio: 'ignore', windowsHide: true });

  try {
    const portFile = path.join(profileDir, 'DevToolsActivePort');
    const port = await waitUntil(() => {
      if (!fs.existsSync(portFile)) return null;
      return Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]) || null;
    }, 15000, 'Chrome DevTools');
    const page = await waitUntil(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      return (await response.json()).find(item => item.type === 'page');
    }, 10000, 'the browser page');

    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    const client = new CdpClient(socket);
    await Promise.all([
      client.send('Page.enable'), client.send('Network.enable'), client.send('Performance.enable'),
      client.send('Runtime.enable'), client.send('HeapProfiler.enable'),
    ]);
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: viewportWidth, height: viewportHeight, deviceScaleFactor: 1, mobile: false,
    });
    await client.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 40,
      downloadThroughput: 10 * 1024 * 1024 / 8,
      uploadThroughput: 5 * 1024 * 1024 / 8,
      connectionType: 'wifi',
    });
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__atlasBrowserBudget = { longTasks: [], shifts: [], lcp: 0 };
      window.__atlasOverviewRasterStats = { hits: 0, misses: 0 };
      window.__atlasAccessibilityAudit = () => {
        const visible = node => {
          const style = getComputedStyle(node); const rect = node.getBoundingClientRect();
          return !node.closest('[inert], [aria-hidden="true"]') && !node.disabled
            && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const controls = [...document.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [tabindex]')]
          .filter(visible).filter(node => Number(node.getAttribute('tabindex')) !== -1);
        const textForIds = value => String(value || '').split(/\\s+/).filter(Boolean)
          .map(id => document.getElementById(id)?.textContent?.trim() || '').filter(Boolean).join(' ');
        const accessibleName = node => node.getAttribute('aria-label')?.trim()
          || textForIds(node.getAttribute('aria-labelledby'))
          || [...(node.labels || [])].map(label => label.textContent?.trim()).filter(Boolean).join(' ')
          || node.getAttribute('title')?.trim() || node.getAttribute('alt')?.trim()
          || node.textContent?.trim() || '';
        const unnamed = controls.filter(node => !accessibleName(node)).map(node => node.outerHTML.slice(0, 180));
        const idCounts = [...document.querySelectorAll('[id]')].reduce((counts, node) => {
          counts[node.id] = (counts[node.id] || 0) + 1; return counts;
        }, {});
        const duplicateIds = Object.entries(idCounts).filter(([, count]) => count > 1).map(([id, count]) => ({ id, count }));
        const brokenReferences = [];
        for (const node of document.querySelectorAll('[aria-labelledby], [aria-describedby], [aria-controls]')) {
          for (const attribute of ['aria-labelledby', 'aria-describedby', 'aria-controls']) {
            for (const id of String(node.getAttribute(attribute) || '').split(/\\s+/).filter(Boolean)) {
              if (!document.getElementById(id)) brokenReferences.push({ attribute, id, control: accessibleName(node).slice(0, 80) });
            }
          }
        }
        return { interactiveCount: controls.length, unnamed, duplicateIds, brokenReferences };
      };
      window.__atlasClippedInteractiveControls = () => [...document.querySelectorAll('button, input, select, textarea')]
        .filter(node => {
          const style = getComputedStyle(node); const rect = node.getBoundingClientRect();
          if (node.closest('[inert], [aria-hidden="true"]') || node.disabled
              || style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) return false;
          let clippedX = rect.left < -1 || rect.right > innerWidth + 1;
          let clippedY = rect.top < -1 || rect.bottom > innerHeight + 1;
          // Content below an in-viewport overflow viewport is reachable by
          // scrolling and is not clipped. Keep reporting controls that escape
          // the page or a non-scrollable container.
          for (let parent = node.parentElement; parent && (clippedX || clippedY); parent = parent.parentElement) {
            const parentStyle = getComputedStyle(parent);
            const parentRect = parent.getBoundingClientRect();
            const parentVisible = parentRect.right > 0 && parentRect.left < innerWidth
              && parentRect.bottom > 0 && parentRect.top < innerHeight;
            if (!parentVisible) continue;
            if (clippedX && /^(?:auto|scroll)$/.test(parentStyle.overflowX)
                && parent.scrollWidth > parent.clientWidth + 1) clippedX = false;
            if (clippedY && /^(?:auto|scroll)$/.test(parentStyle.overflowY)
                && parent.scrollHeight > parent.clientHeight + 1) clippedY = false;
          }
          return clippedX || clippedY;
        })
        .map(node => { const rect = node.getBoundingClientRect(); return {
          label: node.getAttribute('aria-label') || node.title || node.textContent.trim().slice(0, 80),
          rect: [Math.round(rect.left), Math.round(rect.top), Math.round(rect.right), Math.round(rect.bottom)],
        }; });
      try { new PerformanceObserver(list => window.__atlasBrowserBudget.longTasks.push(...list.getEntries().map(e => e.duration))).observe({ type: 'longtask', buffered: true }); } catch {}
      try { new PerformanceObserver(list => window.__atlasBrowserBudget.shifts.push(...list.getEntries().filter(e => !e.hadRecentInput).map(e => e.value))).observe({ type: 'layout-shift', buffered: true }); } catch {}
      try { new PerformanceObserver(list => { const last = list.getEntries().at(-1); if (last) window.__atlasBrowserBudget.lcp = last.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
    ` });

    // Exclude one-time Chrome/profile/network-service startup from the app
    // budget while keeping every Atlas resource cold. The tiny same-origin
    // favicon primes only the browser connection; the cache is then cleared.
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    const primed = client.once('Page.loadEventFired');
    await client.send('Page.navigate', { url: new URL('favicon.svg', targetUrl).href });
    await primed;
    await client.send('Network.clearBrowserCache');

    let activeRun = null;
    const requestUrls = new Map();
    const recentApiEvents = [];
    const recordApiEvent = (event) => {
      recentApiEvents.push(event);
      if (recentApiEvents.length > 24) recentApiEvents.shift();
    };
    const removeRequested = client.on('Network.requestWillBeSent', event => {
      const url = String(event.request?.url || '');
      requestUrls.set(event.requestId, url);
      if (activeRun && /\/api\/map-agent\/(?:interpret|judge)(?:\?|$)/.test(url)) {
        activeRun.agentExchanges.push({
          requestId: event.requestId,
          path: new URL(url).pathname,
          requestBytes: Buffer.byteLength(String(event.request?.postData || '')),
          status: null,
          response: '',
        });
      }
    });
    const removeResponse = client.on('Network.responseReceived', event => {
      const responseUrl = String(event.response?.url || '');
      if (isSameOriginAtlasApi(responseUrl, targetUrl)) {
        recordApiEvent({
          type: 'response',
          path: new URL(responseUrl).pathname,
          status: Number(event.response?.status || 0),
          mimeType: String(event.response?.mimeType || ''),
        });
      }
      if (!activeRun || event.type === 'Preflight') return;
      activeRun.responses += 1;
      if (String(event.response?.url || '').includes('/api/pypsa/parse-nc')) activeRun.parseResponses += 1;
      const exchange = activeRun.agentExchanges.find(item => item.requestId === event.requestId);
      if (exchange) {
        const run = activeRun;
        exchange.status = Number(event.response?.status || 0);
        const pending = client.send('Network.getResponseBody', { requestId: event.requestId })
          .then(({ body }) => { exchange.response = String(body || '').slice(0, 4096); })
          .catch(() => { exchange.response = '[response body unavailable]'; });
        run.pendingDiagnostics.push(pending);
      }
    });
    const removeFinished = client.on('Network.loadingFinished', event => {
      if (activeRun) activeRun.encodedBytes += event.encodedDataLength || 0;
      requestUrls.delete(event.requestId);
    });
    const removeFailed = client.on('Network.loadingFailed', event => {
      const url = requestUrls.get(event.requestId) || '';
      requestUrls.delete(event.requestId);
      const isAtlasApi = isSameOriginAtlasApi(url, targetUrl);
      if (isAtlasApi) {
        recordApiEvent({
          type: 'failed',
          path: new URL(url).pathname,
          canceled: Boolean(event.canceled),
          errorText: String(event.errorText || ''),
          blockedReason: String(event.blockedReason || ''),
        });
      }
      if (!activeRun) return;
      if (event.canceled) {
        activeRun.canceledRequests += 1;
        if (isAtlasApi) {
          activeRun.canceledApiRequests += 1;
          activeRun.canceledApiUrls.push(url.replace(new URL(targetUrl).origin, ''));
        }
      } else {
        activeRun.failedRequests += 1;
        if (isAtlasApi) activeRun.failedApiRequests += 1;
      }
    });

    const capture = async (label, cacheDisabled) => {
      activeRun = createActiveRun();
      await client.send('Network.setCacheDisabled', { cacheDisabled });
      await client.send('Performance.disable');
      await client.send('Performance.enable');
      const loaded = client.once('Page.loadEventFired');
      const started = performance.now();
      await client.send('Page.navigate', { url: targetUrl });
      await loaded;
      await waitUntil(async () => {
        const result = await client.send('Runtime.evaluate', {
          expression: "document.readyState === 'complete' && Boolean(document.querySelector('.leaflet-container'))",
          returnByValue: true,
        });
        return result.result.value;
      }, 15000, 'the Atlas map shell');
      await delay(settleMs);
      const elapsedMs = Math.round(performance.now() - started);
      const [{ metrics }, pageMetrics] = await Promise.all([
        client.send('Performance.getMetrics'),
        client.send('Runtime.evaluate', {
          expression: `JSON.stringify({
            navigation: performance.getEntriesByType('navigation')[0]?.toJSON() || {},
            paints: Object.fromEntries(performance.getEntriesByType('paint').map(e => [e.name, e.startTime])),
            resources: performance.getEntriesByType('resource').length,
            transferBytes: performance.getEntriesByType('resource').reduce((sum, e) => sum + (e.transferSize || 0), 0),
            slowResources: performance.getEntriesByType('resource')
              .map(e => ({ name: e.name.replace(location.origin, ''), durationMs: Math.round(e.duration), transferKb: Math.round((e.transferSize || 0) / 1024), initiatorType: e.initiatorType }))
              .sort((a, b) => b.durationMs - a.durationMs).slice(0, 8),
            longTasks: window.__atlasBrowserBudget?.longTasks || [],
            cumulativeLayoutShift: (window.__atlasBrowserBudget?.shifts || []).reduce((sum, value) => sum + value, 0),
            largestContentfulPaint: window.__atlasBrowserBudget?.lcp || 0,
            mapLabel: document.querySelector('.leaflet-container')?.getAttribute('aria-label') || '',
            mapRect: (() => { const r = document.querySelector('.leaflet-container')?.getBoundingClientRect(); return r ? { width: r.width, height: r.height } : null; })(),
            viewportOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
            clippedInteractiveControls: window.__atlasClippedInteractiveControls(),
            accessibilityAudit: window.__atlasAccessibilityAudit(),
          })`,
          returnByValue: true,
        }),
      ]);
      const browser = metricMap(metrics);
      const pageData = JSON.parse(pageMetrics.result.value);
      const network = activeRun;
      activeRun = null;
      return {
        label,
        elapsedMs,
        timeToFirstByteMs: Math.round(pageData.navigation.responseStart || 0),
        htmlResponseEndMs: Math.round(pageData.navigation.responseEnd || 0),
        domInteractiveMs: Math.round(pageData.navigation.domInteractive || 0),
        domContentLoadedMs: Math.round(pageData.navigation.domContentLoadedEventEnd || 0),
        loadEventMs: Math.round(pageData.navigation.loadEventEnd || 0),
        firstContentfulPaintMs: Math.round(pageData.paints['first-contentful-paint'] || 0),
        largestContentfulPaintMs: Math.round(pageData.largestContentfulPaint || 0),
        longTaskCount: pageData.longTasks.length,
        longTaskTotalMs: Math.round(pageData.longTasks.reduce((sum, value) => sum + value, 0)),
        cumulativeLayoutShift: Math.round(pageData.cumulativeLayoutShift * 1000) / 1000,
        jsHeapMb: mb(browser.JSHeapUsedSize || 0),
        domNodes: Math.round(browser.Nodes || 0),
        taskTimeMs: ms(browser.TaskDuration || 0),
        scriptTimeMs: ms(browser.ScriptDuration || 0),
        resourceCount: pageData.resources,
        resourceTransferMb: mb(pageData.transferBytes || network.encodedBytes),
        slowResources: pageData.slowResources,
        responseCount: network.responses,
        failedRequests: network.failedRequests,
        canceledRequests: network.canceledRequests,
        failedApiRequests: network.failedApiRequests,
        canceledApiRequests: network.canceledApiRequests,
        canceledApiUrls: network.canceledApiUrls,
        mapLabel: pageData.mapLabel,
        mapWidth: Math.round(pageData.mapRect?.width || 0),
        mapHeight: Math.round(pageData.mapRect?.height || 0),
        viewportOverflowX: pageData.viewportOverflowX,
        clippedInteractiveControls: pageData.clippedInteractiveControls,
        accessibilityAudit: pageData.accessibilityAudit,
      };
    };

    const evaluateValue = async expression => {
      const result = await client.send('Runtime.evaluate', { expression, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed.');
      return result.result.value;
    };

    const captureAction = async (
      label,
      triggerExpression,
      readyExpression,
      timeoutMs = 30000,
      { expectParse = true, terminalExpression = '' } = {},
    ) => {
      activeRun = createActiveRun();
      await client.send('Performance.disable');
      await client.send('Performance.enable');
      await evaluateValue("Object.assign(window.__atlasBrowserBudget, { longTasks: [], shifts: [] })");
      const beforeMetrics = metricMap((await client.send('Performance.getMetrics')).metrics);
      const started = performance.now();
      const triggered = await evaluateValue(triggerExpression);
      if (!triggered) throw new Error(`Could not start ${label}.`);
      const terminalCheck = terminalExpression
        ? () => evaluateValue(terminalExpression)
        : null;
      try {
        if (expectParse) {
          await waitUntil(
            () => activeRun.parseResponses > 0,
            timeoutMs,
            `${label} response`,
            terminalCheck,
          );
        }
        // React first commits the new records, then the batched Leaflet owner
        // publishes its drawing state. Do not accept the previous ready label.
        await delay(350);
        await waitUntil(async () => {
          if (!await evaluateValue(readyExpression)) return false;
          await delay(250);
          return evaluateValue(readyExpression);
        }, timeoutMs, label, terminalCheck);
      } catch (error) {
        await Promise.allSettled(activeRun?.pendingDiagnostics || []);
        const diagnostics = await evaluateValue(`JSON.stringify({
          controls: [...document.querySelectorAll('[aria-label$="map layer"]')].map(node => ({ label: node.getAttribute('aria-label'), checked: node.checked, ariaChecked: node.getAttribute('aria-checked'), ariaPressed: node.getAttribute('aria-pressed'), disabled: node.disabled, text: node.textContent })),
          statuses: [...document.querySelectorAll('[role="status"]')].map(node => node.textContent.trim()).filter(Boolean),
          messages: document.body.innerText.slice(0, 2400),
        })`);
        console.error(`${label} diagnostics: ${diagnostics}`);
        const requestDiagnostics = activeRun ? { ...activeRun, pendingDiagnostics: undefined } : null;
        console.error(`Active requests: ${JSON.stringify(requestDiagnostics)}; fixture requests: ${JSON.stringify(fixtureRequests.slice(-12))}`);
        throw error;
      }
      await delay(settleMs);
      // A late React/Leaflet commit can briefly re-enter drawing after the first
      // ready observation. Require the requested state to remain ready after the
      // normal settle window before collecting final evidence.
      await waitUntil(
        () => evaluateValue(readyExpression),
        timeoutMs,
        `${label} final settled state`,
        terminalCheck,
      );
      const elapsedMs = Math.round(performance.now() - started);
      // Measure the retained steady-state graph, not whichever amount of
      // short-lived response/parsing garbage V8 happened to collect first.
      // This keeps the consumer-hardware ceiling deterministic while leaks
      // still remain visible (the domain-cycle gate uses the same treatment).
      await client.send('HeapProfiler.collectGarbage');
      const [{ metrics }, pageState] = await Promise.all([
        client.send('Performance.getMetrics'),
        evaluateValue(`JSON.stringify({
          longTasks: window.__atlasBrowserBudget?.longTasks || [],
          cumulativeLayoutShift: (window.__atlasBrowserBudget?.shifts || []).reduce((sum, value) => sum + value, 0),
          countryLoaded: Boolean(document.querySelector('select[aria-label="Add country network"] option[value="${configuredCountry}"]:disabled')),
          loadedCountryCodes: [...document.querySelectorAll('select[aria-label="Add country network"] option[value]:disabled')]
            .map(option => option.value).filter(Boolean),
          resolution: document.querySelector('input[aria-label="Network resolution"]')?.getAttribute('aria-valuetext') || '',
          activeLayers: [...document.querySelectorAll('[aria-label$="map layer"]')]
            .filter(control => control.checked || control.getAttribute('aria-checked') === 'true' || control.getAttribute('aria-pressed') === 'true')
            .map(control => String(control.getAttribute('aria-label') || '').replace(/ map layer$/, '')),
          activeCarriers: (() => {
            const toggle = document.querySelector('[aria-label="Toggle multi-network overlay"]');
            return toggle?.getAttribute('aria-pressed') === 'true'
              ? String(toggle.getAttribute('data-atlas-overlay-carriers') || '').split(',').filter(Boolean)
              : [document.querySelector('select[aria-label="Network carrier"]')?.value].filter(Boolean);
          })(),
          activeOverlayCarriers: String(document.querySelector('[aria-label="Toggle multi-network overlay"]')
            ?.getAttribute('data-atlas-overlay-carriers') || '').split(',').filter(Boolean),
          status: [...document.querySelectorAll('[role="status"]')].map(node => node.textContent.trim()).filter(Boolean),
          buses: (document.body.innerText.match(/Buses\\s+([\\d,.]+)/) || [])[1] || '',
          acLines: (document.body.innerText.match(/AC lines\\s+([\\d,.]+)/) || [])[1] || '',
          crossBorderLinks: Number(document.querySelector('.leaflet-container')?.getAttribute('data-atlas-cross-border-count') || 0),
          liveDomNodes: document.getElementsByTagName('*').length,
          canvases: document.querySelectorAll('.leaflet-container canvas').length,
          svgPaths: document.querySelectorAll('.leaflet-container path').length,
          mapLabel: document.querySelector('.leaflet-container')?.getAttribute('aria-label') || '',
          viewportOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
          clippedInteractiveControls: window.__atlasClippedInteractiveControls(),
          assistantPanel: (() => {
            const panel = document.querySelector('[aria-label="Map assistant"]');
            const rect = panel?.getBoundingClientRect();
            return rect ? [Math.round(rect.left), Math.round(rect.top), Math.round(rect.right), Math.round(rect.bottom)] : null;
          })(),
          accessibilityAudit: window.__atlasAccessibilityAudit(),
        })`),
      ]);
      const browser = metricMap(metrics);
      const pageData = JSON.parse(pageState);
      const network = activeRun;
      activeRun = null;
      return {
        label, elapsedMs,
        longTaskCount: pageData.longTasks.length,
        longTaskTotalMs: Math.round(pageData.longTasks.reduce((sum, value) => sum + value, 0)),
        cumulativeLayoutShift: Math.round(pageData.cumulativeLayoutShift * 1000) / 1000,
        jsHeapMb: mb(browser.JSHeapUsedSize || 0), liveDomNodes: pageData.liveDomNodes,
        retainedDomNodes: Math.round(browser.Nodes || 0),
        taskTimeMs: ms((browser.TaskDuration || 0) - (beforeMetrics.TaskDuration || 0)),
        scriptTimeMs: ms((browser.ScriptDuration || 0) - (beforeMetrics.ScriptDuration || 0)),
        responseCount: network.responses, parseResponses: network.parseResponses,
        transferMb: mb(network.encodedBytes), failedRequests: network.failedRequests,
        canceledRequests: network.canceledRequests, failedApiRequests: network.failedApiRequests,
        canceledApiRequests: network.canceledApiRequests, canceledApiUrls: network.canceledApiUrls,
        countryLoaded: pageData.countryLoaded,
        loadedCountryCodes: pageData.loadedCountryCodes, resolution: pageData.resolution,
        activeLayers: pageData.activeLayers, activeCarriers: pageData.activeCarriers,
        activeOverlayCarriers: pageData.activeOverlayCarriers,
        buses: pageData.buses, acLines: pageData.acLines, crossBorderLinks: pageData.crossBorderLinks, canvases: pageData.canvases,
        svgPaths: pageData.svgPaths, mapLabel: pageData.mapLabel, status: pageData.status,
        viewportOverflowX: pageData.viewportOverflowX,
        clippedInteractiveControls: pageData.clippedInteractiveControls,
        assistantPanel: pageData.assistantPanel,
        accessibilityAudit: pageData.accessibilityAudit,
      };
    };

    const cold = await capture('cold', true);
    const warmRuns = [];
    for (let sample = 1; sample <= warmSampleCount; sample += 1) {
      // Keep every run coherent rather than combining unrelated per-metric
      // medians. The selected run is the median by the user-facing LCP gate;
      // functional failures and peak memory are checked across all samples.
      // eslint-disable-next-line no-await-in-loop
      warmRuns.push(await capture(`warm ${sample}`, false));
    }
    const warm = {
      ...[...warmRuns].sort((a, b) => a.largestContentfulPaintMs - b.largestContentfulPaintMs)[Math.floor(warmRuns.length / 2)],
      label: 'warm median',
    };
    let compactLayout = null;
    if (viewportWidth <= 1023) {
      const opened = await evaluateValue(`(() => {
        const control = document.querySelector('[aria-label="Show domain controls"]');
        if (!control) return false; control.click(); return true;
      })()`);
      if (opened) await delay(300);
      const sectionSwitches = [];
      if (opened) {
        for (const [label, expectedText] of [
          ['Operations', 'Run mode'],
          ['Display', 'Load a local network to enable domain filters.'],
          ['Clusters', 'Regional clustering'],
          ['Geography', 'Countries'],
        ]) {
          // Exercise the actual compact selector and leave Geography selected
          // for the country-load workflow below.
          // eslint-disable-next-line no-await-in-loop
          const selected = await evaluateValue(`(() => {
            const group = document.querySelector('[aria-label="Domain sections"]');
            const button = [...(group?.querySelectorAll('button') || [])]
              .find(node => node.textContent.trim() === ${JSON.stringify(label)});
            if (!button) return false;
            button.click();
            return true;
          })()`);
          // eslint-disable-next-line no-await-in-loop
          if (selected) await delay(100);
          // eslint-disable-next-line no-await-in-loop
          sectionSwitches.push(JSON.parse(await evaluateValue(`JSON.stringify((() => {
            const group = document.querySelector('[aria-label="Domain sections"]');
            const button = [...(group?.querySelectorAll('button') || [])]
              .find(node => node.textContent.trim() === ${JSON.stringify(label)});
            const aside = group?.closest('aside');
            return {
              label: ${JSON.stringify(label)},
              selected: button?.getAttribute('aria-pressed') === 'true',
              content: Boolean(aside?.innerText.toLowerCase().includes(${JSON.stringify(expectedText.toLowerCase())})),
            };
          })())`)));
        }
      }
      compactLayout = JSON.parse(await evaluateValue(`JSON.stringify((() => {
        const more = [...document.querySelectorAll('button')].find(node => node.textContent.trim().startsWith('More Settings'));
        const sidebar = more?.closest('aside');
        const rect = node => { const r = node?.getBoundingClientRect(); return r ? [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] : null; };
        const clipped = window.__atlasClippedInteractiveControls();
        return {
          opened: Boolean(sidebar && !sidebar.hasAttribute('inert')),
          sidebar: rect(sidebar),
          moreSettings: rect(more),
          sectionSwitches: ${JSON.stringify(sectionSwitches)},
          clipped,
          accessibilityAudit: window.__atlasAccessibilityAudit(),
        };
      })())`));
    }
    let loadedNetwork = null;
    if (configuredCountry) {
      try {
        await waitUntil(() => evaluateValue(`Boolean(document.querySelector('select[aria-label="Add country network"] option[value="${configuredCountry}"]'))`), 15000, `${configuredCountry} catalogue option`);
      } catch (error) {
        const diagnostics = await evaluateValue(`JSON.stringify({
          options: [...document.querySelectorAll('select[aria-label="Add country network"] option')].map(option => ({ value: option.value, text: option.textContent, disabled: option.disabled })),
          messages: document.body.innerText.slice(0, 2400),
        })`);
        console.error(`Catalogue diagnostics: ${diagnostics}`);
        console.error(`Recent API events: ${JSON.stringify(recentApiEvents)}`);
        console.error(`Fixture requests: ${JSON.stringify(fixtureRequests)}`);
        throw error;
      }
      const ready = `(() => {
        const option = document.querySelector('select[aria-label="Add country network"] option[value="${configuredCountry}"]');
        return Boolean(option?.disabled) && [...document.querySelectorAll('[role="status"]')].some(node => node.textContent.trim() === 'Network ready');
      })()`;
      const selectCountry = `(() => {
        const select = document.querySelector('select[aria-label="Add country network"]');
        if (!select || ![...select.options].some(option => option.value === '${configuredCountry}')) return false;
        select.value = '${configuredCountry}';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`;
      const grid = await captureAction(`${configuredCountry} grid`, selectCountry, ready, 45000);
      const extraCountryLoads = [];
      for (const country of configuredExtraCountries) {
        // eslint-disable-next-line no-await-in-loop
        await waitUntil(() => evaluateValue(`Boolean(document.querySelector('select[aria-label="Add country network"] option[value="${country}"]'))`), 15000, `${country} catalogue option`);
        const extraReady = `(() => {
          const option = document.querySelector('select[aria-label="Add country network"] option[value="${country}"]');
          return Boolean(option?.disabled) && [...document.querySelectorAll('[role="status"]')].some(node => node.textContent.trim() === 'Network ready');
        })()`;
        const selectExtraCountry = `(() => {
          const select = document.querySelector('select[aria-label="Add country network"]');
          if (!select || ![...select.options].some(option => option.value === '${country}' && !option.disabled)) return false;
          select.value = '${country}';
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        })()`;
        // eslint-disable-next-line no-await-in-loop
        extraCountryLoads.push(await captureAction(`${country} grid`, selectExtraCountry, extraReady, 45000));
      }
      let mapDisplay = null;
      if (configuredMapDisplay) {
        const hidden = await captureAction(
          `${configuredCountry} hide nodes and boundaries`,
          `(() => {
            const nodes = document.querySelector('[aria-label="Node markers"]');
            const boundaries = document.querySelector('[aria-label="Geographic boundaries"]');
            if (!nodes || !boundaries || nodes.disabled || boundaries.disabled) return false;
            if (nodes.getAttribute('aria-pressed') === 'true') nodes.click();
            if (boundaries.getAttribute('aria-pressed') === 'true') boundaries.click();
            return true;
          })()`,
          `(() => {
            const nodes = document.querySelector('[aria-label="Node markers"]');
            const boundaries = document.querySelector('[aria-label="Geographic boundaries"]');
            return nodes?.getAttribute('aria-pressed') === 'false'
              && boundaries?.getAttribute('aria-pressed') === 'false'
              && getComputedStyle(document.querySelector('.leaflet-network-nodes-pane')).display === 'none'
              && getComputedStyle(document.querySelector('.leaflet-network-boundaries-pane')).display === 'none';
          })()`,
          10000,
          { expectParse: false },
        );
        const restored = await captureAction(
          `${configuredCountry} restore nodes and boundaries`,
          `(() => {
            const nodes = document.querySelector('[aria-label="Node markers"]');
            const boundaries = document.querySelector('[aria-label="Geographic boundaries"]');
            if (!nodes || !boundaries || nodes.disabled || boundaries.disabled) return false;
            nodes.click(); boundaries.click(); return true;
          })()`,
          `(() => {
            const nodes = document.querySelector('[aria-label="Node markers"]');
            const boundaries = document.querySelector('[aria-label="Geographic boundaries"]');
            return nodes?.getAttribute('aria-pressed') === 'true'
              && boundaries?.getAttribute('aria-pressed') === 'true'
              && getComputedStyle(document.querySelector('.leaflet-network-nodes-pane')).display !== 'none'
              && getComputedStyle(document.querySelector('.leaflet-network-boundaries-pane')).display !== 'none';
          })()`,
          10000,
          { expectParse: false },
        );
        mapDisplay = { hidden, restored };
      }
      let resolutionSlider = null;
      if (configuredResolutionSlider) {
        resolutionSlider = await captureAction(
          `${configuredCountry} final-snap resolution slider`,
          `(() => {
            const slider = document.querySelector('input[aria-label="Network resolution"]');
            if (!slider || slider.disabled || Number(slider.max) < 4) return false;
            const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            for (const value of ['3', '2', '0']) {
              setValue.call(slider, value);
              slider.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return true;
          })()`,
          `(() => {
            const slider = document.querySelector('input[aria-label="Network resolution"]');
            const badgeReady = [...document.querySelectorAll('span')]
              .some(node => node.textContent.trim() === 'Bidding zone');
            return Boolean(slider && !slider.disabled && slider.value === '0'
              && slider.getAttribute('aria-valuetext') === 'Bidding zone' && badgeReady
              && [...document.querySelectorAll('[role="status"]')]
                .some(node => node.textContent.trim() === 'Network ready'));
          })()`,
          45000,
        );
      }
      const domains = [];
      for (const domain of ['Storage', 'Supply', 'Demand']) {
        const label = `${domain} map layer`;
        const trigger = `(() => { const control = document.querySelector('[aria-label="${label}"]'); if (!control || control.disabled) return false; control.click(); return true; })()`;
        const complete = `(() => {
          const control = document.querySelector('[aria-label="${label}"]');
          const loaded = control && !/\\bLoad\\b/i.test(control.textContent || '');
          return loaded && !control.disabled && [...document.querySelectorAll('[role="status"]')].some(node => node.textContent.trim() === 'Network ready');
        })()`;
        // eslint-disable-next-line no-await-in-loop
        domains.push(await captureAction(`${configuredCountry} ${domain.toLowerCase()}`, trigger, complete, 45000));
      }
      // Lazy loading intentionally leaves each requested domain visible. Bring
      // the UI to the common single-view baseline before measuring switches.
      await evaluateValue(`(() => {
        for (const control of document.querySelectorAll('[aria-label$="map layer"]')) {
          const domain = control.getAttribute('aria-label');
          const visible = control.getAttribute('aria-pressed') === 'true';
          if ((domain === 'Grid map layer') !== visible) control.click();
        }
      })()`);
      await delay(500);
      await client.send('HeapProfiler.collectGarbage');
      activeRun = createActiveRun();
      const cycleBefore = metricMap((await client.send('Performance.getMetrics')).metrics);
      const cycleStarted = performance.now();
      let toggleCount = 0;
      for (let cycle = 0; cycle < domainCycleCount; cycle += 1) {
        for (const domain of ['Grid', 'Storage', 'Supply', 'Demand']) {
          // eslint-disable-next-line no-await-in-loop
          const switched = await evaluateValue(`(() => {
            const controls = [...document.querySelectorAll('[aria-label$="map layer"]')];
            const target = controls.find(control => control.getAttribute('aria-label') === '${domain} map layer');
            if (!target || target.disabled || /\\bLoad\\b/i.test(target.textContent || '')) return false;
            for (const control of controls) {
              const visible = control.getAttribute('aria-pressed') === 'true';
              if ((control === target) !== visible) control.click();
            }
            return true;
          })()`);
          if (!switched) throw new Error(`Could not cycle the loaded ${domain} domain.`);
          toggleCount += 1;
          // Allow React and the batched Leaflet owner to settle between real
          // user-equivalent selections; the data itself must already be cached.
          // eslint-disable-next-line no-await-in-loop
          await delay(180);
        }
      }
      await delay(500);
      await client.send('HeapProfiler.collectGarbage');
      const [cycleAfterResult, cyclePageState] = await Promise.all([
        client.send('Performance.getMetrics'),
        evaluateValue(`JSON.stringify({
          liveDomNodes: document.getElementsByTagName('*').length,
          activeDomain: [...document.querySelectorAll('[aria-label$="map layer"]')]
            .find(control => control.checked || control.getAttribute('aria-checked') === 'true' || control.getAttribute('aria-pressed') === 'true')
            ?.getAttribute('aria-label') || '',
          mapLabel: document.querySelector('.leaflet-container')?.getAttribute('aria-label') || '',
          accessibilityAudit: window.__atlasAccessibilityAudit(),
        })`),
      ]);
      const cycleAfter = metricMap(cycleAfterResult.metrics);
      const cyclePage = JSON.parse(cyclePageState);
      const cycleNetwork = activeRun;
      activeRun = null;
      const domainCycle = {
        cycles: domainCycleCount,
        toggles: toggleCount,
        elapsedMs: Math.round(performance.now() - cycleStarted),
        jsHeapMb: mb(cycleAfter.JSHeapUsedSize || 0),
        heapGrowthMb: mb(Math.max(0, (cycleAfter.JSHeapUsedSize || 0) - (cycleBefore.JSHeapUsedSize || 0))),
        liveDomNodes: cyclePage.liveDomNodes,
        retainedDomNodes: Math.round(cycleAfter.Nodes || 0),
        activeDomain: cyclePage.activeDomain,
        mapLabel: cyclePage.mapLabel,
        accessibilityAudit: cyclePage.accessibilityAudit,
        responseCount: cycleNetwork.responses,
        parseResponses: cycleNetwork.parseResponses,
        failedRequests: cycleNetwork.failedRequests,
        canceledRequests: cycleNetwork.canceledRequests,
        failedApiRequests: cycleNetwork.failedApiRequests,
        canceledApiRequests: cycleNetwork.canceledApiRequests,
        canceledApiUrls: cycleNetwork.canceledApiUrls,
      };
      const overlayTransitions = [];
      if (configuredOverlayCarriers.length) {
        // Use the normal Grid-only view before adding carrier topology. Every
        // electricity domain is already hydrated, so this must remain a local
        // display transition rather than another parse.
        await evaluateValue(`(() => {
          for (const control of document.querySelectorAll('[aria-label$="map layer"]')) {
            const visible = control.getAttribute('aria-pressed') === 'true';
            if ((control.getAttribute('aria-label') === 'Grid map layer') !== visible) control.click();
          }
        })()`);
        await delay(400);
        overlayTransitions.push(await captureAction(
          `${configuredCountry} enable overlay`,
          `(() => { const control = document.querySelector('[aria-label="Toggle multi-network overlay"]'); if (!control || control.disabled) return false; if (control.getAttribute('aria-pressed') !== 'true') control.click(); return true; })()`,
          `(() => { const control = document.querySelector('[aria-label="Toggle multi-network overlay"]'); return control?.getAttribute('aria-pressed') === 'true' && Boolean(document.querySelector('[aria-label="Show Methane gas in overlay"], [aria-label="Hide Methane gas in overlay"]')); })()`,
          45000,
          { expectParse: false },
        ));
        for (const carrier of configuredOverlayCarriers) {
          const carrierLabel = overlayCarrierLabels[carrier];
          // eslint-disable-next-line no-await-in-loop
          overlayTransitions.push(await captureAction(
            `${configuredCountry} add ${carrier}`,
            `(() => { const control = document.querySelector('[aria-label="Show ${carrierLabel} in overlay"]'); if (!control || control.disabled) return false; control.click(); return true; })()`,
            `(() => { const control = document.querySelector('[aria-label="Hide ${carrierLabel} in overlay"]'); const text = control?.textContent || ''; return Boolean(control && !control.disabled && !/Loading|Load failed|Update failed/i.test(text) && /assets|No records/i.test(text)); })()`,
            90000,
            { expectParse: false },
          ));
        }
      }
      let clustering = null;
      if (configuredClustering) {
        const opened = await evaluateValue(`(() => {
          const button = [...document.querySelectorAll('button')]
            .find(node => node.textContent.trim() === 'Clusters')
            || [...document.querySelectorAll('button')]
              .find(node => node.textContent.includes('Regional clustering'));
          if (!button) return false;
          button.click();
          return true;
        })()`);
        if (!opened) throw new Error('Could not open Regional clustering controls.');
        await waitUntil(
          () => evaluateValue(`Boolean(document.querySelector('[data-testid="regional-clustering-controls"]'))`),
          10000,
          'the lazy regional clustering controls',
        );
        const nuts2 = await captureAction(
          `${configuredCountry} NUTS 2 clustering`,
          `(() => { const button = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === 'Build regional clusters'); if (!button || button.disabled) return false; button.click(); return true; })()`,
          `(() => Boolean(document.querySelector('.leaflet-regional-clusters-pane canvas')) && [...document.querySelectorAll('[role="status"]')].some(node => /NUTS 2 regions clustered/.test(node.textContent)))()`,
          30000,
          { expectParse: false },
        );
        const opacityPrimed = await evaluateValue(`(() => {
          const canvas = document.querySelector('.leaflet-regional-clusters-pane canvas');
          const select = document.querySelector('[aria-label="Cluster overlay opacity"]');
          if (!canvas || !select) return false;
          window.__atlasClusterCanvas = canvas;
          select.value = '65';
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        })()`);
        if (!opacityPrimed) throw new Error('Could not change regional cluster opacity.');
        await delay(350);
        const opacityStable = await evaluateValue(`(() => {
          const pane = document.querySelector('.leaflet-regional-clusters-pane');
          return document.querySelector('.leaflet-regional-clusters-pane canvas') === window.__atlasClusterCanvas
            && Math.abs(Number.parseFloat(pane?.style.opacity || '0') - 0.65) < 0.01;
        })()`);
        const toggled = await evaluateValue(`(() => {
          const control = document.querySelector('[aria-label="Show regional clusters on map"]');
          if (!control || control.getAttribute('aria-checked') !== 'true') return false;
          control.click();
          control.click();
          return control.getAttribute('aria-checked') === 'true';
        })()`);
        const evidenceRefresh = await captureAction(
          `${configuredCountry} Eurostat evidence refresh`,
          `(() => {
            const input = [...document.querySelectorAll('label')]
              .find(label => label.textContent.includes('Unemployment rate'))?.querySelector('input');
            const canvas = document.querySelector('.leaflet-regional-clusters-pane canvas');
            if (!input || input.disabled || input.checked || !canvas) return false;
            window.__atlasClusterColourGap = false;
            window.__atlasClusterColourProbe = window.setInterval(() => {
              if (!document.querySelector('.leaflet-regional-clusters-pane canvas')) window.__atlasClusterColourGap = true;
            }, 16);
            input.click();
            return Boolean(document.querySelector('.leaflet-regional-clusters-pane canvas'));
          })()`,
          `(() => {
            const input = [...document.querySelectorAll('label')]
              .find(label => label.textContent.includes('Unemployment rate'))?.querySelector('input');
            const button = [...document.querySelectorAll('button')]
              .find(node => node.textContent.trim() === 'Build regional clusters');
            return Boolean(input?.checked && button && document.querySelector('.leaflet-regional-clusters-pane canvas'));
          })()`,
          30000,
          { expectParse: false },
        );
        const colourContinuity = await evaluateValue(`(() => {
          window.clearInterval(window.__atlasClusterColourProbe);
          return window.__atlasClusterColourGap === false
            && Boolean(document.querySelector('.leaflet-regional-clusters-pane canvas'));
        })()`);
        const nuts3 = await captureAction(
          `${configuredCountry} NUTS 3 clustering`,
          `(() => {
            const select = document.querySelector('[aria-label="Cluster region level"]');
            if (!select || !document.querySelector('.leaflet-regional-clusters-pane canvas')) return false;
            select.value = '3';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return Boolean(document.querySelector('.leaflet-regional-clusters-pane canvas'));
          })()`,
          `(() => Boolean(document.querySelector('.leaflet-regional-clusters-pane canvas')) && [...document.querySelectorAll('[role="status"]')].some(node => /NUTS 3 regions clustered/.test(node.textContent)))()`,
          30000,
          { expectParse: false },
        );
        clustering = {
          nuts2,
          evidenceRefresh,
          nuts3,
          colourContinuity,
          opacityStable,
          visibilityToggleStable: toggled,
          status: await evaluateValue(`([...document.querySelectorAll('[role="status"]')].map(node => node.textContent.trim()).find(text => /NUTS 3 regions clustered/.test(text)) || '')`),
        };
      }
      loadedNetwork = {
        country: configuredCountry,
        source: fixture ? 'managed cached fixture' : useLiveBackend ? 'production preview + live backend' : 'live target',
        fixture: fixture ? Object.fromEntries([...fixture.entries].map(([scope, entry]) => [scope, {
          markers: entry.markers, connections: entry.connections, acLines: entry.acLines, dcLinks: entry.dcLinks,
          gzipKb: Math.round(entry.gzip.length / 102.4) / 10,
        }])) : null,
        grid, extraCountryLoads, mapDisplay, resolutionSlider, domains, domainCycle, overlayTransitions, clustering,
        totalDomainElapsedMs: domains.reduce((sum, item) => sum + item.elapsedMs, 0),
      };
    }
    let agentCommand = null;
    let agentSoak = null;
    if (configuredAgentCommand) {
      const encodedCommand = JSON.stringify(configuredAgentCommand);
      const encodedResolution = JSON.stringify(configuredAgentExpectedResolution);
      const encodedLayers = JSON.stringify(configuredAgentExpectedLayers);
      const encodedCarriers = JSON.stringify(configuredAgentExpectedCarriers);
      const expectedCountries = configuredAgentExpectedCountries;
      const assistantOpened = await evaluateValue(`(() => {
        const input = document.querySelector('input[aria-label="Message EMIL"]');
        if (input) return true;
        const open = document.querySelector('[aria-label="Open map assistant"]');
        if (!open) return false;
        open.click();
        return true;
      })()`);
      if (!assistantOpened) throw new Error('Could not open the EMIL assistant.');
      await waitUntil(
        () => evaluateValue(`Boolean(document.querySelector('input[aria-label="Message EMIL"]'))`),
        5000,
        'the EMIL message composer',
      );
      agentCommand = await captureAction(
        'EMIL browser command',
        `(() => {
          const input = document.querySelector('input[aria-label="Message EMIL"]');
          if (!input) return false;
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          setter.call(input, ${encodedCommand});
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          requestAnimationFrame(() => document.querySelector('[aria-label="Send assistant message"]')?.click());
          return true;
        })()`,
        `(() => {
          const log = document.querySelector('[aria-label="Conversation with EMIL"]');
          const text = log?.textContent || '';
          const loaded = [...document.querySelectorAll('select[aria-label="Add country network"] option[value]:disabled')]
            .map(option => option.value).filter(Boolean);
          const resolution = document.querySelector('input[aria-label="Network resolution"]')?.getAttribute('aria-valuetext') || '';
          const activeLayers = [...document.querySelectorAll('[aria-label$="map layer"]')]
            .filter(control => control.checked || control.getAttribute('aria-checked') === 'true' || control.getAttribute('aria-pressed') === 'true')
            .map(control => String(control.getAttribute('aria-label') || '').replace(/ map layer$/, ''));
          const expectedLayers = ${encodedLayers};
          const expectedCarriers = ${encodedCarriers};
          const overlayToggle = document.querySelector('[aria-label="Toggle multi-network overlay"]');
          const overlayEnabled = overlayToggle?.getAttribute('aria-pressed') === 'true';
          const activeCarriers = overlayEnabled
            ? String(overlayToggle?.getAttribute('data-atlas-overlay-carriers') || '').split(',').filter(Boolean)
            : [document.querySelector('select[aria-label="Network carrier"]')?.value].filter(Boolean);
          const statuses = [...document.querySelectorAll('[role="status"]')]
            .map(node => node.textContent.trim()).filter(Boolean);
          const mapSettled = statuses.some(status => /^(?:Multi-network overlay|Network) ready$/.test(status))
            && !statuses.some(status => /^(?:Drawing network|Updating map)/.test(status));
          return text.includes(${encodedCommand}) && /Verified\\s*[—-]/.test(text) && !text.includes('Working on it...')
            && mapSettled
            && (!${expectedCountries} || loaded.length === ${expectedCountries})
            && (!${encodedResolution} || String(resolution).trim().toLowerCase() === String(${encodedResolution}).trim().toLowerCase())
            && (!expectedLayers.length || (activeLayers.length === expectedLayers.length
              && expectedLayers.every(layer => activeLayers.includes(layer))))
            && (!expectedCarriers.length || (activeCarriers.length === expectedCarriers.length
              && expectedCarriers.every(carrier => activeCarriers.includes(carrier))));
        })()`,
        agentCommandBudgetMs,
        {
          expectParse: configuredAgentExpectedCountries > 0,
          terminalExpression: `(() => {
            const text = document.querySelector('[aria-label="Conversation with EMIL"]')?.textContent || '';
            const failure = text.match(/(?:reasoning service is unavailable|could not produce a clear action plan|no map changes were made|could not change the map)/i);
            return failure?.[0] || '';
          })()`,
        },
      );
      agentCommand.conversation = await evaluateValue(`document.querySelector('[aria-label="Conversation with EMIL"]')?.textContent || ''`);

      if (configuredAgentSoakCycles) {
        activeRun = createActiveRun();

        const openedLandPanel = await evaluateValue(`(() => {
          if (document.querySelector('[aria-label="Land overlay opacity"]')) return true;
          const control = document.querySelector('[aria-label="Toggle Land and Constraints overlay"]');
          if (!control) return false;
          control.click();
          return true;
        })()`);
        if (!openedLandPanel) throw new Error('Could not open Land and Constraints controls for the soak.');
        await waitUntil(
          () => evaluateValue(`Boolean(document.querySelector('[aria-label="Land overlay opacity"]'))`),
          5000,
          'the land opacity control',
        );
        const landLayerInitiallyReady = await evaluateValue(`Boolean(document.querySelector('.leaflet-land-constraints-pane .leaflet-layer'))`);
        if (!landLayerInitiallyReady) {
          const customScopeOpened = await evaluateValue(`(() => {
            const panel = document.querySelector('[aria-label="Land and Constraints controls"]');
            if (!panel) return false;
            const scope = [...panel.querySelectorAll('button')].find(button => /^(?:Following map|Custom scope)$/.test(button.textContent.trim()));
            if (!scope) return false;
            if (scope.textContent.trim() === 'Following map') scope.click();
            return true;
          })()`);
          if (!customScopeOpened) throw new Error('Could not open the supported custom land scope for the soak.');
          await waitUntil(
            () => evaluateValue(`Boolean([...document.querySelectorAll('[aria-label="Land and Constraints controls"] button')].find(button => button.textContent.trim() === 'Europe'))`),
            5000,
            'the supported Europe land scope',
          );
          const europeSelected = await evaluateValue(`(() => {
            const panel = document.querySelector('[aria-label="Land and Constraints controls"]');
            const europe = [...panel.querySelectorAll('button')].find(button => button.textContent.trim() === 'Europe');
            if (!europe) return false;
            europe.click();
            return true;
          })()`);
          if (!europeSelected) throw new Error('Could not select the supported Europe land scope for the soak.');
          await waitUntil(
            () => evaluateValue(`Boolean(document.querySelector('.leaflet-land-constraints-pane .leaflet-layer'))`),
            15000,
            'the land tile layer',
          );
        }
        const capturedLandLayer = await evaluateValue(`(() => {
          const layer = document.querySelector('.leaflet-land-constraints-pane .leaflet-layer');
          if (!layer) return false;
          window.__atlasSoakLandLayer = layer;
          return [...layer.querySelectorAll('img')].every(image => image.src.includes('opacity=100'));
        })()`);
        if (!capturedLandLayer) throw new Error('Land tiles were not available with the stable opacity cache key.');

        // Prime every presentation cache before taking the leak baseline. The
        // first interaction can legitimately create projected vertices, raster
        // snapshots and retained node/boundary renderers; measuring those lazy
        // allocations as a leak made the result depend on whether the initial
        // canvas happened to finish just before or after EMIL published ready.
        for (const label of ['Zoom in', 'Zoom in', 'Zoom out', 'Zoom out']) {
          // eslint-disable-next-line no-await-in-loop
          const clicked = await evaluateValue(`(() => { const control = document.querySelector('[aria-label="${label}"]'); if (!control || control.disabled) return false; control.click(); return true; })()`);
          if (!clicked) throw new Error(`Could not activate ${label} while priming the presentation cache.`);
          // eslint-disable-next-line no-await-in-loop
          await delay(420);
        }
        for (const label of ['Node markers', 'Node markers', 'Geographic boundaries', 'Geographic boundaries']) {
          // eslint-disable-next-line no-await-in-loop
          const clicked = await evaluateValue(`(() => { const control = document.querySelector('[aria-label="${label}"]'); if (!control || control.disabled) return false; control.click(); return true; })()`);
          if (!clicked) throw new Error(`Could not toggle ${label} while priming the presentation cache.`);
          // eslint-disable-next-line no-await-in-loop
          await delay(160);
        }
        await waitUntil(() => evaluateValue(`(() => {
          const statuses = [...document.querySelectorAll('[role="status"]')].map(node => node.textContent.trim());
          return statuses.some(status => /^(?:Multi-network overlay|Network) ready$/.test(status))
            && !statuses.some(status => /^(?:Drawing network|Updating map)/.test(status));
        })()`), 60000, 'the primed presentation cache');

        // Exclude intentional one-time land and renderer initialization from
        // leak growth. The measured cycles now represent repeated user input.
        await delay(Math.max(settleMs, 1800));
        await client.send('HeapProfiler.collectGarbage');
        const soakBaseline = metricMap((await client.send('Performance.getMetrics')).metrics);
        activeRun = createActiveRun();
        await client.send('Performance.disable');
        await client.send('Performance.enable');
        await evaluateValue("Object.assign(window.__atlasBrowserBudget, { longTasks: [], shifts: [] }); Object.assign(window.__atlasOverviewRasterStats, { hits: 0, misses: 0 })");
        const soakPerformanceBaseline = metricMap((await client.send('Performance.getMetrics')).metrics);
        const soakStarted = performance.now();
        let soakStepBaseline = soakPerformanceBaseline;
        let soakStepLongTaskCount = 0;
        let soakStepLongTaskTotalMs = 0;
        const soakStepSamples = [];
        const checkpointSoakStep = async (label, cycle) => {
          const metrics = metricMap((await client.send('Performance.getMetrics')).metrics);
          const longTasks = await evaluateValue(`window.__atlasBrowserBudget?.longTasks || []`);
          const longTaskTotal = longTasks.reduce((sum, value) => sum + value, 0);
          soakStepSamples.push({
            label, phase: cycle === 0 ? 'first' : 'repeat',
            taskTimeMs: ms((metrics.TaskDuration || 0) - (soakStepBaseline.TaskDuration || 0)),
            scriptTimeMs: ms((metrics.ScriptDuration || 0) - (soakStepBaseline.ScriptDuration || 0)),
            longTaskCount: longTasks.length - soakStepLongTaskCount,
            longTaskTotalMs: Math.round(longTaskTotal - soakStepLongTaskTotalMs),
          });
          soakStepBaseline = metrics;
          soakStepLongTaskCount = longTasks.length;
          soakStepLongTaskTotalMs = longTaskTotal;
        };

        for (let cycle = 0; cycle < configuredAgentSoakCycles; cycle += 1) {
          const opacity = cycle % 2 ? 82 : 46;
          // Input previews are imperative; pointer-up persists the presentation
          // value without scheduling a top-level React render.
          // eslint-disable-next-line no-await-in-loop
          const opacityChanged = await evaluateValue(`(() => {
            const control = document.querySelector('[aria-label="Land overlay opacity"]');
            if (!control) return false;
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            setter.call(control, '${opacity}');
            control.dispatchEvent(new Event('input', { bubbles: true }));
            control.dispatchEvent(new Event('pointerup', { bubbles: true }));
            return true;
          })()`);
          if (!opacityChanged) throw new Error(`Could not change land opacity in soak cycle ${cycle + 1}.`);
          // eslint-disable-next-line no-await-in-loop
          await delay(80);
          // eslint-disable-next-line no-await-in-loop
          const landLayerStable = await evaluateValue(`(() => {
            const layer = document.querySelector('.leaflet-land-constraints-pane .leaflet-layer');
            return layer === window.__atlasSoakLandLayer
              && [...layer.querySelectorAll('img')].every(image => image.src.includes('opacity=100'));
          })()`);
          if (!landLayerStable) throw new Error(`Land tile layer was replaced in soak cycle ${cycle + 1}.`);
          // eslint-disable-next-line no-await-in-loop
          await checkpointSoakStep('opacity', cycle);

          for (const label of ['Zoom in', 'Zoom in', 'Zoom out', 'Zoom out']) {
            // eslint-disable-next-line no-await-in-loop
            const clicked = await evaluateValue(`(() => { const control = document.querySelector('[aria-label="${label}"]'); if (!control || control.disabled) return false; control.click(); return true; })()`);
            if (!clicked) throw new Error(`Could not activate ${label} in soak cycle ${cycle + 1}.`);
            // Let Leaflet finish its animated camera transition before the next input.
            // eslint-disable-next-line no-await-in-loop
            await delay(420);
            // eslint-disable-next-line no-await-in-loop
            await checkpointSoakStep(label, cycle);
          }
          for (const label of ['Node markers', 'Node markers', 'Geographic boundaries', 'Geographic boundaries']) {
            // eslint-disable-next-line no-await-in-loop
            const clicked = await evaluateValue(`(() => { const control = document.querySelector('[aria-label="${label}"]'); if (!control || control.disabled) return false; control.click(); return true; })()`);
            if (!clicked) throw new Error(`Could not toggle ${label} in soak cycle ${cycle + 1}.`);
            // eslint-disable-next-line no-await-in-loop
            await delay(160);
            // eslint-disable-next-line no-await-in-loop
            await checkpointSoakStep(label, cycle);
          }
          // Represent a short user dwell and allow the one coalesced viewport
          // sample for the final camera to complete before the next cycle.
          // eslint-disable-next-line no-await-in-loop
          await delay(1200);
          // eslint-disable-next-line no-await-in-loop
          await checkpointSoakStep('settle', cycle);
        }
        await delay(settleMs);
        await waitUntil(() => evaluateValue(`(() => {
          const statuses = [...document.querySelectorAll('[role="status"]')].map(node => node.textContent.trim());
          return statuses.some(status => /^(?:Multi-network overlay|Network) ready$/.test(status))
            && !statuses.some(status => /^(?:Drawing network|Updating map)/.test(status));
        })()`), 60000, 'the post-agent soak final map state');
        await client.send('HeapProfiler.collectGarbage');
        const soakMetrics = metricMap((await client.send('Performance.getMetrics')).metrics);
        const soakState = JSON.parse(await evaluateValue(`JSON.stringify({
          longTasks: window.__atlasBrowserBudget?.longTasks || [],
          cumulativeLayoutShift: (window.__atlasBrowserBudget?.shifts || []).reduce((sum, value) => sum + value, 0),
          landLayerStable: document.querySelector('.leaflet-land-constraints-pane .leaflet-layer') === window.__atlasSoakLandLayer,
          landTileUrlsStable: [...document.querySelectorAll('.leaflet-land-constraints-pane .leaflet-layer img')].every(image => image.src.includes('opacity=100')),
          landOpacity: document.querySelector('[aria-label="Land overlay opacity"]')?.value || '',
          loadedCountryCodes: [...document.querySelectorAll('select[aria-label="Add country network"] option[value]:disabled')].map(option => option.value).filter(Boolean),
          resolution: document.querySelector('input[aria-label="Network resolution"]')?.getAttribute('aria-valuetext') || '',
          activeCarriers: (() => {
            const toggle = document.querySelector('[aria-label="Toggle multi-network overlay"]');
            return toggle?.getAttribute('aria-pressed') === 'true'
              ? String(toggle.getAttribute('data-atlas-overlay-carriers') || '').split(',').filter(Boolean)
              : [document.querySelector('select[aria-label="Network carrier"]')?.value].filter(Boolean);
          })(),
          activeOverlayCarriers: String(document.querySelector('[aria-label="Toggle multi-network overlay"]')?.getAttribute('data-atlas-overlay-carriers') || '').split(',').filter(Boolean),
          overviewRasterStats: window.__atlasOverviewRasterStats || null,
          liveDomNodes: document.getElementsByTagName('*').length,
          mapLabel: document.querySelector('.leaflet-container')?.getAttribute('aria-label') || '',
          accessibilityAudit: window.__atlasAccessibilityAudit(),
        })`));
        const soakNetwork = activeRun;
        activeRun = null;
        const baselineHeapMb = mb(soakBaseline.JSHeapUsedSize || 0);
        const finalHeapMb = mb(soakMetrics.JSHeapUsedSize || 0);
        // Camera movement legitimately retires obsolete land tiles and viewport
        // samples. Classify the browser-facing /atlas-api path and direct /api
        // path as the same Atlas request; otherwise a production-hosted soak
        // fails even though only expected presentation work was cancelled.
        const canceledLandApiUrls = soakNetwork.canceledApiUrls.filter(isLandAtlasApiPath);
        const unexpectedCanceledApiUrls = soakNetwork.canceledApiUrls
          .filter(url => !isLandAtlasApiPath(url));
        const soakStepProfiles = [...soakStepSamples.reduce((profiles, sample) => {
          const profileKey = `${sample.phase}:${sample.label}`;
          const profile = profiles.get(profileKey) || {
            phase: sample.phase, label: sample.label, samples: 0, taskTimeMs: 0, scriptTimeMs: 0,
            longTaskCount: 0, longTaskTotalMs: 0,
          };
          profile.samples += 1;
          profile.taskTimeMs += sample.taskTimeMs;
          profile.scriptTimeMs += sample.scriptTimeMs;
          profile.longTaskCount += sample.longTaskCount;
          profile.longTaskTotalMs += sample.longTaskTotalMs;
          profiles.set(profileKey, profile);
          return profiles;
        }, new Map()).values()];
        agentSoak = {
          label: 'post-agent interaction soak', cycles: configuredAgentSoakCycles,
          elapsedMs: Math.round(performance.now() - soakStarted),
          baselineHeapMb, jsHeapMb: finalHeapMb,
          heapGrowthMb: Math.round((finalHeapMb - baselineHeapMb) * 10) / 10,
          liveDomNodes: soakState.liveDomNodes, retainedDomNodes: Math.round(soakMetrics.Nodes || 0),
          taskTimeMs: ms((soakMetrics.TaskDuration || 0) - (soakPerformanceBaseline.TaskDuration || 0)),
          scriptTimeMs: ms((soakMetrics.ScriptDuration || 0) - (soakPerformanceBaseline.ScriptDuration || 0)),
          longTaskCount: soakState.longTasks.length,
          longTaskTotalMs: Math.round(soakState.longTasks.reduce((sum, value) => sum + value, 0)),
          stepProfiles: soakStepProfiles,
          cumulativeLayoutShift: Math.round(soakState.cumulativeLayoutShift * 1000) / 1000,
          responseCount: soakNetwork.responses, parseResponses: soakNetwork.parseResponses,
          transferMb: mb(soakNetwork.encodedBytes), failedRequests: soakNetwork.failedRequests,
          canceledRequests: soakNetwork.canceledRequests, failedApiRequests: soakNetwork.failedApiRequests,
          canceledApiRequests: soakNetwork.canceledApiRequests,
          canceledLandApiCount: canceledLandApiUrls.length,
          canceledApiUrls: [...new Set(soakNetwork.canceledApiUrls)].slice(0, 20),
          unexpectedCanceledApiUrls: [...new Set(unexpectedCanceledApiUrls)],
          landLayerStable: soakState.landLayerStable, landTileUrlsStable: soakState.landTileUrlsStable,
          landOpacity: soakState.landOpacity, loadedCountryCodes: soakState.loadedCountryCodes,
          resolution: soakState.resolution, activeCarriers: soakState.activeCarriers,
          activeOverlayCarriers: soakState.activeOverlayCarriers,
          overviewRasterStats: soakState.overviewRasterStats,
          mapLabel: soakState.mapLabel, accessibilityAudit: soakState.accessibilityAudit,
        };
      }
    }
    removeRequested(); removeResponse(); removeFinished(); removeFailed(); client.close();

    const warmSamples = warmRuns.map(sample => ({
      elapsedMs: sample.elapsedMs,
      timeToFirstByteMs: sample.timeToFirstByteMs,
      largestContentfulPaintMs: sample.largestContentfulPaintMs,
      jsHeapMb: sample.jsHeapMb,
      failedRequests: sample.failedRequests,
      canceledRequests: sample.canceledRequests,
    }));
    const results = {
      targetUrl,
      viewport: `${viewportWidth}x${viewportHeight}`,
      cpuThrottle,
      network: '10 Mbps / 40 ms',
      cold,
      warm,
      warmSamples,
      compactLayout,
      loadedNetwork,
      agentCommand,
      agentSoak,
    };
    console.table([cold, warm, ...(loadedNetwork ? [loadedNetwork.grid, ...loadedNetwork.domains] : [])]);
    console.log(JSON.stringify(results, null, 2));
    const failures = [];
    if (cold.elapsedMs > coldBudgetMs) failures.push(`cold load ${cold.elapsedMs} ms > ${coldBudgetMs} ms`);
    if (warm.elapsedMs > warmBudgetMs) failures.push(`warm load ${warm.elapsedMs} ms > ${warmBudgetMs} ms`);
    if (!cold.largestContentfulPaintMs || cold.largestContentfulPaintMs > coldLcpBudgetMs) failures.push(`cold LCP ${cold.largestContentfulPaintMs} ms > ${coldLcpBudgetMs} ms`);
    if (!warm.largestContentfulPaintMs || warm.largestContentfulPaintMs > warmLcpBudgetMs) failures.push(`warm LCP ${warm.largestContentfulPaintMs} ms > ${warmLcpBudgetMs} ms`);
    const allShellRuns = [cold, ...warmRuns];
    if (Math.max(...allShellRuns.map(run => run.longTaskTotalMs)) > longTaskBudgetMs) failures.push(`long tasks > ${longTaskBudgetMs} ms`);
    if (Math.max(...allShellRuns.map(run => run.cumulativeLayoutShift)) > layoutShiftBudget) failures.push(`layout shift > ${layoutShiftBudget}`);
    if (Math.max(...allShellRuns.map(run => run.jsHeapMb)) > heapBudgetMb) failures.push(`heap > ${heapBudgetMb} MB`);
    if (allShellRuns.some(run => run.failedRequests)) failures.push(`network failures ${allShellRuns.map(run => run.failedRequests).join('/')}`);
    if (allShellRuns.some(run => run.mapLabel !== 'Interactive infrastructure map')) failures.push('map accessibility label missing');
    if (allShellRuns.some(run => run.mapWidth < 300 || run.mapHeight < 400)) failures.push('map viewport is too small');
    if (allShellRuns.some(run => run.viewportOverflowX)) failures.push('page has horizontal viewport overflow');
    if (allShellRuns.some(run => run.clippedInteractiveControls.length)) failures.push(`interactive controls clipped outside viewport ${JSON.stringify(allShellRuns.map(run => run.clippedInteractiveControls))}`);
    if (allShellRuns.some(run => run.accessibilityAudit.unnamed.length
      || run.accessibilityAudit.duplicateIds.length || run.accessibilityAudit.brokenReferences.length)) {
      failures.push(`browser accessibility audit failed ${JSON.stringify(allShellRuns.map(run => run.accessibilityAudit))}`);
    }
    if (compactLayout && (!compactLayout.opened || !compactLayout.moreSettings
      || compactLayout.moreSettings[1] < 0 || compactLayout.moreSettings[3] > viewportHeight + 1
      || compactLayout.sectionSwitches?.length !== 4
      || compactLayout.sectionSwitches.some(section => !section.selected || !section.content)
      || compactLayout.clipped.length)) failures.push(`compact domain controls are not contained ${JSON.stringify(compactLayout)}`);
    if (compactLayout && (compactLayout.accessibilityAudit.unnamed.length
      || compactLayout.accessibilityAudit.duplicateIds.length
      || compactLayout.accessibilityAudit.brokenReferences.length)) {
      failures.push(`compact expanded accessibility audit failed ${JSON.stringify(compactLayout.accessibilityAudit)}`);
    }
    if (loadedNetwork) {
      const actions = [loadedNetwork.grid, ...(loadedNetwork.extraCountryLoads || []), ...loadedNetwork.domains];
      const expectedLoadedCountries = 1 + configuredExtraCountries.length;
      if (loadedNetwork.grid.elapsedMs > gridLoadBudgetMs) failures.push(`grid load ${loadedNetwork.grid.elapsedMs} ms > ${gridLoadBudgetMs} ms`);
      for (const domain of loadedNetwork.domains) {
        if (domain.elapsedMs > layerLoadBudgetMs) failures.push(`${domain.label} ${domain.elapsedMs} ms > ${layerLoadBudgetMs} ms`);
      }
      if (loadedNetwork.totalDomainElapsedMs > fullDomainBudgetMs) failures.push(`all lazy domains ${loadedNetwork.totalDomainElapsedMs} ms > ${fullDomainBudgetMs} ms`);
      if (Math.max(...actions.map(item => item.jsHeapMb)) > loadedHeapBudgetMb) failures.push(`loaded heap > ${loadedHeapBudgetMb} MB`);
      if (Math.max(...actions.map(item => item.liveDomNodes)) > loadedDomBudget) failures.push(`live loaded DOM > ${loadedDomBudget} nodes`);
      if (Math.max(...actions.map(item => item.retainedDomNodes)) > retainedDomBudget) failures.push(`retained loaded DOM > ${retainedDomBudget} nodes`);
      if (actions.some(item => item.failedRequests || !item.countryLoaded || item.mapLabel !== 'Interactive infrastructure map')
          || loadedNetwork.grid.parseResponses !== 1
          || (loadedNetwork.extraCountryLoads || []).some(item => item.parseResponses !== 1)
          || loadedNetwork.domains.some(item => item.parseResponses !== expectedLoadedCountries)) {
        failures.push(`loaded-network integrity check failed (expected ${expectedLoadedCountries} country parse response(s) per lazy domain)`);
      }
      if (actions.some(item => item.accessibilityAudit.unnamed.length
        || item.accessibilityAudit.duplicateIds.length || item.accessibilityAudit.brokenReferences.length)) {
        failures.push(`loaded-network accessibility audit failed ${JSON.stringify(actions.map(item => item.accessibilityAudit))}`);
      }
      if (configuredResolutionSlider) {
        const slider = loadedNetwork.resolutionSlider;
        if (!slider || slider.resolution !== 'Bidding zone'
            || slider.parseResponses !== expectedLoadedCountries
            || slider.failedRequests || slider.canceledApiRequests
            || slider.mapLabel !== 'Interactive infrastructure map') {
          failures.push(`network resolution slider interaction failed ${JSON.stringify(slider)}`);
        }
        if (configuredExtraCountries.length && (!slider || slider.crossBorderLinks < 1)) {
          failures.push('cross-border links disappeared after resolution change ' + JSON.stringify(slider));
        }
      }
      if (configuredMapDisplay) {
        const displayActions = [loadedNetwork.mapDisplay?.hidden, loadedNetwork.mapDisplay?.restored].filter(Boolean);
        if (displayActions.length !== 2 || displayActions.some(action => action.parseResponses
            || action.failedRequests || action.canceledApiRequests
            || action.mapLabel !== 'Interactive infrastructure map')) {
          failures.push(`map display selector interaction failed ${JSON.stringify(loadedNetwork.mapDisplay)}`);
        }
      }
      const expectedGrid = fixture?.entries.get('grid');
      if (expectedGrid && (Number(String(loadedNetwork.grid.buses).replace(/,/g, '')) !== expectedGrid.markers
          || Number(String(loadedNetwork.grid.acLines).replace(/,/g, '')) !== expectedGrid.acLines)) {
        failures.push(`visible grid counts ${loadedNetwork.grid.buses}/${loadedNetwork.grid.acLines} do not match fixture ${expectedGrid.markers}/${expectedGrid.acLines}`);
      }
      const cycle = loadedNetwork.domainCycle;
      if (cycle.toggles !== domainCycleCount * 4 || cycle.activeDomain !== 'Demand map layer'
          || cycle.parseResponses !== 0 || cycle.failedRequests || cycle.canceledRequests
          || cycle.mapLabel !== 'Interactive infrastructure map') {
        failures.push(`loaded-domain cycle integrity failed ${JSON.stringify(cycle)}`);
      }
      if (cycle.jsHeapMb > loadedHeapBudgetMb || cycle.liveDomNodes > loadedDomBudget
          || cycle.retainedDomNodes > retainedDomBudget) {
        failures.push(`loaded-domain cycle memory/DOM budget failed ${JSON.stringify(cycle)}`);
      }
      if (cycle.accessibilityAudit.unnamed.length || cycle.accessibilityAudit.duplicateIds.length
          || cycle.accessibilityAudit.brokenReferences.length) {
        failures.push(`loaded-domain cycle accessibility audit failed ${JSON.stringify(cycle.accessibilityAudit)}`);
      }
      for (const transition of loadedNetwork.overlayTransitions || []) {
        if (transition.elapsedMs > overlayLoadBudgetMs) failures.push(`${transition.label} ${transition.elapsedMs} ms > ${overlayLoadBudgetMs} ms`);
        if (transition.failedRequests || !transition.countryLoaded || transition.parseResponses
            || transition.mapLabel !== 'Interactive infrastructure map') {
          failures.push(`multi-carrier transition integrity failed ${JSON.stringify(transition)}`);
        }
        if (transition.jsHeapMb > loadedHeapBudgetMb || transition.liveDomNodes > loadedDomBudget
            || transition.retainedDomNodes > retainedDomBudget) {
          failures.push(`multi-carrier transition memory/DOM budget failed ${JSON.stringify(transition)}`);
        }
        if (transition.accessibilityAudit.unnamed.length || transition.accessibilityAudit.duplicateIds.length
            || transition.accessibilityAudit.brokenReferences.length) {
          failures.push(`multi-carrier transition accessibility audit failed ${JSON.stringify(transition.accessibilityAudit)}`);
        }
      }
      if (configuredClustering) {
        const clustering = loadedNetwork.clustering;
        const actions = [clustering?.nuts2, clustering?.evidenceRefresh, clustering?.nuts3].filter(Boolean);
        if (actions.length !== 3 || !clustering.colourContinuity
            || !clustering.opacityStable || !clustering.visibilityToggleStable
            || !/NUTS 3 regions clustered/.test(clustering.status || '')) {
          failures.push(`regional clustering interaction failed ${JSON.stringify(clustering)}`);
        }
        if (actions.some(action => action.failedRequests || action.canceledApiRequests
            || action.parseResponses || action.mapLabel !== 'Interactive infrastructure map')) {
          failures.push(`regional clustering browser integrity failed ${JSON.stringify(actions)}`);
        }
        if (actions.some(action => action.jsHeapMb > loadedHeapBudgetMb
            || action.liveDomNodes > loadedDomBudget || action.retainedDomNodes > retainedDomBudget)) {
          failures.push(`regional clustering memory/DOM budget failed ${JSON.stringify(actions)}`);
        }
      }
    }
    if (agentCommand) {
      if (agentCommand.elapsedMs > agentCommandBudgetMs) failures.push(`agent command ${agentCommand.elapsedMs} ms > ${agentCommandBudgetMs} ms`);
      if (agentCommand.failedRequests || agentCommand.canceledApiRequests
          || agentCommand.mapLabel !== 'Interactive infrastructure map') {
        failures.push(`agent browser command integrity failed ${JSON.stringify(agentCommand)}`);
      }
      if (agentCommand.viewportOverflowX || agentCommand.clippedInteractiveControls.length) {
        failures.push(`agent panel is clipped or causes viewport overflow ${JSON.stringify({
          viewportOverflowX: agentCommand.viewportOverflowX,
          clipped: agentCommand.clippedInteractiveControls,
          panel: agentCommand.assistantPanel,
        })}`);
      }
      if (viewportWidth <= 1023 && (!agentCommand.assistantPanel
          || agentCommand.assistantPanel[0] < -1 || agentCommand.assistantPanel[1] < -1
          || agentCommand.assistantPanel[2] > viewportWidth + 1
          || agentCommand.assistantPanel[3] > viewportHeight + 1)) {
        failures.push(`compact assistant panel is not contained ${JSON.stringify(agentCommand.assistantPanel)}`);
      }
      if (configuredAgentExpectedCountries && agentCommand.loadedCountryCodes.length !== configuredAgentExpectedCountries) {
        failures.push(`agent loaded ${agentCommand.loadedCountryCodes.length} countries, expected ${configuredAgentExpectedCountries}`);
      }
      if (configuredAgentExpectedResolution
          && String(agentCommand.resolution).trim().toLowerCase() !== configuredAgentExpectedResolution.toLowerCase()) {
        failures.push(`agent resolution ${agentCommand.resolution || 'missing'}, expected ${configuredAgentExpectedResolution}`);
      }
      if (configuredAgentExpectedLayers.length
          && (agentCommand.activeLayers.length !== configuredAgentExpectedLayers.length
            || configuredAgentExpectedLayers.some(layer => !agentCommand.activeLayers.includes(layer)))) {
        failures.push(`agent layers ${agentCommand.activeLayers.join(',') || 'none'}, expected ${configuredAgentExpectedLayers.join(',')}`);
      }
      if (configuredAgentExpectedCarriers.length
          && (agentCommand.activeCarriers.length !== configuredAgentExpectedCarriers.length
            || configuredAgentExpectedCarriers.some(carrier => !agentCommand.activeCarriers.includes(carrier)))) {
        failures.push(`agent carriers ${agentCommand.activeCarriers.join(',') || 'none'}, expected ${configuredAgentExpectedCarriers.join(',')}`);
      }
      if (agentCommand.jsHeapMb > loadedHeapBudgetMb || agentCommand.liveDomNodes > loadedDomBudget
          || agentCommand.retainedDomNodes > retainedDomBudget) {
        failures.push(`agent command memory/DOM budget failed ${JSON.stringify(agentCommand)}`);
      }
      if (agentCommand.accessibilityAudit.unnamed.length || agentCommand.accessibilityAudit.duplicateIds.length
          || agentCommand.accessibilityAudit.brokenReferences.length) {
        failures.push(`agent command accessibility audit failed ${JSON.stringify(agentCommand.accessibilityAudit)}`);
      }
    }
    if (agentSoak) {
      if (agentSoak.jsHeapMb > loadedHeapBudgetMb || agentSoak.heapGrowthMb > soakHeapGrowthBudgetMb
          || agentSoak.liveDomNodes > loadedDomBudget || agentSoak.retainedDomNodes > retainedDomBudget) {
        failures.push(`post-agent soak memory/DOM budget failed ${JSON.stringify(agentSoak)}`);
      }
      if (!agentSoak.landLayerStable || !agentSoak.landTileUrlsStable || agentSoak.parseResponses
          || agentSoak.failedRequests || agentSoak.failedApiRequests || agentSoak.unexpectedCanceledApiUrls.length
          || agentSoak.mapLabel !== 'Interactive infrastructure map') {
        failures.push(`post-agent soak integrity failed ${JSON.stringify(agentSoak)}`);
      }
      if (configuredAgentExpectedCountries && agentSoak.loadedCountryCodes.length !== configuredAgentExpectedCountries) {
        failures.push(`post-agent soak retained ${agentSoak.loadedCountryCodes.length} countries, expected ${configuredAgentExpectedCountries}`);
      }
      if (configuredAgentExpectedResolution
          && String(agentSoak.resolution).trim().toLowerCase() !== configuredAgentExpectedResolution.toLowerCase()) {
        failures.push(`post-agent soak resolution ${agentSoak.resolution || 'missing'}, expected ${configuredAgentExpectedResolution}`);
      }
      if (configuredAgentExpectedCarriers.length
          && (agentSoak.activeCarriers.length !== configuredAgentExpectedCarriers.length
            || configuredAgentExpectedCarriers.some(carrier => !agentSoak.activeCarriers.includes(carrier)))) {
        failures.push(`post-agent soak carriers ${agentSoak.activeCarriers.join(',') || 'none'}, expected ${configuredAgentExpectedCarriers.join(',')}`);
      }
      if (agentSoak.accessibilityAudit.unnamed.length || agentSoak.accessibilityAudit.duplicateIds.length
          || agentSoak.accessibilityAudit.brokenReferences.length) {
        failures.push(`post-agent soak accessibility audit failed ${JSON.stringify(agentSoak.accessibilityAudit)}`);
      }
    }
    if (failures.length) throw new Error(`Browser performance budget failed: ${failures.join('; ')}`);
    console.log(`Browser budgets passed (cold <= ${coldBudgetMs} ms, warm median of ${warmSampleCount} <= ${warmBudgetMs} ms, cold/warm LCP <= ${coldLcpBudgetMs}/${warmLcpBudgetMs} ms, peak heap <= ${heapBudgetMb} MB).`);
  } finally {
    chrome.kill();
    await Promise.race([new Promise(resolve => chrome.once('exit', resolve)), delay(3000)]);
    if (previewServer) {
      await new Promise(resolve => {
        previewServer.close(resolve);
        previewServer.closeAllConnections?.();
      });
    }
    if (fixtureServer) {
      await new Promise(resolve => {
        fixtureServer.close(resolve);
        fixtureServer.closeAllConnections?.();
      });
    }
    if (path.dirname(path.resolve(profileDir)) !== path.resolve(tempRoot)) {
      throw new Error(`Refusing to remove unexpected Chrome profile path: ${profileDir}`);
    }
    try { fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch (error) { console.warn(`Could not remove temporary Chrome profile ${profileDir}: ${error.message}`); }
  }
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
