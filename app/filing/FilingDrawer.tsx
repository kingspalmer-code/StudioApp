"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { monthName, type FiledJob, type FiledMonth, type JobFile } from "@/lib/filing";
import { formatDate, money } from "@/lib/priority";
import PdfSheet, { type PdfRequest } from "@/components/PdfSheet";
import Thumb from "@/components/Thumb";
import { openFile } from "./actions";

// A card-file drawer, after Kingsley's line-drawn references: month dividers with filled tabs,
// job cards behind them with outlined tabs, staggered so every tab can be read. Tapping a divider
// thumbs that month open; tapping a job pulls its card up and opens its file.

const pad = (n: number) => String(n).padStart(3, "0");
// Where tabs sit along the card, as a share of its width: dividers step across, jobs alternate.
const DIVIDER_AT = [2, 24, 48, 70];
const JOB_AT = [33, 56];
// Cards nearer the front of the drawer are a touch wider, as if seen from above.
const DEPTH = 14;
const STEP = 2.5;

type Item =
  | { kind: "divider"; m: FiledMonth; i: number }
  | { kind: "job"; job: FiledJob; i: number; month: string }
  | { kind: "edge"; key: string };

function Slant({ side }: { side: "l" | "r" }) {
  return (
    <svg className={`fd-slant fd-slant-${side}`} viewBox="0 0 12 24" width="12" height="24" aria-hidden="true">
      <path className="fd-slant-fill" d="M0 24V23.25C3 23.25 3.5 22 4.2 19L7.8 4.5C8.5 1.5 9.5.75 12 .75V24Z" />
      <path className="fd-slant-line" d="M0 23.25C3 23.25 3.5 22 4.2 19L7.8 4.5C8.5 1.5 9.5.75 12 .75" />
    </svg>
  );
}

function Tab({ children }: { children: ReactNode }) {
  return (
    <span className="fd-tab">
      <Slant side="l" />
      <span className="fd-tab-in">{children}</span>
      <Slant side="r" />
    </span>
  );
}

