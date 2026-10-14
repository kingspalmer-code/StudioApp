"use client";

import { useEffect, useRef, useState } from "react";
import type { BufferGeometry } from "three";
import { FINISHES, LIGHTS, Viewer, measure, parseStl, type Finish, type Lights } from "@/lib/stl-view";

const LOOK_KEY = "oatcake:model-look";

// Remembers the finish and lighting last picked on this computer.
function savedLook(): { finish: Finish; lights: Lights } {
  try {
    const v = JSON.parse(localStorage.getItem(LOOK_KEY) ?? "{}");
    return { finish: v.finish in FINISHES ? v.finish : "clay", lights: v.lights in LIGHTS ? v.lights : "studio" };
  } catch {
    return { finish: "clay", lights: "studio" };
  }
}

const num = (n: number) => (n >= 100 ? Math.round(n).toString() : n.toFixed(1));

// Fetches a model, telling how far along it is when the size is known.
async function download(url: string, onProgress: (pct: number) => void, signal: AbortSignal) {
  const res = await fetch(url, { signal });
  if (!res.ok || !res.body) throw new Error("fetch");
  const total = Number(res.headers.get("content-length")) || 0;
  if (!total) return res.arrayBuffer();
  const reader = res.body.getReader();
  const out = new Uint8Array(total);
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (got + value.length > out.length) return new Blob([out.subarray(0, got), value]).arrayBuffer();
    out.set(value, got);
    got += value.length;
    onProgress(Math.round((got / total) * 100));
  }
  return out.buffer.slice(0, got);
}

// One STL model in 3D: drag to turn it, scroll or pinch to zoom, right-drag or two fingers to move.
export default function ModelViewer({ url, name, downloadUrl }: { url: string; name: string; downloadUrl: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const [look, setLook] = useState(savedLook);
  const [spin, setSpin] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "failed" | "no-3d">("loading");
  const [pct, setPct] = useState(0);
  const [info, setInfo] = useState<ReturnType<typeof measure> | null>(null);
  const [full, setFull] = useState(false);

  // The drawing surface, made once and sized to its box.
  useEffect(() => {
    if (!canvas.current || !stage.current) return;
    let v: Viewer;
    try {
      v = new Viewer(canvas.current);
    } catch {
      setState("no-3d");
      return;
    }
    viewer.current = v;
    const box = stage.current;
    const fit = () => v.resize(box.clientWidth, box.clientHeight);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    v.start();
    return () => {
      ro.disconnect();
      v.dispose();
      viewer.current = null;
    };
  }, []);

  // The model itself, fetched again whenever another one is picked.
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    const ctrl = new AbortController();
    let geometry: BufferGeometry | null = null;
    setState("loading");
    setPct(0);
    setInfo(null);
    download(url, setPct, ctrl.signal)
      .then((data) => {
        geometry = parseStl(data);
        v.setModel(geometry);
        setInfo(measure(geometry));
        setState("ready");
      })
      .catch(() => !ctrl.signal.aborted && setState("failed"));
    return () => {
      ctrl.abort();
      geometry?.dispose();
    };
  }, [url]);

  useEffect(() => {
    viewer.current?.setFinish(look.finish);
    viewer.current?.setLights(look.lights);
    try {
      localStorage.setItem(LOOK_KEY, JSON.stringify(look));
    } catch {}
  }, [look]);
  useEffect(() => viewer.current?.setSpin(spin), [spin]);

  // Full screen where the browser allows it (not iPhone Safari), otherwise fills the window.
  useEffect(() => {
    const done = () => !document.fullscreenElement && setFull(false);
    document.addEventListener("fullscreenchange", done);
    return () => document.removeEventListener("fullscreenchange", done);
  }, []);
  useEffect(() => {
    if (!full) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [full]);
  function toggleFull() {
    const el = stage.current?.parentElement;
    if (full) {
      if (document.fullscreenElement) void document.exitFullscreen();
      setFull(false);
    } else {
      setFull(true);
      el?.requestFullscreen?.().catch(() => {});
    }
  }

  return (
    <div className={`mv${full ? " mv-full" : ""}`}>
      <div ref={stage} className="mv-stage">
        <canvas ref={canvas} aria-label={`3D view of ${name}`} />
        {state !== "ready" && (
          <span className="mv-wait when">
            {state === "loading"
              ? `Loading the model…${pct ? ` ${pct}%` : ""}`
              : state === "failed"
                ? "This model didn't load. It may not be an STL file, or try refreshing."
                : "This browser can't show 3D. You can still download the model."}
          </span>
        )}
        {state === "ready" && <span className="mv-hint">Drag to turn · scroll or pinch to zoom · right-drag or two fingers to move</span>}
        <span className="mv-corner">
          <button type="button" className="mv-icon" onClick={() => viewer.current?.reset()} aria-label="Reset the view" title="Reset the view">
            <svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
          </button>
          <button type="button" className="mv-icon" onClick={toggleFull} aria-label={full ? "Leave full screen" : "Full screen"} title={full ? "Leave full screen" : "Full screen"}>
            {full ? (
              <svg viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>
            ) : (
              <svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
            )}
          </button>
        </span>
      </div>
      <div className="mv-bar">
        <div className="mv-chips" role="group" aria-label="Finish">
          {(Object.keys(FINISHES) as Finish[]).map((k) => (
            <button key={k} type="button" aria-pressed={look.finish === k} onClick={() => setLook((l) => ({ ...l, finish: k }))}>
              <span className={`mv-swatch mv-${k}`} style={{ background: FINISHES[k].color }} />
              {FINISHES[k].label}
            </button>
          ))}
        </div>
        <div className="mv-chips" role="group" aria-label="Lighting">
          {(Object.keys(LIGHTS) as Lights[]).map((k) => (
            <button key={k} type="button" aria-pressed={look.lights === k} onClick={() => setLook((l) => ({ ...l, lights: k }))}>
              {LIGHTS[k].label}
            </button>
          ))}
          <button type="button" aria-pressed={spin} onClick={() => setSpin((s) => !s)}>Spin</button>
        </div>
        <div className="mv-foot">
          <span className="when">
            {info ? `${num(info.w)} × ${num(info.d)} × ${num(info.h)} mm · ${info.triangles.toLocaleString("en-GB")} triangles` : " "}
          </span>
          {downloadUrl && <a className="btn small" href={downloadUrl}>Download STL</a>}
        </div>
      </div>
    </div>
  );
}
