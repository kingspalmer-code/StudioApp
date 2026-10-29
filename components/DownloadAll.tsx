"use client";

import { useState } from "react";
import { makeZip, uniqueNames } from "@/lib/zip";

// "Download all" for a job's files: fetches each one with the link the page already signed and
// saves them as one zip named after the job, each file keeping its own name. Done in the browser,
// so nothing extra runs on the server and each file is downloaded once, as it would be one by one.
// Shows only when there are two or more stored files (links to elsewhere can't go in a zip).
export default function DownloadAll({ name, files }: { name: string; files: { name: string; href: string | null }[] }) {
  const stored = files.filter((f): f is { name: string; href: string } => Boolean(f.href));
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");
  if (stored.length < 2) return null;

  async function go() {
    setProblem("");
    const names = uniqueNames(stored.map((f) => f.name));
    const missed: string[] = [];
    let done = 0;
    setBusy(`Getting 0 of ${stored.length}…`);
    // A few at a time, so a big job doesn't open dozens of downloads at once.
    const queue = stored.map((f, i) => ({ ...f, as: names[i], i }));
    const slots: { name: string; data: Uint8Array }[] = [];
    await Promise.all(
      Array.from({ length: Math.min(4, queue.length) }, async () => {
        for (let f = queue.shift(); f; f = queue.shift()) {
          try {
            const res = await fetch(f.href);
            if (!res.ok) throw new Error(String(res.status));
            slots[f.i] = { name: f.as, data: new Uint8Array(await res.arrayBuffer()) };
          } catch {
            missed.push(f.name);
          }
          setBusy(`Getting ${++done} of ${stored.length}…`);
        }
      })
    );
    const got = slots.filter(Boolean);
    if (!got.length) {
      setBusy("");
      return setProblem("Couldn't get the files. Refresh the page and try again.");
    }
    setBusy("Zipping…");
    const url = URL.createObjectURL(makeZip(got));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Files").slice(0, 80)}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setBusy("");
    if (missed.length) setProblem(`${missed.join(", ")} couldn't be added. Download ${missed.length > 1 ? "them" : "it"} on ${missed.length > 1 ? "their" : "its"} own.`);
  }

  return (
    <span className="download-all">
      <button type="button" className="link" onClick={go} disabled={Boolean(busy)}>
        {busy || `Download all (${stored.length})`}
      </button>
      {problem && <span className="error">{problem}</span>}
    </span>
  );
}
