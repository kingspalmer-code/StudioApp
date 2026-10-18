"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { groupByDay, hrefFor, initialsOf, isMessage, NOTIFICATION_COLUMNS, people, phrase, refOf, stackPhrase, stackUp, whenLabel, type Notification } from "@/lib/notifications";

export type Tab = "unread" | "read" | "archived";
export const TABS: { key: Tab; label: string }[] = [
  { key: "unread", label: "Unread" },
  { key: "read", label: "Read" },
  { key: "archived", label: "Archived" },
];

// Your notifications for one tab, with the ways to change them. Changes show straight away and
// are saved in the background, then the bell recounts what's unread.
export const CHANGED = "oc-notifications";
export function useNotifications(tab: Tab, limit: number, enabled = true) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Notification[] | null>(null);

  const load = useCallback(async () => {
    let q = supabase.from("notifications").select(NOTIFICATION_COLUMNS).order("created_at", { ascending: false }).limit(limit);
    q = tab === "archived" ? q.not("archived_at", "is", null) : q.is("archived_at", null);
    if (tab === "unread") q = q.is("read_at", null);
    if (tab === "read") q = q.not("read_at", "is", null);
    const { data } = await q.returns<Notification[]>();
    setItems(data ?? []);
  }, [supabase, tab, limit]);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  const save = async (change: PromiseLike<unknown>) => {
    await change;
    window.dispatchEvent(new Event(CHANGED));
  };
  const now = () => new Date().toISOString();

  const markRead = (ns: Notification[]) => {
    const ids = ns.filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    setItems((list) => list?.map((n) => (ids.includes(n.id) ? { ...n, read_at: now() } : n)) ?? null);
    void save(supabase.from("notifications").update({ read_at: now() }).in("id", ids).is("read_at", null));
  };

  return {
    items,
    load,
    markRead,
    markAllRead() {
      setItems((list) => (tab === "unread" ? [] : list?.map((n) => (n.read_at ? n : { ...n, read_at: now() })) ?? null));
      void save(supabase.from("notifications").update({ read_at: now() }).is("read_at", null).is("archived_at", null));
    },
    archive(ns: Notification[]) {
      const ids = ns.map((n) => n.id);
      setItems((list) => list?.filter((x) => !ids.includes(x.id)) ?? null);
      void save(supabase.from("notifications").update({ archived_at: now() }).in("id", ids));
      markRead(ns);
    },
    restore(ns: Notification[]) {
      const ids = ns.map((n) => n.id);
      setItems((list) => list?.filter((x) => !ids.includes(x.id)) ?? null);
      void save(supabase.from("notifications").update({ archived_at: null }).in("id", ids));
    },
  };
}

type Feed = ReturnType<typeof useNotifications>;

function Avatar({ n }: { n: Pick<Notification, "actor_avatar" | "actor_name"> }) {
  return (
    <span className="nt-avatar" aria-hidden="true">
      {n.actor_avatar ? <img src={n.actor_avatar} alt="" /> : initialsOf(n.actor_name || "?")}
    </span>
  );
}

const ArchiveIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="5" rx="1.5" />
    <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" />
  </svg>
);

function Actions({ items, feed, tab }: { items: Notification[]; feed: Feed; tab: Tab }) {
  const unread = items.some((n) => !n.read_at);
  return (
    <>
      {unread && <span className="nt-dot" aria-label="Unread" />}
      {tab === "archived" ? (
        <button type="button" className="nt-act nt-restore" onClick={() => feed.restore(items)}>Move back</button>
      ) : (
        <button type="button" className="nt-act" onClick={() => feed.archive(items)} aria-label="Archive" title="Archive">
          <ArchiveIcon />
        </button>
      )}
    </>
  );
}