export default function FilingDrawer({ months, label, openId }: { months: FiledMonth[]; label: string; openId: number | null }) {
  const holding = (id: number | null) => months.find((m) => m.jobs.some((j) => j.id === id))?.key;
  const [open, setOpen] = useState<string | null>(holding(openId) ?? months.find((m) => m.jobs.length)?.key ?? months[0]?.key ?? null);
  const [fileId, setFileId] = useState<number | null>(openId);
  const [file, setFile] = useState<JobFile | null>(null);
  const [failed, setFailed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pdf, setPdf] = useState<{ id: number; title: string; request: PdfRequest } | null>(null);
  const reduce = useReducedMotion();
  const thisYear = months[0]?.key.slice(0, 4);
  const total = months.reduce((n, m) => n + m.jobs.length, 0);
  const oldest = [...months].reverse().find((m) => m.jobs.length);

  useEffect(() => setMounted(true), []);

  // Read the file when a card's pulled, and keep it in the address so a refresh or a shared link
  // opens the same one.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (fileId == null) url.searchParams.delete("file");
    else url.searchParams.set("file", String(fileId));
    window.history.replaceState(window.history.state, "", url);
    if (fileId == null) return;
    let live = true;
    setFile(null);
    setFailed(false);
    openFile(fileId)
      .then((f) => live && (f ? setFile(f) : setFailed(true)))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [fileId]);

  const items: Item[] = [];
  months.forEach((m, mi) => {
    items.push({ kind: "divider", m, i: mi });
    if (open === m.key) m.jobs.forEach((job, i) => items.push({ kind: "job", job, i, month: m.key }));
    else for (let i = 0; i < Math.min(m.jobs.length, 6); i++) items.push({ kind: "edge", key: `${m.key}-${i}` });
  });
  const inset = (n: number) => Math.min(items.length - 1 - n, DEPTH) * STEP;
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 420, damping: 34 };

  return (
    <div className="fd">
      <header className="fd-head">
        <div>
          <h1 className="fd-title">Filing</h1>
          <p className="fd-sub">
            {total
              ? `${total} finished job${total === 1 ? "" : "s"} filed by the month ${total === 1 ? "it was" : "they were"} finished${oldest ? `, back to ${monthName(oldest.key)} ${oldest.key.slice(0, 4)}` : ""}.`
              : "Finished jobs file themselves here, behind a divider for the month they were finished."}{" "}
            Tap a month to thumb through it, and a job to open its file.
          </p>
        </div>
      </header>

      <div className="fd-drawer">
        <div className="fd-well">
          {items.map((it, n) => {
            const style = { "--in": `${inset(n)}px` } as CSSProperties;
            if (it.kind === "edge") return <motion.div layout="position" transition={spring} key={it.key} className="fd-card fd-edge" style={style} aria-hidden="true" />;
            if (it.kind === "divider") {
              const { m } = it;
              const isOpen = open === m.key;
              const people = new Set(m.jobs.map((j) => j.biz).filter(Boolean)).size;
              const quoted = m.jobs.reduce((s, j) => s + (j.amount ?? 0), 0);
              return (
                <motion.button
                  layout="position"
                  transition={spring}
                  key={m.key}
                  type="button"
                  className={`fd-card fd-divider${isOpen ? " fd-open" : ""}`}
                  style={{ ...style, "--x": `${DIVIDER_AT[it.i % DIVIDER_AT.length]}%` } as CSSProperties}
                  aria-expanded={isOpen}
                  whileHover={reduce ? undefined : { y: -4 }}
                  whileTap={reduce ? undefined : { y: -1 }}
                  onClick={() => setOpen(isOpen ? null : m.key)}
                >
                  <Tab>
                    <b>{monthName(m.key, "short")}{m.key.slice(0, 4) !== thisYear || it.i === 0 ? <small> ’{m.key.slice(2, 4)}</small> : null}</b>
                    <span>{pad(m.jobs.length)}</span>
                  </Tab>
                  {isOpen && (
                    <span className="fd-face">
                      <strong>{monthName(m.key)} {m.key.slice(0, 4)}</strong>
                      <span>
                        {m.jobs.length
                          ? [`${m.jobs.length} job${m.jobs.length === 1 ? "" : "s"} filed`, people > 1 ? `for ${people} clients` : "", quoted ? `${money(quoted)} quoted` : ""].filter(Boolean).join(" · ")
                          : it.i === 0 ? "Nothing filed this month yet. Jobs land here as they’re finished." : "Nothing filed this month."}
                      </span>
                    </span>
                  )}
                </motion.button>
              );
            }
            const { job } = it;
            return (
              <motion.button
                layout="position"
                transition={spring}
                initial={reduce ? false : { opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: fileId === job.id && !reduce ? -18 : 0 }}
                whileHover={reduce ? undefined : { y: fileId === job.id ? -18 : -6 }}
                whileTap={reduce ? undefined : { y: -2 }}
                key={job.id}
                type="button"
                className={`fd-card fd-job${fileId === job.id ? " fd-pulled" : ""}`}
                style={{ ...style, "--x": `${JOB_AT[it.i % JOB_AT.length]}%` } as CSSProperties}
                onClick={() => setFileId(job.id)}
                aria-label={`Open the file for ${job.title}`}
              >
                <Tab>
                  <b>{job.id}</b>
                  <span>{job.title}</span>
                </Tab>
                <span className="fd-peek">
                  {job.biz && <span>{job.biz}</span>}
                  <span>{formatDate(job.finished)}</span>
                  {job.invoice && <span className={job.invoice === "Paid" ? "fd-paid" : undefined}>{job.invoice}</span>}
                </span>
              </motion.button>
            );
          })}
        </div>
        <div className="fd-front">
          <svg className="fd-front-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 0H100L96.5 100H3.5Z" vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="fd-label">{label}</span>
          <span className="fd-pull" aria-hidden="true" />
        </div>
      </div>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {fileId != null && (
              <Folder
                key={fileId}
                id={fileId}
                file={file}
                failed={failed}
                onClose={() => setFileId(null)}
                onInvoice={(inv) => setPdf({ id: inv.id, title: inv.name, request: { url: `/documents/${inv.id}/pdf`, filename: inv.filename } })}
                reduce={!!reduce}
              />
            )}
          </AnimatePresence>,
          document.body,
        )}
      {/* Outside the folder, so the PDF isn't caught up in its tilt. */}
      {mounted &&
        createPortal(
          <PdfSheet
            request={pdf?.request ?? null}
            title={pdf?.title ?? "Invoice"}
            onClose={() => setPdf(null)}
            actions={pdf ? <Link className="btn plain" href={`/documents/${pdf.id}`}>Open the invoice page</Link> : null}
          />,
          document.body,
        )}
    </div>
  );
}

// The job's file, out of the drawer: a folder with its papers inside.
type Invoice = NonNullable<JobFile["invoice"]>;

function Folder({ id, file, failed, onClose, onInvoice, reduce }: { id: number; file: JobFile | null; failed: boolean; onClose: () => void; onInvoice: (inv: Invoice) => void; reduce: boolean }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus({ preventScroll: true });
    // Esc puts the file back, unless it's closing the invoice open on top of it.
    const key = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector(".sheet-wrap") && onClose();
    window.addEventListener("keydown", key);
    const html = document.documentElement;
    html.classList.add("fd-locked");
    return () => {
      window.removeEventListener("keydown", key);
      html.classList.remove("fd-locked");
    };
  }, [onClose]);

  return (
    <motion.div className="fd-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.18 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.article
        className="fd-folder"
        role="dialog"
        aria-modal="true"
        aria-label={file ? `File for ${file.title}` : "Job file"}
        initial={reduce ? false : { y: 90, rotateX: 14, opacity: 0 }}
        animate={{ y: 0, rotateX: 0, opacity: 1 }}
        exit={reduce ? { opacity: 0 } : { y: 70, rotateX: 10, opacity: 0 }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 28 }}
      >
        <div className="fd-folder-tab">
          <b>{id}</b>
          <span>{file ? file.finished : "Job file"}</span>
        </div>
        <button ref={close} type="button" className="fd-close" onClick={onClose} aria-label="Put the file back">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div className="fd-folder-in">
          {failed ? (
            <div className="fd-sheet"><p className="fd-empty">This file couldn’t be opened. It may have moved out of finished work.</p></div>
          ) : !file ? (
            <div className="fd-sheet fd-loading" aria-busy="true">
              <span /><span /><span />
              <p className="fd-empty">Pulling the file…</p>
            </div>
          ) : (
            <FileContents file={file} onInvoice={onInvoice} />
          )}
        </div>
      </motion.article>
    </motion.div>
  );
}

