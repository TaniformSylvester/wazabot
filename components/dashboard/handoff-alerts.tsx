"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, BellOff } from "lucide-react";

import { alertKey, newArrivals, queueChanged, seenFrom, titleWithCount, type HandoffItem, type Seen } from "@/lib/handoffs/alerts";
import { cn } from "@/lib/utils";

/*
 * The live handoff queue, on every dashboard page (in the header):
 *
 *  - polls /api/dashboard/handoffs (a few hundred bytes) every 10 s while the
 *    tab is visible, 30 s in the background (browsers may slow it further),
 *    and at once when the tab comes back or the connection returns;
 *  - when the queue changes, refreshes the page so the queue and the lists
 *    update without a reload;
 *  - "(2) …" on the tab title while threads wait for a person;
 *  - on a new handoff, or a new customer message on a waiting thread: a short
 *    chime (Web Audio, no sound file) if the counter alert sound is on — the
 *    switch is remembered in this browser — and a browser notification if the
 *    person allowed them. Several open tabs alert once.
 *
 * No customer message text is put in a notification (lock screens).
 */

const SOUND_KEY = "wb_alert_sound";
const ALERTED_KEY = "wb_handoff_alerted";
const VISIBLE_MS = 10_000;
const HIDDEN_MS = 30_000;

type Labels = {
  sound: string;
  soundOn: string;
  soundOff: string;
  notifyHandoff: string;
  notifyMessage: string;
  notifyTitle: string;
};

const store = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Private mode or storage blocked: the switch just isn't remembered.
    }
  },
};

/** Two quick rising notes (~0.45 s): distinct from WhatsApp's own sounds, gentle at a counter. */
function chime(ctx: AudioContext) {
  const start = ctx.currentTime + 0.01;
  for (const [i, freq] of [880, 1318.5].entries()) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = start + i * 0.16;
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  }
}

/** The switch, as an external store: this browser's localStorage, kept in step across open tabs. */
const SOUND_EVENT = "wb-alert-sound";
function subscribeSound(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(SOUND_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SOUND_EVENT, onChange);
  };
}
const soundSnapshot = () => store.get(SOUND_KEY) === "on";
const soundServerSnapshot = () => false;

/** This alert hasn't been given by another open tab yet (and now it has). */
function claimAlert(key: string): boolean {
  const recent = (store.get(ALERTED_KEY) ?? "").split(" ").filter(Boolean);
  if (recent.includes(key)) return false;
  store.set(ALERTED_KEY, [key, ...recent].slice(0, 50).join(" "));
  return true;
}

export function HandoffAlerts({ labels, conversationsHref }: { labels: Labels; conversationsHref: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const soundOn = useSyncExternalStore(subscribeSound, soundSnapshot, soundServerSnapshot);
  const [count, setCount] = useState(0);
  const seen = useRef<Seen | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const soundRef = useRef(false);
  // Props change on every page refresh: kept in refs so the polling loop isn't restarted each time.
  const labelsRef = useRef(labels);
  const hrefRef = useRef(conversationsHref);
  useEffect(() => {
    labelsRef.current = labels;
    hrefRef.current = conversationsHref;
  }, [labels, conversationsHref]);

  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  const audioContext = useCallback(() => {
    if (typeof window === "undefined" || !("AudioContext" in window)) return null;
    audio.current ??= new AudioContext();
    return audio.current;
  }, []);

  const alert = useCallback(
    (item: HandoffItem, kind: "handoff" | "message") => {
      if (!claimAlert(alertKey(item))) return;
      if (soundRef.current) {
        const ctx = audioContext();
        if (ctx) void ctx.resume().then(() => chime(ctx)).catch(() => {});
      }
      if ("Notification" in window && Notification.permission === "granted") {
        const l = labelsRef.current;
        try {
          const n = new Notification(l.notifyTitle, {
            body: (kind === "handoff" ? l.notifyHandoff : l.notifyMessage).replace("{name}", item.name),
            tag: `handoff-${item.id}`,
          });
          n.onclick = () => {
            window.focus();
            router.push(`${hrefRef.current}/${item.id}`);
            n.close();
          };
        } catch {
          // Some mobile browsers only allow notifications from a service worker.
        }
      }
    },
    [audioContext, router],
  );

  // Polling: fast while visible, slower in the background, at once on return.
  useEffect(() => {
    let timer: number | undefined;
    let stopped = false;
    const poll = async () => {
      window.clearTimeout(timer);
      try {
        const res = await fetch("/api/dashboard/handoffs", { cache: "no-store", headers: { accept: "application/json" } });
        if (res.status === 401 || res.status === 403) {
          stopped = true;
          return;
        }
        if (res.ok) {
          const state = (await res.json()) as { count: number; items: HandoffItem[] };
          const prev = seen.current;
          for (const { item, kind } of newArrivals(prev, state.items)) alert(item, kind);
          if (queueChanged(prev, state.items)) router.refresh();
          seen.current = seenFrom(state.items);
          setCount(state.count);
        }
      } catch {
        // Offline or a dropped connection: try again on the next tick.
      }
      if (!stopped) timer = window.setTimeout(poll, document.visibilityState === "visible" ? VISIBLE_MS : HIDDEN_MS);
    };
    const now = () => {
      if (!stopped && document.visibilityState === "visible") void poll();
    };
    void poll();
    document.addEventListener("visibilitychange", now);
    window.addEventListener("online", now);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", now);
      window.removeEventListener("online", now);
    };
  }, [alert, router]);

  // "(2) …" on the tab title; pages set their own titles, so it's re-applied when the title changes.
  useEffect(() => {
    const apply = () => {
      const next = titleWithCount(document.title, count);
      if (next !== document.title) document.title = next;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => {
      observer.disconnect();
      document.title = titleWithCount(document.title, 0);
    };
  }, [count, pathname]);

  const toggle = () => {
    const on = !soundOn;
    soundRef.current = on;
    store.set(SOUND_KEY, on ? "on" : "off");
    window.dispatchEvent(new Event(SOUND_EVENT));
    if (on) {
      // A click is the moment browsers allow sound to start: play the chime once so it's heard and unlocked.
      const ctx = audioContext();
      if (ctx) void ctx.resume().then(() => chime(ctx)).catch(() => {});
      if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission().catch(() => {});
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={soundOn}
      onClick={toggle}
      title={soundOn ? labels.soundOn : labels.soundOff}
      data-testid="alert-sound"
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-colors",
        soundOn ? "border-waza-500 bg-mint text-deep" : "border-border bg-card text-slate hover:bg-mint",
      )}
    >
      {soundOn ? <Bell className="size-4" aria-hidden /> : <BellOff className="size-4" aria-hidden />}
      <span className="hidden lg:inline">{labels.sound}</span>
      <span className="sr-only lg:hidden">{labels.sound}</span>
      {count > 0 ? (
        <span className="grid min-w-5 place-items-center rounded-full bg-coral-600 px-1 text-[0.6875rem] font-bold text-white" data-testid="handoff-count" aria-label={`${count}`}>
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </button>
  );
}
