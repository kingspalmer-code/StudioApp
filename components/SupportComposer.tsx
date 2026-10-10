"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type State = { error?: string } | null;

// Shrinks a screenshot before upload so it's quick on a phone signal.
async function shrink(file: File, max = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("blank"))), "image/jpeg", 0.85));
}

// The message box for help conversations: write, optionally add a screenshot, send.
export default function SupportComposer({
  action,
  placeholder = "Write a message…",
  label = "Send",
  page,
  initial = "",
  autoFocus = false,
}: {
  action: (prev: State, fd: FormData) => Promise<State>;
  placeholder?: string;
  label?: string;
  page?: string;
  initial?: string;
  autoFocus?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [shot, setShot] = useState<{ path: string; preview: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  // Clear the box once a reply has gone.
  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      form.current?.reset();
      setShot(null);
    }
    wasPending.current = pending;
  }, [pending, state]);

  async function attach(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setProblem("Choose an image.");
    setUploading(true);
    setProblem("");
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Sign in again.");
      const blob = await shrink(file);
      const path = `${data.user.id}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from("support").upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      setShot({ path, preview: URL.createObjectURL(blob) });
    } catch (e) {
      setProblem(`That screenshot didn't upload. ${(e as Error).message || ""}`.trim());
    }
    setUploading(false);
  }

  return (
    <form ref={form} action={formAction} className="composer">
      {page != null && <input type="hidden" name="page" value={page} />}
      {shot && <input type="hidden" name="attachment" value={shot.path} />}
      <textarea name="body" rows={4} placeholder={placeholder} defaultValue={initial} aria-label="Message" autoFocus={autoFocus} />
      {shot && (
        <div className="composer-shot">
          <img src={shot.preview} alt="Your screenshot" />
          <button type="button" className="link" onClick={() => setShot(null)}>Remove</button>
        </div>
      )}
      <div className="composer-foot">
        <label className={`link file-btn${uploading ? " busy" : ""}`}>
          {uploading ? "Adding…" : shot ? "Change screenshot" : "Add a screenshot"}
          <input type="file" accept="image/*" hidden disabled={uploading || pending} onChange={(e) => attach(e.target.files?.[0])} />
        </label>
        <button className="btn small" type="submit" disabled={pending || uploading}>{pending ? "Sending…" : label}</button>
      </div>
      {(problem || state?.error) && <p className="error">{problem || state?.error}</p>}
    </form>
  );
}
