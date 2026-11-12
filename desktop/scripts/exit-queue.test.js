const { test } = require("node:test");
const assert = require("node:assert/strict");
const { summarizeExitQueue } = require("../exit-queue");

test("counts legacy and scoped pending sales and items awaiting review", () => {
  const sale = JSON.stringify([{ payload: { client_ref: "fixture" } }]);
  assert.deepEqual(summarizeExitQueue({
    pdv_offline_queue: sale,
    "pdv_offline_queue:v3:operator": sale,
    "pdv_offline_rejected:v3:operator": sale,
    "pdv_offline_reviewed:v3:operator": sale,
  }), { pending: 2, review: 1, unreadable: false });
});

test("does not mistake an unreadable queue for an empty one", () => {
  assert.deepEqual(summarizeExitQueue({
    pdv_offline_queue: "[{}]", "pdv_offline_rejected:v3:operator": "broken",
  }), { pending: 0, review: 0, unreadable: true });
});
