"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Ask Oatcake: one small button in the top bar that opens a sheet for questions about your work,
// or how to do something. Nothing else on the page changes; "/" or ⌘K opens it on a keyboard.
type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = ["What should I start today?", "What's due this week?", "Who still owes me money?", "How do I change my invoice style?"];

// Just enough formatting for short answers: paragraphs, "- " lists, **bold** and links to Oatcake pages.
function inline(text: string, onNav: () => void): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((\/[^)\s]*)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<b key={m.index}>{m[1]}</b>);
    else out.push(<Link key={m.index} href={m[3]} onClick={onNav}>{m[2]}</Link>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Answer({ text, onNav }: { text: string; onNav: () => void }) {
  const blocks: { list: boolean; lines: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const l = raw.trimEnd();
    const list = /^\s*[-•]\s+/.test(l);
    if (!l.trim()) {
      blocks.push({ list: false, lines: [] });
      continue;
    }
    const prev = blocks[blocks.length - 1];
    const content = list ? l.replace(/^\s*[-•]\s+/, "") : l;
    if (prev && prev.list === list && (list || prev.lines.length)) prev.lines.push(content);
    else blocks.push({ list, lines: [content] });
  }
  return (
    <>
      {blocks
        .filter((b) => b.lines.length)
        .map((b, i) =>
          b.list ? (
            <ul key={i}>{b.lines.map((l, j) => <li key={j}>{inline(l, onNav)}</li>)}</ul>
          ) : (
            <p key={i}>{b.lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l, onNav)}</Fragment>)}</p>
          )
        )}
    </>
  );
}

export default function AskOatcake() {
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMounted(true);
    const m = window.matchMedia("(min-width: 720px)");
    setWide(m.matches);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      m.removeEventListener("change", on);
      window.removeEventListener("keydown", key);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", key);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const history: Turn[] = [...turns, { role: "user", content: question }];
    setTurns([...history, { role: "assistant", content: "" }]);
    setDraft("");
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const write = (text: string) =>
      setTurns((ts) => ts.map((t, i) => (i === ts.length - 1 ? { ...t, content: text } : t)));
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        write(res.headers.get("content-type")?.includes("text/plain") ? await res.text() : "Oatcake couldn't answer that just now. Try again in a moment.");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        write(text);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") write("Oatcake couldn't answer that just now. Try again in a moment.");
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  const close = () => setOpen(false);

  return (
    <>
      <button type="button" className="ask-btn" onClick={() => setOpen(true)} aria-label="Ask Oatcake" data-tour="ask">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5.6" fill="none" stroke="currentColor" strokeWidth="2.6" /></svg>
        <span>Ask</span>
      </button>
      {/* Rendered on the page body: the top bar's blur would otherwise trap the sheet inside it. */}
      {mounted && createPortal(<AnimatePresence>
        {open && (
          <div className="sheet-wrap" key="ask">
            <motion.div className="sheet-backdrop" onClick={close} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
            <motion.div
              className="sheet ask-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Ask Oatcake"
              initial={wide ? { opacity: 0, scale: 0.96, y: 12 } : { y: "100%" }}
              animate={wide ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
              exit={wide ? { opacity: 0, scale: 0.97, y: 8 } : { y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
            >
              <div className="sheet-head">
                <span className="sheet-grabber" aria-hidden="true" />
                <b>Ask Oatcake</b>
                {turns.length > 0 && !busy && (
                  <button type="button" className="link ask-new" onClick={() => setTurns([])}>New</button>
                )}
                <button type="button" className="sheet-close" onClick={close} aria-label="Close">×</button>
              </div>
              <div className="sheet-scroll ask-scroll" ref={scrollRef} aria-live="polite">
                {!turns.length ? (
                  <div className="ask-empty">
                    <p>Ask about your jobs, quotes and customers, or how to do something in Oatcake.</p>
                    <div className="ask-chips">
                      {SUGGESTIONS.map((s, i) => (
                        <motion.button
                          key={s}
                          type="button"
                          onClick={() => ask(s)}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ type: "spring", stiffness: 260, damping: 26, delay: 0.08 + i * 0.04 }}
                        >
                          {s}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                ) : (
                  turns.map((t, i) => (
                    <motion.div
                      key={i}
                      className={`ask-turn ${t.role}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 28 }}
                    >
                      {t.role === "user" ? (
                        t.content
                      ) : t.content ? (
                        <Answer text={t.content} onNav={close} />
                      ) : (
                        <span className="ask-dots" aria-label="Thinking"><i /><i /><i /></span>
                      )}
                    </motion.div>
                  ))
                )}
              </div>
              <form
                className="ask-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(draft);
                }}
              >
                <textarea
                  ref={inputRef}
                  value={draft}
                  rows={1}
                  maxLength={2000}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      ask(draft);
                    }
                  }}
                  placeholder="Ask anything about your work"
                  aria-label="Your question"
                />
                <button type="submit" className="ask-send" disabled={busy || !draft.trim()} aria-label="Send">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>, document.body)}
    </>
  );
}
