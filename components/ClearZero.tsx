"use client";

import { useEffect } from "react";

// Number boxes start at 0. Tapping one you haven't typed in yet empties it, so you can type your own
// number straight away instead of deleting the 0 first. Leave it without typing and the 0 comes back.
// Covers every number box in the app; NumberInput handles its own the same way (data-own-zero).
const isNumberBox = (el: EventTarget | null): el is HTMLInputElement =>
  el instanceof HTMLInputElement &&
  (el.type === "number" || el.inputMode === "decimal" || el.inputMode === "numeric") &&
  !el.readOnly &&
  !el.disabled &&
  !("ownZero" in el.dataset);

export default function ClearZero() {
  useEffect(() => {
    const typedIn = new WeakSet<HTMLInputElement>();
    const emptied = new WeakSet<HTMLInputElement>();
    const onFocus = (e: FocusEvent) => {
      const el = e.target;
      if (!isNumberBox(el) || typedIn.has(el) || el.value.trim() === "" || Number(el.value) !== 0) return;
      emptied.add(el);
      el.dataset.zero = el.value;
      el.value = "";
    };
    const onInput = (e: Event) => {
      if (!isNumberBox(e.target)) return;
      typedIn.add(e.target);
      emptied.delete(e.target);
    };
    const onBlur = (e: FocusEvent) => {
      const el = e.target;
      if (!isNumberBox(el) || !emptied.has(el)) return;
      emptied.delete(el);
      if (el.value === "") el.value = el.dataset.zero ?? "0";
    };
    document.addEventListener("focusin", onFocus);
    document.addEventListener("input", onInput);
    document.addEventListener("focusout", onBlur);
    return () => {
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("input", onInput);
      document.removeEventListener("focusout", onBlur);
    };
  }, []);
  return null;
}
