"use client";

import { useEffect, useRef, useState } from "react";

// A file picker that adds to what's already picked instead of replacing it, with a way to take
// one back out. The picks live on the real input, so forms read them as usual.
export default function FilesInput({ id, name = "files", required, accept }: { id: string; name?: string; required?: boolean; accept?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);

  const keep = (list: File[]) => {
    const dt = new DataTransfer();
    list.forEach((f) => dt.items.add(f));
    if (ref.current) ref.current.files = dt.files;
    setFiles(list);
  };

  // A form reset (after sending) clears the input; clear the list with it.
  useEffect(() => {
    const form = ref.current?.form;
    const clear = () => setFiles([]);
    form?.addEventListener("reset", clear);
    return () => form?.removeEventListener("reset", clear);
  }, []);

  return (
    <>
      <input
        ref={ref}
        id={id}
        name={name}
        type="file"
        multiple
        required={required && !files.length}
        accept={accept}
        onChange={(e) => {
          const added = Array.from(e.target.files ?? []).filter((a) => !files.some((f) => f.name === a.name && f.size === a.size && f.lastModified === a.lastModified));
          keep([...files, ...added]);
        }}
      />
      {files.length > 0 && (
        <ul className="file-picks">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}-${f.lastModified}`}>
              <span>{f.name}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => keep(files.filter((_, j) => j !== i))}>×</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