function FileContents({ file, onInvoice }: { file: JobFile; onInvoice: (inv: Invoice) => void }) {
  const any = file.invoice || file.details.length || file.docs.length || file.images.length || file.others.length || file.refs.length || file.notes.length || file.hours;
  return (
    <>
      <section className="fd-sheet fd-cover">
        <p className="fd-kicker">{[file.biz, file.type].filter(Boolean).join(" · ")}</p>
        <h2>{file.title}</h2>
        <dl className="fd-facts">
          <div><dt>Started</dt><dd>{file.started}</dd></div>
          <div><dt>Finished</dt><dd>{file.finished}</dd></div>
          {file.hours && <div><dt>Hours</dt><dd>{file.hours}</dd></div>}
          <div><dt>Stage</dt><dd>{file.status}</dd></div>
        </dl>
      </section>

      {file.invoice && (
        <section className="fd-sheet fd-invoice">
          <h3>Invoice</h3>
          <div className="fd-invoice-row">
            <div>
              <b>{file.invoice.name}</b>
              <span>Sent {file.invoice.sent}{file.invoice.to ? ` to ${file.invoice.to}` : ""}</span>
            </div>
            <em>{file.invoice.total}</em>
            <span className={`fd-stamp${file.invoice.paid ? " fd-stamp-paid" : ""}`}>{file.invoice.status}</span>
          </div>
          <button type="button" className="btn" onClick={() => onInvoice(file.invoice!)}>View invoice</button>
        </section>
      )}

      {file.images.length > 0 && (
        <section className="fd-sheet">
          <h3>Finished work</h3>
          <div className="fd-prints">
            {file.images.map((im, i) => (
              <a key={i} className="fd-print" href={im.view ?? im.download ?? "#"} target="_blank" rel="noreferrer" style={{ "--r": `${[-1.6, 1.1, -0.6, 1.8, -1.2][i % 5]}deg` } as CSSProperties}>
                {im.path && !/svg$/i.test(im.name) ? <Thumb bucket="deliveries" path={im.path} full={im.view} alt={im.name} /> : im.view ? <img src={im.view} alt={im.name} loading="lazy" /> : <span>{im.name}</span>}
              </a>
            ))}
          </div>
        </section>
      )}

      {file.docs.length > 0 && (
        <section className="fd-sheet">
          <h3>{file.invoice ? "Other quotes and invoices" : "Quotes and invoices"}</h3>
          <ul className="fd-lines">
            {file.docs.map((d) => (
              <li key={d.id}>
                <Link href={`/documents/${d.id}`}>
                  <b>{d.name}</b>
                  <span>{d.issued} · {d.status}</span>
                  <em>{d.total}</em>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {file.details.map((g, gi) => (
        <section className="fd-sheet fd-ruled" key={gi}>
          <h3>{g.title ?? "Details"}</h3>
          <dl className="fd-details">
            {g.rows.map((r, i) => (
              <div key={i} className={r.long ? "fd-long" : undefined}>
                <dt>{r.label}</dt>
                <dd>{r.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      {(file.others.length > 0 || file.refs.length > 0) && (
        <section className="fd-sheet">
          <h3>Other files</h3>
          <ul className="fd-lines">
            {file.others.map((o, i) => (
              <li key={`o${i}`}>
                <a href={o.download ?? "#"} target="_blank" rel="noreferrer"><b>{o.name}</b><span>{o.size}</span><em>Download</em></a>
              </li>
            ))}
            {file.refs.map((r, i) => (
              <li key={`r${i}`}>
                <a href={r.view ?? "#"} target="_blank" rel="noreferrer"><b>{r.name}</b><span>Sent with the request</span><em>View</em></a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {file.notes.length > 0 && (
        <section className="fd-sheet fd-ruled">
          <h3>Notes</h3>
          {file.notes.map((n, i) => (
            <Fragment key={i}>
              <p className="fd-note-by">{n.who} · {n.when}</p>
              <p className="fd-note">{n.approval ? "✓ Approved a draft" : n.body}</p>
            </Fragment>
          ))}
        </section>
      )}

      {!any && <div className="fd-sheet"><p className="fd-empty">Nothing else was kept with this job.</p></div>}

      <Link className="fd-job-link" href={`/tickets/${file.id}`}>Open the full job</Link>
    </>
  );
}
