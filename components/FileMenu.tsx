"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { emailFile, saveLink, shareLink } from "@/app/files/actions";
import { flashSaved } from "./Saved";

// The menu for a file on a job: right-click on a computer, press and hold on a phone, or the ⋯
// button. It opens, saves, copies, shares and emails the file. Glass like the other floating menus
// (.ctx-menu in globals.css); on a phone it comes up from the bottom as a sheet.

export type MenuFile = {
  name: string;
  bucket: "deliveries" | "inspiration";
  // Stored in Oatcake (path), or a link to somewhere else (url).
  path: string | null;
  url: string | null;
  view: string | null;
  download: string | null;
  image?: boolean;
};

type Spot = { x: number; y: number };
const Ctx = createContext<(at: Spot) => void>(() => {});

const HOLD_MS = 450;

const I = {
  open: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  down: <><path d="M12 4v11M7 10l5 5 5-5" /><path d="M5 20h14" /></>,
  saveAs: <><path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4Z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  share: <><path d="M12 3v12M8 7l4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
  name: <><path d="M4 7V5h16v2M9 19h6M12 5v14" /></>,
  bin: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" /></>,
};
const Icon = ({ d }: { d: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

// Copying waits on the file or the link, but Safari only lets a page copy straight after a click,
// so the clipboard is handed the promise at once and fills when it's ready.
async function copy(type: string, data: Promise<Blob>) {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ [type]: data })]);
      return true;
    } catch {}
  }
  if (type !== "text/plain" || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(await (await data).text());
    return true;
  } catch {
    return false;
  }
}

// The clipboard only takes pictures as PNG, so other kinds are redrawn as one.
async function asPng(src: string): Promise<Blob> {
  const blob = await (await fetch(src)).blob();
  if (blob.type === "image/png") return blob;
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0);
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("no png"))), "image/png"));
}

