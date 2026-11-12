/** Summarize persisted queues for the close dialog without exposing sale details. */
function summarizeExitQueue(store) {
  const counts = { pending: 0, review: 0, unreadable: false };
  for (const [key, value] of Object.entries(store)) {
    const match = /^pdv_offline_(queue|rejected)(?::.*)?$/.exec(key);
    if (!match) continue;
    try {
      const sales = JSON.parse(value);
      if (!Array.isArray(sales) || sales.some((sale) => !sale?.payload?.client_ref)) {
        counts.unreadable = true;
        continue;
      }
      counts[match[1] === "queue" ? "pending" : "review"] += sales.length;
    } catch {
      counts.unreadable = true;
    }
  }
  return counts;
}

module.exports = { summarizeExitQueue };
