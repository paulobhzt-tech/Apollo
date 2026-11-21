import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'dist');
const manifest = JSON.parse(await readFile(path.join(root, 'build-integrity.json'), 'utf8'));
if (manifest.schema !== 1 || !/^[a-f0-9]{40}$/.test(manifest.commit)) throw new Error('Invalid manifest');
if (process.env.EXPECTED_COMMIT && manifest.commit !== process.env.EXPECTED_COMMIT) throw new Error('Unexpected commit');
const expected = Object.keys(manifest.files).sort();
if (!expected.includes('index.html') || !expected.includes('sw.js')) throw new Error('Incomplete build');
const actual = [];
async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) await walk(full);
    else if (item.isFile()) actual.push(path.relative(root, full).split(path.sep).join('/'));
    else throw new Error('Unsupported entry');
  }
}
await walk(root);
const listed = actual.filter(name => name !== 'build-integrity.json').sort();
if (JSON.stringify(listed) !== JSON.stringify(expected)) throw new Error('Missing or unexpected build files');
for (const name of expected) {
  if (name.startsWith('/') || name.split('/').includes('..') || name.includes('\\')) throw new Error('Unsafe manifest path');
  const hash = createHash('sha256').update(await readFile(path.join(root, name))).digest('hex');
  if (hash !== manifest.files[name]) throw new Error('Build integrity mismatch: ' + name);
}
console.log('Verified', manifest.commit, expected.length, 'files');
