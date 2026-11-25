const assert = require("node:assert/strict");
const { test } = require("node:test");
const { thermalPageHeight, submitPrintCopies } = require("../thermal-print");

test("rounds up to a safe custom height and caps lengthy documents for pagination", () => {
  assert.equal(thermalPageHeight(20), 100000);
  assert.equal(thermalPageHeight(200), 100000);
  assert.equal(thermalPageHeight(345), 100000);
  assert.equal(thermalPageHeight(1600), 297000);
  assert.throws(() => thermalPageHeight(NaN), /medir/);
});

test("stops after an indeterminate second copy without resubmitting the accepted first copy", async () => {
  const calls = [];
  const result = await submitPrintCopies(async (opts) => {
    calls.push(opts);
    return calls.length === 1 ? { ok: true } : { ok: false, error: "Spooler indisponível" };
  }, { copies: 3, deviceName: "Fila de teste" }, true);
  assert.deepEqual(calls, [{ copies: 1, deviceName: "Fila de teste" }, { copies: 1, deviceName: "Fila de teste" }]);
  assert.equal(result.ok, false);
  assert.match(result.error, /Via 2\/3.*1 via\(s\) aceita/);
});

test("continues to use driver copies for queues without single-copy mode", async () => {
  const calls = [];
  await submitPrintCopies(async (options) => { calls.push(options); return { ok: true }; }, { copies: 2 }, false);
  assert.deepEqual(calls, [{ copies: 2 }]);
});
