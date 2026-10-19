"use client";

import { useState } from "react";
import { flashSaved } from "./Saved";

// A settings row that only shows its Save button once something in it has changed, so a long
// list of rows doesn't carry a Save on every line. Saving shows a short note (components/Saved.tsx).
export default function SaveWhenChanged({
  action,
  className,
  saved = "Saved",
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  className?: string;
  saved?: string;
  children: React.ReactNode;
}) {
  const [dirty, setDirty] = useState(false);
  return (
    <form
      className={className}
      onChange={() => setDirty(true)}
      onInput={() => setDirty(true)}
      action={async (fd) => {
        await action(fd);
        setDirty(false);
        flashSaved(saved);
      }}
    >
      {children}
      <button className={`link save-when${dirty ? " on" : ""}`} type="submit" tabIndex={dirty ? 0 : -1} aria-hidden={!dirty}>Save</button>
    </form>
  );
}
