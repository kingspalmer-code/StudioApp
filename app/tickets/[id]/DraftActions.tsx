"use client";

import { useState, useTransition } from "react";
import ConfirmButton from "@/components/ConfirmButton";
import { removeDraft, sendDraftAsFinal } from "./actions";

// The studio's buttons on a draft: send it as the final files, or take it down.
export default function DraftActions({ ticketId, draftId, round, finalLabel, noun }: { ticketId: number; draftId: number; round: number; finalLabel: string; noun: string }) {
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState("");
  const run = (act: () => Promise<string | undefined>) => {
    setProblem("");
    start(async () => setProblem((await act()) ?? ""));
  };
  return (
    <>
      <div className="draft-actions">
        <ConfirmButton
          label={pending ? "Working…" : "Remove"}
          ask={`Remove draft ${round}? Its files and notes go too.`}
          yes="Remove"
          disabled={pending}
          onConfirm={() => run(() => removeDraft(ticketId, draftId))}
        />
        {finalLabel && (
          <ConfirmButton
            label={pending ? "Sending…" : "Send as final"}
            className="btn small"
            yesClassName="btn small"
            ask={`Its files go in Finished files, where they show in the gallery, and the ${noun} moves to ${finalLabel}.`}
            yes="Send as final"
            disabled={pending}
            onConfirm={() => run(() => sendDraftAsFinal(ticketId, draftId))}
          />
        )}
      </div>
      {problem && <p className="error">{problem}</p>}
    </>
  );
}
