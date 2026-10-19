"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { createDocument } from "@/app/documents/actions";
import { addTask } from "@/app/personal/actions";
import { createClient } from "@/lib/supabase/client";
import type { WorkspaceKind } from "@/lib/types";
import { CREATE_EVENT, takePending } from "./panel-events";
import { flashSaved } from "./Saved";

// Create new: one grid of everything you can make in Oatcake. A sheet from the bottom on phones,
// a panel beside the rail's + on bigger screens. "N" opens it on a keyboard, then a letter picks.
export { openCreate } from "./panel-events";

type Step = "grid" | "quote" | "invoice" | "task";
type Job = { id: number; title: string; business_id: string };
type Tile = { key: string; label: string; icon: React.ReactNode } & ({ href: string } | { step: Step });

const ICON = {
  job: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" />,
  request: <><path d="M5 4h14v12H9l-4 4z" /><path d="M9 9h6M9 12h4" /></>,
  quote: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h3" /></>,
  invoice: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  task: <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
  client: <><circle cx="10" cy="8" r="3.5" /><path d="M3.5 20v-1A4.5 4.5 0 0 1 8 14.5h4A4.5 4.5 0 0 1 16.5 19v1M19 8v6M16 11h6" /></>,
  invite: <><path d="M4 6h16v12H4z" /><path d="m4 7 8 6 8-6" /></>,
};

export default function CreateMenu({
  kind,
  Job,
  Client,
  clientNames,
}: {
  kind: WorkspaceKind;
  Job: string;
  Client: string;
  clientNames: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("grid");
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const trade = kind !== "studio";
  const solo = kind === "solo";
  const tiles: Tile[] = [
    { key: Job[0].toLowerCase(), label: Job, icon: trade ? ICON.job : ICON.request, href: "/portal" },
    { key: "q", label: "Quote", icon: ICON.quote, step: "quote" },
    { key: "i", label: "Invoice", icon: ICON.invoice, step: "invoice" },
    { key: "t", label: "Task", icon: ICON.task, step: "task" },
    // Working alone there are no customers to add and nobody to invite.
    ...(solo ? [] : [
      { key: Client[0].toLowerCase(), label: Client, icon: ICON.client, href: "/customers#add" },
      { key: "p", label: "Invite", icon: ICON.invite, href: "/people#add" },
    ]),
  ];

  const close = () => setOpen(false);
  const pick = (t: Tile) => {
    if ("href" in t) {
      close();
      router.push(t.href);
    } else setStep(t.step);
  };

  useEffect(() => {
    const show = () => {
      takePending(CREATE_EVENT);
      setStep("grid");
      setOpen(true);
    };
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      if (!open && !typing && e.key.toLowerCase() === "n" && !document.querySelector("dialog[open], [role=dialog]")) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener(CREATE_EVENT, show);
    window.addEventListener("keydown", key);
    if (takePending(CREATE_EVENT)) show();
    return () => {
      window.removeEventListener(CREATE_EVENT, show);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  // While open: Escape steps back or closes, and on the grid a tile's letter picks it.
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (step === "grid") close();
        else setStep("grid");
        return;
      }
      if (step !== "grid" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = tiles.find((t) => t.key === e.key.toLowerCase());
      if (t) {
        e.preventDefault();
        pick(t);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  // Focus the first thing in the panel whenever it opens or changes step.
  useEffect(() => {
    if (open) requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>("input, button.ct-tile, button.ct-job")?.focus());
  }, [open, step, jobs]);

  // Quotes and invoices belong to a job, so those ask which one first.
  useEffect(() => {
    if (!open || (step !== "quote" && step !== "invoice") || jobs) return;
    createClient()
      .from("tickets")
      .select("id, title, business_id")
      .order("updated_at", { ascending: false })
      .limit(40)
      .then(({ data }) => setJobs((data as Job[] | null) ?? []), () => setJobs([]));
  }, [open, step, jobs]);

  const back = (
    <button type="button" className="ct-back" onClick={() => setStep("grid")} aria-label="Back">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
    </button>
  );

  let body: React.ReactNode;
  if (step === "grid") {
    body = (
      <>
        <h2 className="ct-title">Create new</h2>
        <div className="ct-grid">
          {tiles.map((t) => (
            <button key={t.label} type="button" className="ct-tile" onClick={() => pick(t)}>
              <kbd>{t.key.toUpperCase()}</kbd>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{t.icon}</svg>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </>
    );
  } else if (step === "task") {
    body = (
      <>
        <h2 className="ct-title">{back}New task</h2>
        <form
          className="ct-task"
          action={(fd) =>
            start(async () => {
              await addTask(fd);
              close();
              flashSaved("Task added to Personal");
              router.refresh();
            })
          }
        >
          <input name="title" placeholder='Try "Call supplier tomorrow !"' required autoComplete="off" aria-label="Task" />
          <button className="ct-add" type="submit" disabled={pending}>{pending ? "Adding…" : "Add"}</button>
        </form>
        <p className="ct-foot">Goes to Personal. Say when it&apos;s due, and add ! to flag it.</p>
      </>
    );
  } else {
    const kind = step;
    body = (
      <>
        <h2 className="ct-title">{back}{kind === "quote" ? "Quote" : "Invoice"} for which {Job.toLowerCase()}?</h2>
        <div className="ct-jobs">
          {jobs === null && <p className="ct-foot">Loading…</p>}
          {jobs?.length === 0 && <p className="ct-foot">No {Job.toLowerCase()}s yet. Add one first, then make its {kind} from there.</p>}
          {jobs?.map((j) => (
            <button key={j.id} type="button" className="ct-job" disabled={pending} onClick={() => start(() => createDocument(j.id, kind))}>
              <span>{j.title || `Untitled ${Job.toLowerCase()}`}</span>
              <small>{clientNames[j.business_id] ?? ""}</small>
            </button>
          ))}
        </div>
      </>
    );
  }

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="ct-layer">
          <motion.div className="ct-scrim" onClick={close} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} />
          <motion.div
            ref={panel}
            className="ct-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Create new"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 520, damping: 40 }}
          >
            <div className="ct-grab" aria-hidden="true" />
            {body}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
