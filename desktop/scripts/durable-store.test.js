const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { atomicWriteWithBackup, recoverMissingPrimary } = require("../durable-store");
const validate = raw => JSON.parse(raw.toString());
function scenario(fn) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apollo-durable-test-")); try { fn(path.join(dir, "queue.bin"), dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); } }
test("writes a readable primary and retains the prior valid recovery copy", () => scenario(file => {
  atomicWriteWithBackup(file, Buffer.from('{"sale":"a"}'), validate);
  atomicWriteWithBackup(file, Buffer.from('{"sale":"b"}'), validate);
  assert.equal(validate(fs.readFileSync(file)).sale, "b");
  assert.equal(validate(fs.readFileSync(file + ".bak")).sale, "a");
}));
test("a flush failure never acknowledges or replaces the saved sales", () => scenario((file, dir) => {
  atomicWriteWithBackup(file, Buffer.from('{"sale":"a"}'), validate);
  const io = { ...fs, fsyncSync: () => { throw new Error("disk flush failed"); } };
  assert.throws(() => atomicWriteWithBackup(file, Buffer.from('{"sale":"b"}'), validate, io), /disk flush failed/);
  assert.equal(validate(fs.readFileSync(file)).sale, "a");
  assert.deepEqual(fs.readdirSync(dir), ["queue.bin"]);
}));
test("corrupt primary bytes are preserved instead of overwriting recoverable evidence", () => scenario(file => {
  fs.writeFileSync(file, "broken-primary"); fs.writeFileSync(file + ".bak", '{"sale":"a"}');
  assert.throws(() => atomicWriteWithBackup(file, Buffer.from('{"sale":"b"}'), validate));
  assert.equal(fs.readFileSync(file, "utf8"), "broken-primary");
  assert.equal(validate(fs.readFileSync(file + ".bak")).sale, "a");
}));

test("recovers a missing primary from its validated backup without modifying the backup", () => scenario(file => {
  fs.writeFileSync(file + ".bak", '{"sale":"a"}');
  assert.equal(recoverMissingPrimary(file, validate), true);
  assert.equal(validate(fs.readFileSync(file)).sale, "a");
  assert.equal(validate(fs.readFileSync(file + ".bak")).sale, "a");
}));
test("never substitutes an existing corrupt primary or invents an empty recovery", () => scenario(file => {
  fs.writeFileSync(file, "broken"); fs.writeFileSync(file + ".bak", '{"sale":"a"}');
  assert.equal(recoverMissingPrimary(file, validate), false);
  assert.equal(fs.readFileSync(file, "utf8"), "broken");
}));
