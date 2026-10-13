"use client";

import { useState, useTransition } from "react";
import { removeDraft, sendDraftAsFinal } from "./actions";

// The studio's buttons on a draft: send it as the final files, or take it down.
export default function DraftActions({ ticketId, draftId, round, finalLabel, noun }: { ticketId: number; draftId: number; round: number; finalLabel: string; noun: string }) {
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState("");
  const run = (ask: string, act: () => Promise<string | undefined>) => {
    if (!confirm(ask)) return;
    setProblem("");
    start(async () => setProblem((await act()) ?? ""));
  };
  return (
    <>
      <div className="draft-actions">
        <button type="button" className="link deliv-remove" disabled={pending}
          onClick={() => run(`Remove draft ${round}? Its files and notes go too.`, () => removeDraft(ticketId, draftId))}>
          Remove
        </button>
        {finalLabel && (
          <button type="button" className="btn small" disabled={pending}
            onClick={() => run(`Send draft ${round} as final? Its files go in Finished files, where they show in the gallery, and the ${noun} moves to ${finalLabel}.`, () => sendDraftAsFinal(ticketId, draftId))}>
            {pending ? "Sending…" : "Send as final"}
          </button>
        )}
      </div>
      {problem && <p className="error">{problem}</p>}
    </>
  );
}