// One thing that happened, or the same person doing it again on the same job (shown once, with
// each of their messages). Tapping it opens the job there.
function OneCard({ items, feed, tab, onOpen }: { items: Notification[]; feed: Feed; tab: Tab; onOpen?: () => void }) {
  const n = items[0];
  const [before, after] = phrase({ kind: n.kind, count: items.reduce((sum, x) => sum + x.count, 0) });
  const message = isMessage(n);
  const bodies = message ? [...new Set(items.map((x) => x.body).filter(Boolean))].slice(0, 3) : n.body && n.kind !== "files" ? [n.body] : [];
  const times = items.length > 1 && !message && n.kind !== "files" ? items.length : 0;
  return (
    <li className={`nt-item${items.some((x) => !x.read_at) ? " unread" : ""}${message ? " msg" : ""}`}>
      <Link
        href={hrefFor(n)}
        className="nt-open"
        onClick={() => {
          feed.markRead(items);
          onOpen?.();
        }}
      >
        <Avatar n={n} />
        <span className="nt-text">
          <span className="nt-line">
            <b>{n.actor_name}</b> {before} <b>{n.title || "a job"}</b>{after ? ` ${after}` : ""}
          </span>
          <span className="nt-when">
            {whenLabel(n.created_at)}
            {times ? ` · ${times} times` : ""}
          </span>
          {n.kind === "files" && <span className="nt-files">{[...new Set(items.flatMap((x) => x.body.split(", ")))].filter(Boolean).join(", ")}</span>}
          {bodies.map((b, i) => (
            <span key={i} className="nt-body"><span className="nt-clamp">{b}</span></span>
          ))}
        </span>
      </Link>
      <Actions items={items} feed={feed} tab={tab} />
    </li>
  );
}

function bySame(items: Notification[]) {
  const groups = new Map<string, Notification[]>();
  for (const n of items) {
    const k = `${refOf(n)}:${n.actor_name}`;
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }
  return [...groups.values()];
}

// Several people, or several jobs, doing the same kind of thing: one card, stacked, that opens
// up to show each one.
function StackCard({ items, feed, tab, onOpen }: { items: Notification[]; feed: Feed; tab: Tab; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const faces = [...new Map(items.map((n) => [n.actor_name, n])).values()];
  const jobs = [...new Set(items.map((n) => n.title || "a job"))];
  const subs = stackUp(items).flatMap((c) =>
    // Inside an open stack, each person-and-job is its own card.
    c.kind === "one" ? [c.items] : bySame(c.items)
  );
  return (
    <li className={`nt-item nt-stack${open ? " open" : ""}${items.some((x) => !x.read_at) ? " unread" : ""}`} data-depth={Math.min(subs.length, 3)}>
      <button type="button" className="nt-open" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="nt-faces" aria-hidden="true">
          <Avatar n={faces[0]} />
          {faces.length > 1 && <span className="nt-plus">+{faces.length - 1}</span>}
        </span>
        <span className="nt-text">
          <span className="nt-line">
            <b>{people(items)}</b> {stackPhrase(items[0].kind, jobs.length)}
          </span>
          <span className="nt-when">{whenLabel(items[0].created_at)}</span>
          <span className="nt-jobs">
            {jobs.slice(0, 3).join(" · ")}
            {jobs.length > 3 ? ` · +${jobs.length - 3} more` : ""}
          </span>
          <span className="nt-more">{open ? "Show less" : `Show all ${subs.length}`}</span>
        </span>
      </button>
      <Actions items={items} feed={feed} tab={tab} />
      {open && (
        <ul className="nt-list nt-sublist">
          {subs.map((g) => <OneCard key={g[0].id} items={g} feed={feed} tab={tab} onOpen={onOpen} />)}
        </ul>
      )}
    </li>
  );
}

// Grouped by day, newest first, with like things stacked: who did what to which job, when, and
// what they said.
export function NotificationList({ feed, tab, onOpen }: { feed: Feed; tab: Tab; onOpen?: () => void }) {
  const { items } = feed;
  if (!items) return <p className="nt-empty">Loading…</p>;
  if (!items.length)
    return (
      <p className="nt-empty">
        {tab === "unread" ? "You're all caught up." : tab === "read" ? "Nothing read yet." : "Nothing archived."}
      </p>
    );
  return (
    <div className="nt-groups">
      {groupByDay(items).map((g) => (
        <section key={g.label} className="nt-group" aria-label={g.label}>
          <p className="nt-day">
            {g.label} <span className="nt-count">{g.items.length}</span>
          </p>
          <ul className="nt-list">
            {stackUp(g.items).map((c) =>
              c.kind === "stack" ? (
                <StackCard key={c.key} items={c.items} feed={feed} tab={tab} onOpen={onOpen} />
              ) : (
                <OneCard key={c.key} items={c.items} feed={feed} tab={tab} onOpen={onOpen} />
              )
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <div className="seg nt-tabs" role="group" aria-label="Show">
      {TABS.map((t) => (
        <button key={t.key} type="button" aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export const CheckAllIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 13l4 4L16 7M10 15l2 2L22 7" />
  </svg>
);
