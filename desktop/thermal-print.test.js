// Tests for the real desktop IPC handler without requiring Electron or a printer.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");
const start = source.indexOf("let printTail = Promise.resolve();");
const end = source.indexOf("// ---------- lifecycle ----------", start);
assert.ok(start >= 0 && end > start);

function fixture({ height = 200, failAt = 0, measurementError = false } = {}) {
  const jobs = [];
  let handler;
  let detached = 0;
  class BrowserWindow {
    constructor() {
      this.webContents = {
        debugger: {
          attach() {},
          detach() { detached++; },
          async sendCommand(command) {
            if (command === "DOM.getDocument") return { root: { nodeId: 1 } };
            if (command === "DOM.querySelector") return { nodeId: 2 };
            if (command === "DOM.getBoxModel") {
              if (measurementError) throw new Error("measurement failed");
              return { model: { border: [0, 0, 287, 0, 287, height, 0, height] } };
            }
            return {};
          },
        },
        print(opts, cb) { jobs.push(opts); cb(jobs.length !== failAt, "mock failure"); },
      };
    }
    async loadURL() {}
    destroy() {}
  }
  const context = { BrowserWindow, ipcMain: { handle: (_, fn) => { handler = fn; } }, setTimeout: fn => fn() };
  vm.runInNewContext(source.slice(start, end), context);
  return { run: opts => handler(null, opts), jobs, detached: () => detached, calculate: context.thermalPageHeight };
}

const request = { html: '<meta name="apollo-thermal-ticket" content="1">', deviceName: "EPSON TM-T20X Receipt", copies: 2, paper: "80mm" };

test("short thermal ticket uses tested minimum and separate copies", async () => {
  const f = fixture();
  assert.equal((await f.run(request)).ok, true);
  assert.equal(f.jobs.length, 2);
  assert.ok(f.jobs.every(job => job.copies === 1 && job.pageSize.height === 100000));
  assert.equal(f.detached(), 1);
});
test("long thermal ticket is taller than 297 mm", async () => {
  const f = fixture({ height: 1400 });
  assert.equal((await f.run(request)).ok, true);
  assert.ok(f.jobs.every(job => job.pageSize.height === 381000));
});
test("oversize or invalid measurements never send a job", async () => {
  for (const height of [0, NaN, Infinity, 14000]) {
    const f = fixture({ height });
    assert.equal((await f.run(request)).ok, false);
    assert.equal(f.jobs.length, 0);
    assert.equal(f.detached(), 1);
  }
});
test("measurement failure stops before submission", async () => {
  const f = fixture({ measurementError: true });
  assert.equal((await f.run(request)).ok, false);
  assert.equal(f.jobs.length, 0);
  assert.equal(f.detached(), 1);
});
test("second copy failure stops without resending first or sending third", async () => {
  const f = fixture({ failAt: 2 });
  const result = await f.run({ ...request, copies: 3 });
  assert.equal(result.ok, false);
  assert.match(result.error, /1 via\(s\)/);
  assert.equal(f.jobs.length, 2);
});
test("other printer and unmarked document preserve existing paper behavior", async () => {
  const f = fixture();
  assert.equal((await f.run({ ...request, deviceName: "Other" })).ok, true);
  assert.equal(f.jobs.length, 1);
  assert.equal(f.jobs[0].copies, 2);
  assert.equal(f.jobs[0].pageSize.height, 297000);
  assert.equal((await f.run({ ...request, html: "<html>other receipt</html>" })).ok, true);
  assert.equal(f.jobs.length, 3);
  assert.equal(f.jobs[1].pageSize.height, 297000);
  assert.equal(f.detached(), 0);
});
test("A4 preserves existing copy behavior", async () => {
  const f = fixture();
  assert.equal((await f.run({ ...request, paper: "A4" })).ok, true);
  assert.equal(f.jobs.length, 1);
  assert.equal(f.jobs[0].copies, 2);
  assert.equal(f.jobs[0].pageSize, undefined);
});
test("jobs from concurrent sectors are submitted sequentially", async () => {
  const f = fixture();
  await Promise.all([f.run(request), f.run({ ...request, deviceName: "Other" })]);
  assert.equal(f.jobs.map(j => j.deviceName).join("|"), "EPSON TM-T20X Receipt|EPSON TM-T20X Receipt|Other");
});
