"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { quickAddToDo } from "@/app/calendar/actions";
import type { PlanItem } from "@/lib/plan";
import { flashSaved } from "./Saved";

// Where Tell Oatcake keeps what's been typed (app/calendar/BrainDump.tsx), so text started here
// carries over when it opens.
const DRAFT_KEY = "oatcake-tell-draft";

// Get it out of your head: one box, no sorting. Enter puts it on your To-do (with a day if you
// said one, like "call printer friday"); Tell Oatcake takes the whole lot, however messy, and
// sorts it into to-dos, calendar days and routines for you to check. On Today and in the + sheet.
export default function Capture({ brain, onAdded, autoFocus = false, placeholder = "What's on your mind?" }: { brain: boolean; onAdded?: (item: PlanItem) => void; autoFocus?: boolean; placeholder?: string }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  function add() {
    const title = text.trim();
    if (!title) return;
    setError("");
    start(async () => {
      const fd = new FormData();
      fd.set("title", title);
      const r = await quickAddToDo(fd);
      if (r.error || !r.item) return setError(r.error ?? "That didn't save. Try again.");
      setText("");
      flashSaved("On your To-do");
      onAdded?.(r.item);
    });
  }

  function tell() {
    try {
      const old = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
      const before = old && typeof old.text === "string" && old.text.trim() ? old.text.trim() + "\n" : "";
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ text: before + text.trim(), rows: null, weekly: [], changes: [] }));
    } catch {}
    router.push("/calendar?dump=1");
  }

  return (
    <div className="capture">
      <form className="capture-row" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label="Jot something down"
          autoComplete="off"
          maxLength={300}
          autoFocus={autoFocus}
        />
        <button type="submit" className="btn" disabled={pending || !text.trim()}>{pending ? "Adding…" : "Add"}</button>
      </form>
      {error && <p className="capture-error" role="alert">{error}</p>}
      <p className="capture-foot">
        Say when if you like, such as &ldquo;call printer friday&rdquo;.
        {brain && (
          <>
            {" "}Lots on your mind?{" "}
            <button type="button" className="link" onClick={tell}>Tell Oatcake all of it</button>
          </>
        )}
      </p>
    </div>
  );
}
