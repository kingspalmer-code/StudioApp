"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { monthName, type FiledJob, type FiledMonth, type JobFile } from "@/lib/filing";
import { formatDate, money } from "@/lib/priority";
import PdfSheet, { type PdfRequest } from "@/components/PdfSheet";
import Thumb from "@/components/Thumb";
import { openFile } from "./actions";

// A calm list of finished work: one heading per month, newest first, and a row per job with a
// small filed-card tab for its number and the invoice's stamp. The latest month with work in it
// starts open; older months fold to one line until tapped. Typing in the box finds a job in any
// month. A row opens the job's file.

const has = (j: FiledJob, q: string) => `${j.id} ${j.title} ${j.biz} ${j.type}`.toLowerCase().includes(q);

export default function FilingList({ months, openId }: { months: FiledMonth[]; openId: number | null }) {
  const holding = (id: number | null) => months.find((m) => m.jobs.some((j) => j.id === id))?.key;
  const first = holding(openId) ?? months.find((m) => m.jobs.length)?.key ?? months[0]?.key;
  const [open, setOpen] = useState<Set<string>>(() => new Set(first ? [first] : []));
  const [find, setFind] = useState("");
  const [fileId, setFileId] = useState<number | null>(openId);
  const [file, setFile] = useState<JobFile | null>(null);
  const [failed, setFailed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pdf, setPdf] = useState<{ id: number; title: string; request: PdfRequest } | null>(null);
  const reduce = useReducedMotion();
  const total = months.reduce((n, m) => n + m.jobs.length, 0);
  const oldest = [...months].reverse().find((m) => m.jobs.length);
  const q = find.trim().toLowerCase();
  const shown = q ? months.map((m) => ({ ...m, jobs: m.jobs.filter((j) => has(j, q)) })).filter((m) => m.jobs.length) : months;

  useEffect(() => setMounted(true), []);

  // Read the file when a row's opened, and keep it in the address so a refresh or a shared link
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

  const toggle = (key: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  return (
    <div className="fd">
      <header className="fd-head">
        <h1 className="fd-title">Filing</h1>
        <p className="fd-sub">
          {total
            ? `${total} finished job${total === 1 ? "" : "s"}${oldest ? `, back to ${monthName(oldest.key)} ${oldest.key.slice(0, 4)}` : ""}.`
            : "Finished jobs file themselves here, under the month they were finished."}
        </p>
        {total > 0 && (
          <label className="fd-find">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
            <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a job, client or number" aria-label="Find a finished job" />
          </label>
        )}
      </header>

      {q && !shown.length && <p className="fd-none">Nothing filed matches “{find.trim()}”.</p>}

      {shown.map((m, mi) => {
        const isOpen = !!q || open.has(m.key);
        const quoted = m.jobs.reduce((s, j) => s + (j.amount ?? 0), 0);
        const meta = m.jobs.length ? [`${m.jobs.length} job${m.jobs.length === 1 ? "" : "s"}`, quoted ? `${money(quoted)} quoted` : ""].filter(Boolean).join(" · ") : "Nothing yet";
        return (
          <section key={m.key} className={`fd-month${isOpen ? " fd-open" : ""}`}>
            <button type="button" className="fd-month-head" aria-expanded={isOpen} onClick={() => toggle(m.key)} disabled={!!q || !m.jobs.length}>
              <h2>{monthName(m.key)} <small>{m.key.slice(0, 4)}</small></h2>
              <span className="fd-month-meta">{meta}</span>
              {m.jobs.length > 0 && !q && (
                <svg className="fd-chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              )}
            </button>
            {isOpen && m.jobs.length === 0 && mi === 0 && <p className="fd-none">Jobs land here as they’re finished.</p>}
            {isOpen && m.jobs.length > 0 && (
              <ul className="fd-rows">
                {m.jobs.map((job) => (
                  <li key={job.id}>
                    <button type="button" className={`fd-row${fileId === job.id ? " fd-current" : ""}`} onClick={() => setFileId(job.id)} aria-label={`Open the file for ${job.title}`}>
                      <span className="fd-tabno">{job.id}</span>
                      <span className="fd-main">
                        <b>{job.title}</b>
                        <span>{[job.biz, formatDate(job.finished)].filter(Boolean).join(" · ")}</span>
                      </span>
                      {job.invoice && <span className={`fd-stamp${job.invoice === "Paid" ? " fd-stamp-paid" : ""}`}>{job.invoice}</span>}
                      {job.cover ? <img className="fd-cover-thumb" src={job.cover} alt="" loading="lazy" /> : null}
                      <svg className="fd-go" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

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

// The job's file, opened from its row: a folder with its papers inside.
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
