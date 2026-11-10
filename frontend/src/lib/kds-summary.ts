import { minutesSince } from "./format";
import type { KitchenTicket, Station } from "./types";

/** Counts cover the selected station; the late filter affects cards only. */
export function summarizeKds(tickets: KitchenTicket[], station: Station | "all", onlyLate = false, oldestFirst = true, now = Date.now()) {
  const stationTickets = tickets
    .map((ticket) => ({ ...ticket, items: ticket.items.filter((item) => station === "all" || item.station === station) }))
    .filter((ticket) => ticket.items.length && ["novo", "preparo", "pronto"].includes(ticket.status));
  const pending = stationTickets.filter((ticket) => ticket.status !== "pronto");
  const age = (ticket: KitchenTicket) => minutesSince(ticket.created_at, now);
  const list = stationTickets
    .filter((ticket) => !onlyLate || (ticket.status !== "pronto" && age(ticket) >= 15))
    .sort((a, b) => oldestFirst ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime() : new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return {
    list,
    waiting: stationTickets.filter((ticket) => ticket.status === "novo").length,
    preparing: stationTickets.filter((ticket) => ticket.status === "preparo").length,
    ready: stationTickets.filter((ticket) => ticket.status === "pronto").length,
    delayed: pending.filter((ticket) => age(ticket) >= 15).length,
    critical: pending.filter((ticket) => age(ticket) > 25).length,
    oldestWaiting: pending.reduce((oldest, ticket) => Math.max(oldest, age(ticket)), 0),
  };
}
