"use client";

import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useState } from "react";
import { helpWithBrief, type BriefHelp } from "./actions";

const pinterest = (q: string) => `https://www.pinterest.co.uk/search/pins/?q=${encodeURIComponent(q)}`;

// "Help me write the brief": for people who know roughly what they want but not how to say it,
// or what to show as references. Fills in the brief, lists what's worth adding, and suggests
// styles to look at, each with a Pinterest search to find images they like.
export default function BriefHelper({
  type,
  readIdea,
  applyBrief,
  canAddImages = true,
}: {
  type: string;
  canAddImages?: boolean;
  readIdea: () => string;
  applyBrief: ((text: string) => void) | null;
}) {
  const [open, setOpen] = useState(false);
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [help, setHelp] = useState<BriefHelp | null>(null);
  const [used, setUsed] = useState(false);

  async function run() {
    setBusy(true);
    setError("");
    const res = await helpWithBrief(idea, type);
    setBusy(false);
    if (res.error) return setError(res.error);
    setHelp(res.help ?? null);
    setUsed(false);
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="brief-help">
        {!open ? (
          <button
            type="button"
            className="brief-help-open"
            onClick={() => {
              setIdea(readIdea());
              setOpen(true);
            }}
          >
            <span aria-hidden="true">✨</span>
            <span>
              <b>Not sure what to ask for?</b>
              <small>Oatcake can help you write the brief and find references.</small>
            </span>
          </button>
        ) : (
          <motion.div className="brief-help-card" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 30 }}>
            <div className="brief-help-head">
              <b>Help with the brief</b>
              <button type="button" className="link" onClick={() => setOpen(false)}>Close</button>
            </div>
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              rows={3}
              placeholder="In a sentence or two, what do you need? e.g. A poster for our Halloween film night, vintage 1970s horror feel"
              aria-label="What you need"
            />
            <div className="brief-help-actions">
              <button type="button" className="btn small" disabled={busy || idea.trim().length < 4} onClick={run}>
                {busy ? "Thinking…" : help ? "Try again" : "Help me"}
              </button>
            </div>
            {error && <p className="error">{error}</p>}
            <AnimatePresence>
              {help && (
                <motion.div key="help" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 260, damping: 28 }}>
                  <p className="brief-help-label">Your brief</p>
                  <div className="brief-help-brief">{help.brief}</div>
                  {applyBrief ? (
                    <button
                      type="button"
                      className="btn plain small"
                      onClick={() => {
                        applyBrief(help.brief);
                        setUsed(true);
                      }}
                    >
                      {used ? "Added to the request ✓" : "Use this brief"}
                    </button>
                  ) : (
                    <button type="button" className="btn plain small" onClick={() => navigator.clipboard.writeText(help.brief).then(() => setUsed(true))}>
                      {used ? "Copied ✓" : "Copy"}
                    </button>
                  )}

                  {help.questions.length > 0 && (
                    <>
                      <p className="brief-help-label">Worth adding</p>
                      <ul className="brief-help-qs">{help.questions.map((q) => <li key={q}>{q}</li>)}</ul>
                    </>
                  )}

                  {help.styles.length > 0 && (
                    <>
                      <p className="brief-help-label">Styles to look at</p>
                      <div className="brief-styles">
                        {help.styles.map((s) => (
                          <div key={s.name} className="brief-style">
                            <b>{s.name}</b>
                            <span>{s.look}</span>
                            <a href={pinterest(s.search)} target="_blank" rel="noreferrer">Find examples on Pinterest ↗</a>
                          </div>
                        ))}
                      </div>
                      <p className="brief-help-tip">
                        {canAddImages
                          ? "See something you like? Save or screenshot it, then add it under the files below. On a computer you can copy an image and paste it straight into this form."
                          : "See something you like? Copy its link into your request so the designer can see it."}
                      </p>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </MotionConfig>
  );
}
