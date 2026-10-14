"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { fileSize } from "@/lib/deliveries";

// three.js only loads once there's a model to show.
const ModelViewer = dynamic(() => import("./ModelViewer"), {
  ssr: false,
  loading: () => <div className="mv"><div className="mv-stage"><span className="mv-wait when">Loading the viewer…</span></div></div>,
});

type Opened = { id: string; name: string; url: string; size: number };

// The models opened in this visit, each read straight from the file picked or dropped. Several can be
// open at once; tap one to show it.
export default function Viewer3D() {
  const [files, setFiles] = useState<Opened[]>([]);
  const [pick, setPick] = useState("");
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState("");
  const kept = useRef<Opened[]>([]);
  kept.current = files;
  useEffect(() => () => kept.current.forEach((f) => URL.revokeObjectURL(f.url)), []);
  const current = files.find((f) => f.id === pick) ?? files[0];

  function open(list: FileList | File[] | null) {
    const all = [...(list ?? [])];
    const stl = all.filter((f) => /\.stl$/i.test(f.name));
    setProblem(stl.length < all.length ? "Only STL files can be opened here." : "");
    if (!stl.length) return;
    const added = stl.map((f) => ({ id: crypto.randomUUID(), name: f.name.replace(/\.stl$/i, ""), url: URL.createObjectURL(f), size: f.size }));
    setFiles((fs) => [...fs, ...added]);
    setPick(added[0].id);
  }

  function close(id: string) {
    const f = files.find((x) => x.id === id);
    if (f) URL.revokeObjectURL(f.url);
    setFiles((fs) => fs.filter((x) => x.id !== id));
  }

  const picker = (label: string, plain?: boolean) => (
    <label className={`btn file-btn${plain ? " plain small" : ""}`}>
      {label}
      <input type="file" accept=".stl,model/stl" multiple hidden onChange={(e) => { open(e.target.files); e.target.value = ""; }} />
    </label>
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={(e) => e.currentTarget === e.target && setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); open(e.dataTransfer.files); }}
    >
      {current ? (
        <ModelViewer key={current.id} url={current.url} name={current.name} downloadUrl="" />
      ) : (
        <div className="mv">
          <div className={`mv-stage${over ? " drop" : ""}`}>
            <span className="mv-wait mv-open">
              {picker("Open an STL file")}
              <span className="when">or drop one here</span>
            </span>
          </div>
        </div>
      )}
      {problem && <p className="error">{problem}</p>}
      {files.length > 0 && (
        <div className="mv-files mv-chips">
          {files.map((f) => (
            <button key={f.id} type="button" aria-pressed={f.id === current?.id} onClick={() => setPick(f.id)} title={fileSize(f.size)}>
              {f.name}
              <span
                role="button"
                tabIndex={0}
                aria-label={`Close ${f.name}`}
                onClick={(e) => { e.stopPropagation(); close(f.id); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); close(f.id); } }}
              >
                ×
              </span>
            </button>
          ))}
          {picker("Open more", true)}
        </div>
      )}
    </div>
  );
}
