#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const appRoot = path.resolve(__dirname, '..');
const buildDirectory = path.join(appRoot, 'build');
const contractPath = path.join(buildDirectory, '.nohm-atlas-build.json');

if (!fs.existsSync(path.join(buildDirectory, 'index.html'))) {
  throw new Error('Atlas build contract cannot be written before the production bundle exists.');
}

const sha256File = filePath => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
const walkFiles = (root, relativeRoot = '') => fs.readdirSync(root, { withFileTypes: true })
  .sort((left, right) => left.name.localeCompare(right.name))
  .flatMap(entry => {
    const relativePath = path.posix.join(relativeRoot, entry.name);
    const absolutePath = path.join(root, entry.name);
    return entry.isDirectory() ? walkFiles(absolutePath, relativePath) : [{ absolutePath, relativePath }];
  });
const sourceFiles = [
  ...walkFiles(path.join(appRoot, 'src'), 'src'),
  ...walkFiles(path.join(appRoot, 'public'), 'public'),
  ...['package.json', 'package-lock.json'].map(relativePath => ({
    absolutePath: path.join(appRoot, relativePath), relativePath,
  })),
].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
const sourceHasher = crypto.createHash('sha256');
sourceFiles.forEach(({ absolutePath, relativePath }) => {
  sourceHasher.update(relativePath.replaceAll('\\', '/'));
  sourceHasher.update('\0');
  sourceHasher.update(fs.readFileSync(absolutePath));
  sourceHasher.update('\0');
});

const assetManifestPath = path.join(buildDirectory, 'asset-manifest.json');
const assetManifest = JSON.parse(fs.readFileSync(assetManifestPath, 'utf8'));
const mainBundleUrl = String(assetManifest?.files?.['main.js'] || '');
const mainBundleRelative = mainBundleUrl.replace(/^\/atlas\//, '').replace(/^\//, '');
const mainBundlePath = path.resolve(buildDirectory, mainBundleRelative);
if (!mainBundleRelative || !mainBundlePath.startsWith(`${buildDirectory}${path.sep}`) || !fs.existsSync(mainBundlePath)) {
  throw new Error('Atlas build contract could not resolve the compiled main bundle.');
}

const contract = {
  ContractVersion: 2,
  ApiBase: '/atlas-api',
  Homepage: '/atlas',
  BuiltAt: new Date().toISOString(),
  SourceTreeSha256: sourceHasher.digest('hex'),
  AssetManifestSha256: sha256File(assetManifestPath),
  MainBundle: mainBundleUrl,
  MainBundleSha256: sha256File(mainBundlePath),
};

fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
process.stdout.write(`Wrote ${path.relative(appRoot, contractPath)}\n`);
