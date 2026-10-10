"use client";

import { useState } from "react";
import { deleteTicket } from "@/app/actions";

export default function DeleteTicket({ id, noun = "request" }: { id: number; noun?: string }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming)
    return (
      <button className="btn danger small" type="button" onClick={() => setConfirming(true)}>
        Delete {noun}
      </button>
    );
  return (
    <form action={deleteTicket.bind(null, id)} style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span style={{ fontSize: 13, color: "var(--label-2)" }}>Delete this {noun} and its files?</span>
      <button className="btn danger small" type="submit">Delete</button>
      <button className="btn plain small" type="button" onClick={() => setConfirming(false)}>Cancel</button>
    </form>
  );
}
