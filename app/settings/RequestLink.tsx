"use client";

import { useState, useTransition } from "react";
import { setRequestsOpen } from "./actions";

// Customers workspaces: the switch for the public request link, and the link to share.
export default function RequestLink({ open, url }: { open: boolean; url: string | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <>
      <div className="group">
        <label className="row check-row" htmlFor="requests-open">
          <span>Let customers send you jobs</span>
          <input
            id="requests-open"
            type="checkbox"
            checked={open}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.checked;
              start(async () => {
                setError(null);
                const res = await setRequestsOpen(next);
                if (res.error) setError(res.error);
              });
            }}
          />
        </label>
        {open && url && (
          <div className="row">
            <div className="ctl" style={{ overflowWrap: "anywhere" }}>{url}</div>
            <button
              type="button"
              className="link"
              onClick={() => {
                navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}
