"use client";

import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import SplitPanel, { SPLIT_QUERY } from "./SplitPanel";

// Wrap a list of jobs (TicketRow links) in this and, on wide screens, a plain click on one opens
// it in the panel on the right instead of leaving the page. Cmd-click and narrow screens still go
// to the job's page. `warm` names jobs worth loading ahead (e.g. the top of the queue); a job you
// rest the pointer on loads ahead too. `off` turns it off (e.g. while selecting).
export default function SplitHost({ children, warm = [], off = false }: { children: ReactNode; warm?: number[]; off?: boolean }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);
  const hoverWait = useRef<ReturnType<typeof setTimeout>>(undefined);
  const box = useRef<HTMLDivElement>(null);

  // While a job is open beside the list, the page makes room for it (globals.css, html.split-open),
  // and its row is marked.
  useEffect(() => {
    document.documentElement.classList.toggle("split-open", openId !== null);
    box.current?.querySelectorAll("a.ticket").forEach((a) => {
      if (a.getAttribute("href") === `/tickets/${openId}`) a.setAttribute("data-open", "");
      else a.removeAttribute("data-open");
    });
    return () => document.documentElement.classList.remove("split-open");
  }, [openId, children]);

  // Going back to a narrow window closes the panel rather than squashing the list.
  useEffect(() => {
    const wide = window.matchMedia(SPLIT_QUERY);
    const fit = () => !wide.matches && setOpenId(null);
    wide.addEventListener("change", fit);
    return () => wide.removeEventListener("change", fit);
  }, []);
  useEffect(() => () => clearTimeout(hoverWait.current), []);

  const rowId = (e: MouseEvent | PointerEvent) =>
    Number((e.target as Element).closest?.("a.ticket")?.getAttribute("href")?.match(/^\/tickets\/(\d+)$/)?.[1]) || null;

  const click = (e: MouseEvent) => {
    if (off || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!window.matchMedia(SPLIT_QUERY).matches) return;
    const id = rowId(e);
    if (!id) return;
    e.preventDefault();
    setOpenId(id);
  };
  // After a beat, so sweeping across the list doesn't load every job.
  const hover = (e: PointerEvent) => {
    const id = rowId(e);
    clearTimeout(hoverWait.current);
    if (id && id !== hoverId) hoverWait.current = setTimeout(() => setHoverId(id), 80);
  };

  return (
    <div ref={box} className="split-host" onClickCapture={click} onPointerOver={hover}>
      {children}
      <SplitPanel openId={openId} warm={off ? [] : [...warm, ...(hoverId ? [hoverId] : [])]} onOpen={setOpenId} onClose={() => setOpenId(null)} />
    </div>
  );
}
