'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { atlasUpstreamPath, isLandAtlasApiPath } = require('./atlas-api-paths.cjs');

test('normalizes direct and Nohm-mounted Atlas API paths', () => {
  assert.equal(atlasUpstreamPath('/api/atlas/land/viewport-stats?zoom=5'), '/api/atlas/land/viewport-stats');
  assert.equal(atlasUpstreamPath('/atlas-api/api/atlas/land/tiles/5/1/2.png'), '/api/atlas/land/tiles/5/1/2.png');
  assert.equal(atlasUpstreamPath('http://127.0.0.1:5176/atlas-api/api/pypsa/list-files'), '/api/pypsa/list-files');
});

test('classifies only land requests as expected presentation cancellations', () => {
  for (const value of [
    '/api/atlas/land/viewport-stats?zoom=5',
    '/atlas-api/api/atlas/land/tiles/5/1/2.png',
    'http://127.0.0.1:5176/atlas-api/api/atlas/land/sample',
  ]) assert.equal(isLandAtlasApiPath(value), true, value);

  for (const value of [
    '/atlas-api/api/pypsa/parse-nc',
    '/api/atlas/grid-access/data',
    '/atlas-api/api/atlas/landscape',
    'not a URL',
  ]) assert.equal(isLandAtlasApiPath(value), false, value);
});
