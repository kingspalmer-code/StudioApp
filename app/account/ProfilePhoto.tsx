"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Your profile picture, shown at the top right. The photo is cropped to a square and shrunk in the
// browser before it's uploaded, so even a big phone photo uploads quickly.
async function squareJpeg(file: File, size = 320): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("blank"))), "image/jpeg", 0.88));
}

export default function ProfilePhoto({ avatar, initials }: { avatar: string | null; initials: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  async function save(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setMsg({ text: "Choose a photo.", bad: true });
    setBusy(true);
    setMsg(null);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Sign in again, then try that.");
      const path = `${data.user.id}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from("avatars").upload(path, await squareJpeg(file), { contentType: "image/jpeg" });
      if (error) throw error;
      const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      const { error: e2 } = await supabase.auth.updateUser({ data: { avatar_url: url, avatar_path: path } });
      if (e2) throw e2;
      const old = data.user.user_metadata?.avatar_path;
      if (typeof old === "string" && old) await supabase.storage.from("avatars").remove([old]);
      await supabase.auth.refreshSession();
      setMsg({ text: "Photo saved." });
      router.refresh();
    } catch (e) {
      setMsg({ text: `That photo didn't save. ${(e as Error).message || "Try another one."}`, bad: true });
    }
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    const old = data.user?.user_metadata?.avatar_path;
    await supabase.auth.updateUser({ data: { avatar_url: null, avatar_path: null } });
    if (typeof old === "string" && old) await supabase.storage.from("avatars").remove([old]);
    await supabase.auth.refreshSession();
    setMsg(null);
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      <div className="group">
        <div className="row photo-row">
          <span className="photo-big">{avatar ? <img src={avatar} alt="Your photo" /> : initials}</span>
          <div className="ctl">
            <label className="btn plain small file-btn">
              {busy ? "Saving…" : avatar ? "Change photo" : "Add photo"}
              <input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => save(e.target.files?.[0])} />
            </label>
            {avatar && !busy && (
              <button type="button" className="link" style={{ marginLeft: 14, color: "var(--red)", fontWeight: 500 }} onClick={remove}>Remove</button>
            )}
            <div className="when" style={{ marginTop: 6 }}>Shows at the top right. A square photo works best.</div>
          </div>
        </div>
      </div>
      {msg && <p className={msg.bad ? "error" : "foot"}>{msg.text}</p>}
    </>
  );
}
