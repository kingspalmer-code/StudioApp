"use client";

import { AnimatePresence, motion, MotionConfig } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { CHANGED, CheckAllIcon, NotificationList, Tabs, useNotifications, type Tab } from "./Notifications";

// The bell in the top corner: a count of what's new, and a panel listing what other people have
// done on your jobs (requests, notes and replies, approvals, files, drafts, finished work).
export default function Bell() {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("unread");
  const [unread, setUnread] = useState(0);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  const recount = useCallback(async () => {
    const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).is("archived_at", null);
    setUnread(count ?? 0);
  }, [supabase]);
  const feed = useNotifications(tab, 30, open);

  // Checks for new ones every minute while the page is showing, and straight away on coming back to it.
  useEffect(() => {
    setMounted(true);
    // Inside a job opened beside the queue the bell is hidden; the page around it does the checking.
    if (document.documentElement.classList.contains("embedded")) return;
    void recount();
    const tick = () => {
      if (document.visibilityState === "visible") void recount();
    };
    const timer = setInterval(tick, 60_000);
    const changed = () => void recount();
    document.addEventListener("visibilitychange", tick);
    window.addEventListener(CHANGED, changed);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener(CHANGED, changed);
    };
  }, [recount]);

  useEffect(() => {
    setOpen(false);
    void recount();
  }, [pathname, recount]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        className="bell-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && <span className="bell-count">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {mounted &&
        createPortal(
          <MotionConfig reducedMotion="user">
            <AnimatePresence>
              {open && (
                <div className="nt-layer" key="bell">
                  <div className="nt-scrim" onClick={close} />
                  <motion.div
                    className="nt-panel"
                    role="dialog"
                    aria-label="Notifications"
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  >
                    <div className="nt-head">
                      <h2>Notifications</h2>
                      <button type="button" className="sheet-close nt-close" onClick={close} aria-label="Close">×</button>
                    </div>
                    <Tabs tab={tab} setTab={setTab} />
                    <div className="nt-scroll">
                      <NotificationList feed={feed} tab={tab} onOpen={close} />
                    </div>
                    <div className="nt-foot">
                      {tab !== "archived" && unread > 0 ? (
                        <button type="button" className="link nt-all-read" onClick={() => feed.markAllRead()}>
                          <CheckAllIcon /> Mark all as read
                        </button>
                      ) : (
                        <span />
                      )}
                      <Link href="/notifications" className="btn small" onClick={close}>View all notifications</Link>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </MotionConfig>,
          document.body
        )}
    </>
  );
}
