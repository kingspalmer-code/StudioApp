"use client";

import { useState, type ReactNode } from "react";

// A button that asks "are you sure?" inline before it acts. The browser's own confirm() box does
// nothing in the Mac app (its window can't show one), so anything that needs checking uses this.
export default function ConfirmButton({
  label,
  ask,
  yes,
  onConfirm,
  className = "link deliv-remove",
  yesClassName = "btn danger small",
  disabled,
}: {
  label: ReactNode;
  ask: string;
  yes: string;
  onConfirm: () => void;
  className?: string;
  yesClassName?: string;
  disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return <button type="button" className={className} disabled={disabled} onClick={() => setAsking(true)}>{label}</button>;
  return (
    <span className="confirm-inline">
      <span className="when">{ask}</span>
      <button type="button" className="btn plain small" onClick={() => setAsking(false)}>Cancel</button>
      <button type="button" className={yesClassName} disabled={disabled} onClick={() => { setAsking(false); onConfirm(); }}>{yes}</button>
    </span>
  );
}
