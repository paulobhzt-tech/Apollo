import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
// Docker excludes Git metadata. Its build caller supplies the source revision.
const suppliedCommit = process.env.APOLLO_SOURCE_COMMIT;
const commit = suppliedCommit || git('rev-parse', 'HEAD');
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Invalid source commit');
if (!suppliedCommit && git('status', '--porcelain', '--untracked-files=no')) {
  throw new Error('Refusing provenance for modified tracked sources');
}
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await files(full));
    else if (entry.isFile()) found.push(full);
    else throw new Error('Unsupported build entry: ' + full);
  }
  return found;
}
// The worker is generated from the public build, with no runtime HTML or API
// responses in its cache. Each build owns a distinct, complete asset set.
const workerPath = path.join(root, 'sw.js');
const worker = await readFile(workerPath, 'utf8');
const publicFiles = (await files(root))
  .map(file => '/' + path.relative(root, file).split(path.sep).join('/'))
  .filter(file => file.startsWith('/assets/'));
publicFiles.push('/index.html', '/offline.html', '/manifest.webmanifest', '/apple-touch-icon.png');
publicFiles.sort();
const version = createHash('sha256');
version.update(worker);
const precache = {};
for (const file of publicFiles) {
  const digest = createHash('sha256').update(await readFile(path.join(root, file))).digest('base64');
  precache[file] = 'sha256-' + digest;
  version.update(file).update(digest);
}
await writeFile(workerPath, worker
  .replace('/* BUILD_CACHE */ null', JSON.stringify('apollo-public-v5-' + version.digest('hex')))
  .replace('/* BUILD_ASSETS */ null', JSON.stringify(precache)));

const hashes = {};
for (const file of (await files(root)).sort()) {
  const name = path.relative(root, file).split(path.sep).join('/');
  if (name === 'build-integrity.json') continue;
  hashes[name] = createHash('sha256').update(await readFile(file)).digest('hex');
}
const manifest = {
  schema: 1,
  application: 'Apollo PDV 3.0.1',
  commit,
  version: '3.0.1',
  artifact: createHash('sha256').update(JSON.stringify([commit, hashes])).digest('hex'),
  files: hashes,
  scope: 'Build identity only; does not attest deployment, backend compatibility or operational approval.'
};
await writeFile(path.join(root, 'build-integrity.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Build integrity:', commit, Object.keys(hashes).length, 'files');
