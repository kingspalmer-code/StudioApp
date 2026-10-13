"use client";

import { useTransition } from "react";
import ConfirmButton from "@/components/ConfirmButton";
import { approveDraft } from "@/app/actions";

// The client's way of saying a draft's good to go. The studio hears about it straight away.
export default function ApproveDraft({ ticketId, draftId, round, owner }: { ticketId: number; draftId: number; round: number; owner: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="draft-actions">
      <ConfirmButton
        label={pending ? "Approving…" : `Approve draft ${round}`}
        className="btn small approve-btn"
        yesClassName="btn small"
        ask={`Tell ${owner} draft ${round} is good to go?`}
        yes="Approve"
        disabled={pending}
        onConfirm={() => start(() => approveDraft(ticketId, draftId))}
      />
    </div>
  );
}
