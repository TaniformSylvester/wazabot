/*
 * Live handoff queue — the pure parts, shared by the browser watcher
 * (components/dashboard/handoff-alerts.tsx) and the unit tests.
 *
 * A thread "needs a human" while it is open or pending and either the customer
 * asked for a person (human_requested) or the team took it over (Human Mode:
 * the assistant is off). Sample conversations never count.
 */

export type HandoffItem = {
  id: string;
  name: string;
  /** The customer's latest message (or when the thread started). */
  at: string;
  requested: boolean;
  /** A Test AI Bot hand-over (not a real customer). */
  test?: boolean;
};

export type HandoffState = { count: number; items: HandoffItem[] };

/** id → latest customer message time: what the watcher has already seen. */
export type Seen = Map<string, string>;

export const seenFrom = (items: HandoffItem[]): Seen => new Map(items.map((i) => [i.id, i.at]));

/**
 * What to alert about: a thread that wasn't waiting before (a new handoff), or
 * a waiting thread with a newer customer message. The first poll (no `prev`)
 * only sets the baseline: opening the dashboard never chimes for old threads.
 */
export function newArrivals(prev: Seen | null, items: HandoffItem[]): { item: HandoffItem; kind: "handoff" | "message" }[] {
  if (!prev) return [];
  const out: { item: HandoffItem; kind: "handoff" | "message" }[] = [];
  for (const item of items) {
    const before = prev.get(item.id);
    if (before === undefined) out.push({ item, kind: "handoff" });
    else if (Date.parse(item.at) > Date.parse(before)) out.push({ item, kind: "message" });
  }
  return out;
}

/** Did anything in the queue change (to refresh the page)? */
export function queueChanged(prev: Seen | null, items: HandoffItem[]): boolean {
  if (!prev) return false;
  if (prev.size !== items.length) return true;
  return items.some((i) => prev.get(i.id) !== i.at);
}

const COUNT_PREFIX = /^\(\d+\)\s/;

/** "(2) Conversations | WazaBolt" while 2 threads wait; the plain title when none do. */
export function titleWithCount(title: string, count: number): string {
  const bare = title.replace(COUNT_PREFIX, "");
  return count > 0 ? `(${count > 99 ? "99+" : count}) ${bare}` : bare;
}

/** A key per alert, so several open tabs alert once (shared through localStorage). */
export const alertKey = (item: HandoffItem) => `${item.id}@${item.at}`;
