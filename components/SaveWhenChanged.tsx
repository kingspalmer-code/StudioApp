"use client";

import { useState } from "react";

// A settings row that only shows its Save button once something in it has changed, so a long
// list of rows doesn't carry a Save on every line.
export default function SaveWhenChanged({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  className?: string;
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
      }}
    >
      {children}
      <button className={`link save-when${dirty ? " on" : ""}`} type="submit" tabIndex={dirty ? 0 : -1} aria-hidden={!dirty}>Save</button>
    </form>
  );
}
