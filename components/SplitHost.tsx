"use client";

import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import SplitPanel, { SPLIT_QUERY, opensHere } from "./SplitPanel";

// Wrap a list of jobs (TicketRow links) in this and, on wide screens, a plain click on one opens
// it in the panel on the right instead of leaving the page. Cmd-click and narrow screens still go
// to the job's page. `warm` names jobs worth loading ahead (e.g. the top of the queue); a job you
// rest the pointer on loads ahead too. `off` turns it off (e.g. while selecting).
// `under` makes it work for another list: links to `${under}/<something>` open on the right
// (e.g. "/settings" for the Settings sections), and `label` names what's open for screen readers.
export default function SplitHost({
  children,
  warm = [],
  off = false,
  under = "/tickets",
  label = "Job",
}: {
  children: ReactNode;
  warm?: number[];
  off?: boolean;
  under?: string;
  label?: string;
}) {
  const [openHref, setOpenHref] = useState<string | null>(null);
  const [hoverHref, setHoverHref] = useState<string | null>(null);
  const hoverWait = useRef<ReturnType<typeof setTimeout>>(undefined);
  const box = useRef<HTMLDivElement>(null);

  // While a job is open beside the list, the page makes room for it (globals.css, html.split-open),
  // and its row is marked.
  useEffect(() => {
    if (openHref === null) return;
    document.documentElement.classList.add("split-open");
    return () => document.documentElement.classList.remove("split-open");
  }, [openHref]);
  useEffect(() => {
    box.current?.querySelectorAll("a[href]").forEach((a) => {
      if (a.closest(".split-host") !== box.current) return;
      if (a.getAttribute("href") === openHref) a.setAttribute("data-open", "");
      else a.removeAttribute("data-open");
    });
  }, [openHref, children]);

  // Going back to a narrow window closes the panel rather than squashing the list.
  useEffect(() => {
    const wide = window.matchMedia(SPLIT_QUERY);
    const fit = () => !wide.matches && setOpenHref(null);
    wide.addEventListener("change", fit);
    return () => wide.removeEventListener("change", fit);
  }, []);
  useEffect(() => () => clearTimeout(hoverWait.current), []);

  // A list inside another (the queue's list in a page of blocks) looks after its own rows, and
  // opening a job in one closes whatever the other had open.
  useEffect(() => {
    const other = (e: Event) => (e as CustomEvent).detail !== box.current && setOpenHref(null);
    window.addEventListener("oc-split-open", other);
    return () => window.removeEventListener("oc-split-open", other);
  }, []);

  const rowHref = (e: MouseEvent | PointerEvent) => {
    if ((e.target as Element).closest?.(".split-host") !== box.current) return null;
    const href = (e.target as Element).closest?.("a[href]")?.getAttribute("href");
    return href && opensHere(under, href) ? href : null;
  };

  const click = (e: MouseEvent) => {
    if (off || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!window.matchMedia(SPLIT_QUERY).matches) return;
    const href = rowHref(e);
    if (!href) return;
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("oc-split-open", { detail: box.current }));
    setOpenHref(href);
  };
  // After a beat, so sweeping across the list doesn't load every job.
  const hover = (e: PointerEvent) => {
    const href = rowHref(e);
    clearTimeout(hoverWait.current);
    if (href && href !== hoverHref) hoverWait.current = setTimeout(() => setHoverHref(href), 80);
  };

  return (
    <div ref={box} className="split-host" onClickCapture={click} onPointerOver={hover}>
      {children}
      <SplitPanel
        under={under}
        label={label}
        openHref={openHref}
        warm={off ? [] : [...warm.map((id) => `${under}/${id}`), ...(hoverHref ? [hoverHref] : [])]}
        onOpen={setOpenHref}
        onClose={() => setOpenHref(null)}
      />
    </div>
  );
}