function save(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Wraps one file. Right-click (or Ctrl-click on a Mac) anywhere on it opens the menu at the
// pointer; holding a finger on it opens the sheet. canEmail is the studio, which sends from its
// own address; everyone else's Email opens their mail app with a link. onRemove adds Remove.
export default function FileMenu({
  file,
  ticketId,
  canEmail = false,
  onRemove,
  className,
  children,
}: {
  file: MenuFile;
  ticketId: number;
  canEmail?: boolean;
  onRemove?: () => void | Promise<void>;
  className?: string;
  children: React.ReactNode;
}) {
  const [at, setAt] = useState<Spot | null>(null);
  const hold = useRef<{ t: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const held = useRef(false);

  const open = useCallback((spot: Spot) => setAt(spot), []);
  const cancelHold = () => {
    if (hold.current) clearTimeout(hold.current.t);
    hold.current = null;
  };

  return (
    <Ctx.Provider value={open}>
      <div
        className={`${className ?? "file-target"}${at ? " menu-open" : ""}`}
        onContextMenu={(e) => {
          e.preventDefault();
          cancelHold();
          open({ x: e.clientX, y: e.clientY });
        }}
        onPointerDown={(e) => {
          held.current = false;
          if (e.pointerType === "mouse") return;
          cancelHold();
          const { clientX: x, clientY: y } = e;
          hold.current = {
            x,
            y,
            t: setTimeout(() => {
              hold.current = null;
              held.current = true;
              navigator.vibrate?.(8);
              open({ x, y });
            }, HOLD_MS),
          };
        }}
        onPointerMove={(e) => {
          if (hold.current && Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > 8) cancelHold();
        }}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
        // The finger lifting after a hold would otherwise open the file too.
        onClickCapture={(e) => {
          if (!held.current) return;
          held.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {children}
      </div>
      {at && <Menu file={file} ticketId={ticketId} canEmail={canEmail} onRemove={onRemove} at={at} onClose={() => setAt(null)} />}
    </Ctx.Provider>
  );
}

// The ⋯ button, for anyone who doesn't think to right-click. Sits anywhere inside a FileMenu.
export function FileMenuButton() {
  const open = useContext(Ctx);
  return (
    <button
      type="button"
      className="btn plain small file-more"
      aria-label="More options"
      aria-haspopup="menu"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        open({ x: r.left, y: r.bottom + 4 });
      }}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
    </button>
  );
}

function Menu({
  file,
  ticketId,
  canEmail,
  onRemove,
  at,
  onClose,
}: {
  file: MenuFile;
  ticketId: number;
  canEmail: boolean;
  onRemove?: () => void | Promise<void>;
  at: Spot;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [wide] = useState(() => matchMedia("(min-width: 701px)").matches);
  const [pos, setPos] = useState(at);
  const [step, setStep] = useState<"menu" | "email" | "remove">("menu");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  // A link that lasts a week, asked for as the menu opens so Share and Email have it straight away.
  const link = useRef<Promise<string | null> | null>(null);
  const [ready, setReady] = useState<string | null>(file.path ? null : file.url);
  useEffect(() => {
    if (!file.path) return;
    link.current = shareLink(file.bucket, file.path).then((r) => r.url ?? null).catch(() => null);
    link.current.then(setReady);
  }, [file.bucket, file.path]);
  const getLink = () => (file.path ? link.current ?? Promise.resolve(null) : Promise.resolve(file.url));

  const canSaveAs = Boolean(file.path && file.view) && typeof window !== "undefined" && "showSaveFilePicker" in window;
  const canCopyImage = Boolean(file.image && file.view) && typeof ClipboardItem !== "undefined" && Boolean(navigator.clipboard?.write);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  // Kept on screen when opened near an edge.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !wide) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({ x: Math.max(8, Math.min(at.x, innerWidth - width - 8)), y: Math.max(8, Math.min(at.y, innerHeight - height - 8)) });
  }, [at, wide, step]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
      if (!items.length) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
    };
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const scrolled = (e: Event) => {
      if (wide && !ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("scroll", scrolled, true);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("scroll", scrolled, true);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose, wide]);

  useEffect(() => {
    if (step === "menu") ref.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus({ preventScroll: true });
  }, [step]);

  function done(text: string) {
    onClose();
    flashSaved(text);
  }

  async function saveAs() {
    try {
      const ext = /\.[a-z0-9]{1,5}$/i.exec(file.name)?.[0];
      const pick = await (window as unknown as { showSaveFilePicker: (o: object) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
        suggestedName: file.name,
        ...(ext ? { types: [{ description: ext.slice(1).toUpperCase(), accept: { "application/octet-stream": [ext] } }] } : {}),
      });
      onClose();
      const blob = await (await fetch(file.view!)).blob();
      const w = await pick.createWritable();
      await w.write(blob);
      await w.close();
      flashSaved(`Saved ${file.name}`);
    } catch (e) {
      if ((e as Error).name !== "AbortError") flashSaved("That didn't save. Try Save to Downloads.");
    }
  }

  async function toDownloads() {
    done(`Saving ${file.name} to Downloads`);
    const href = file.download ?? (await saveLink(file.bucket, file.path!, file.name).catch(() => null));
    if (href) save(href, file.name);
    else flashSaved("Couldn't save that file. Try again.");
  }

  async function copyImage() {
    onClose();
    const ok = await copy("image/png", asPng(file.view!));
    flashSaved(ok ? "Picture copied" : "Couldn't copy that picture");
  }

  async function copyLink() {
    onClose();
    const ok = await copy("text/plain", getLink().then((u) => {
      if (!u) throw new Error("no link");
      return new Blob([u], { type: "text/plain" });
    }));
    flashSaved(ok ? (file.path ? "Link copied · works for 7 days" : "Link copied") : "Couldn't copy the link");
  }

  async function share() {
    const url = ready ?? (await getLink());
    onClose();
    if (!url) return flashSaved("Couldn't make a link to share");
    try {
      await navigator.share({ title: file.name, url });
    } catch {}
  }

  function mailApp() {
    onClose();
    const go = (u: string | null) => {
      if (!u) return flashSaved("Couldn't make a link to send");
      location.href = `mailto:?subject=${encodeURIComponent(file.name)}&body=${encodeURIComponent(`${file.name}\n${u}`)}`;
    };
    if (ready) go(ready);
    else getLink().then(go);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem("");
    const res = await emailFile({ bucket: file.bucket, path: file.path, url: file.url, name: file.name, ticketId, to, message: note });
    setBusy(false);
    if (res.error) return setProblem(res.error);
    done(res.note ? `Sent to ${to}. ${res.note}` : `Sent to ${to}`);
  }

  async function remove() {
    setBusy(true);
    await onRemove?.();
    onClose();
  }

  const item = (icon: React.ReactNode, label: string, run: () => void, danger = false) => (
    <button type="button" role="menuitem" className={danger ? "danger" : undefined} onClick={run}>
      <Icon d={icon} />
      {label}
    </button>
  );

  const body =
    step === "email" ? (
      <form className="file-mail" onSubmit={send}>
        <b>Email {file.name}</b>
        <input type="email" required autoFocus placeholder="Their email address" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        <textarea rows={3} placeholder="Add a message (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Message" />
        <span className="when">{file.path ? "Attached if it's under 15MB, otherwise sent as a link. Replies come back to you." : "Sent as a link. Replies come back to you."}</span>
        {problem && <span className="error">{problem}</span>}
        <div className="file-mail-foot">
          <button type="button" className="link" onClick={() => setStep("menu")}>Back</button>
          <button type="submit" className="btn small" disabled={busy}>{busy ? "Sending…" : "Send"}</button>
        </div>
      </form>
    ) : step === "remove" ? (
      <div className="file-mail">
        <b>Remove {file.name}?</b>
        <span className="when">It comes off the job for everyone.</span>
        <div className="file-mail-foot">
          <button type="button" className="link" onClick={() => setStep("menu")}>Cancel</button>
          <button type="button" className="btn danger small" autoFocus disabled={busy} onClick={remove}>Remove</button>
        </div>
      </div>
    ) : (
      <>
        {!wide && <div className="file-menu-title">{file.name}</div>}
        {file.view && item(I.open, file.path ? "Open" : "Open link", () => { onClose(); window.open(file.view!, "_blank", "noopener"); })}
        {file.path && item(I.down, "Save to Downloads", toDownloads)}
        {canSaveAs && item(I.saveAs, "Save as…", saveAs)}
        <hr />
        {canCopyImage && item(I.copy, "Copy picture", copyImage)}
        {item(I.link, "Copy link", copyLink)}
        {canShare && item(I.share, "Share…", share)}
        {item(I.mail, "Share via email…", canEmail ? () => setStep("email") : mailApp)}
        {navigator.clipboard?.writeText && item(I.name, "Copy file name", () => { navigator.clipboard.writeText(file.name).then(() => done("File name copied"), () => onClose()); })}
        {onRemove && <><hr />{item(I.bin, "Remove", () => setStep("remove"), true)}</>}
      </>
    );

  return createPortal(
    <>
      {!wide && <div className="file-menu-backdrop" onClick={onClose} />}
      <div
        ref={ref}
        className={`ctx-menu file-menu${wide ? "" : " sheet-like"}${step !== "menu" ? " is-form" : ""}`}
        role={step === "menu" ? "menu" : "dialog"}
        aria-label={file.name}
        style={wide ? { left: pos.x, top: pos.y } : undefined}
        onContextMenu={(e) => e.preventDefault()}
      >
        {body}
      </div>
    </>,
    document.body
  );
}
