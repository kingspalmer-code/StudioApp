"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { groupByDay, hrefFor, initialsOf, NOTIFICATION_COLUMNS, phrase, whenLabel, type Notification } from "@/lib/notifications";

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

  return {
    items,
    load,
    markRead(id: number) {
      setItems((list) => list?.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: now() } : n)) ?? null);
      void save(supabase.from("notifications").update({ read_at: now() }).eq("id", id).is("read_at", null));
    },
    markAllRead() {
      setItems((list) => (tab === "unread" ? [] : list?.map((n) => (n.read_at ? n : { ...n, read_at: now() })) ?? null));
      void save(supabase.from("notifications").update({ read_at: now() }).is("read_at", null).is("archived_at", null));
    },
    archive(n: Notification) {
      setItems((list) => list?.filter((x) => x.id !== n.id) ?? null);
      void save(supabase.from("notifications").update({ archived_at: now(), read_at: n.read_at ?? now() }).eq("id", n.id));
    },
    restore(n: Notification) {
      setItems((list) => list?.filter((x) => x.id !== n.id) ?? null);
      void save(supabase.from("notifications").update({ archived_at: null }).eq("id", n.id));
    },
  };
}

function Avatar({ n }: { n: Notification }) {
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

// Grouped by day, newest first: who did what to which job, when, and what they said.
export function NotificationList({
  feed,
  tab,
  onOpen,
  max,
}: {
  feed: ReturnType<typeof useNotifications>;
  tab: Tab;
  onOpen?: () => void;
  max?: number;
}) {
  const { items } = feed;
  if (!items) return <p className="nt-empty">Loading…</p>;
  if (!items.length)
    return (
      <p className="nt-empty">
        {tab === "unread" ? "You're all caught up." : tab === "read" ? "Nothing read yet." : "Nothing archived."}
      </p>
    );
  const shown = max ? items.slice(0, max) : items;
  return (
    <div className="nt-groups">
      {groupByDay(shown).map((g) => (
        <section key={g.label} className="nt-group" aria-label={g.label}>
          <p className="nt-day">
            {g.label} <span className="nt-count">{g.items.length}</span>
          </p>
          <ul className="nt-list">
            {g.items.map((n) => {
              const [before, after] = phrase(n);
              const quote = n.body && n.kind !== "files";
              return (
                <li key={n.id} className={`nt-item${n.read_at ? "" : " unread"}`}>
                  <Link
                    href={hrefFor(n)}
                    className="nt-open"
                    onClick={() => {
                      feed.markRead(n.id);
                      onOpen?.();
                    }}
                  >
                    <Avatar n={n} />
                    <span className="nt-text">
                      <span className="nt-line">
                        <b>{n.actor_name}</b> {before} <b>{n.title || "a job"}</b>{after ? ` ${after}` : ""}
                      </span>
                      <span className="nt-when">{whenLabel(n.created_at)}</span>
                      {n.kind === "files" && n.body && <span className="nt-files">{n.body}</span>}
                      {quote && <span className="nt-body">{n.body}</span>}
                    </span>
                  </Link>
                  {!n.read_at && <span className="nt-dot" aria-label="Unread" />}
                  {tab === "archived" ? (
                    <button type="button" className="nt-act nt-restore" onClick={() => feed.restore(n)}>Move back</button>
                  ) : (
                    <button type="button" className="nt-act" onClick={() => feed.archive(n)} aria-label="Archive" title="Archive">
                      <ArchiveIcon />
                    </button>
                  )}
                </li>
              );
            })}
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
