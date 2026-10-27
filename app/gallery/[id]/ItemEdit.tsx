"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmButton from "@/components/ConfirmButton";
import { flashSaved } from "@/components/Saved";
import { removeFromGallery, setGalleryCaption, setGalleryTags } from "../actions";
import TagPicker, { type TagPerson } from "../TagPicker";

// The studio's controls on a picture in the Gallery: who's tagged (saved as soon as a name is
// tapped, and only people newly tagged hear about it), the caption, and taking it out.
export default function ItemEdit({ id, caption, tagged, people, businessId }: { id: number; caption: string; tagged: string[]; people: TagPerson[]; businessId: string }) {
  const router = useRouter();
  const [tags, setTags] = useState(tagged);
  const [text, setText] = useState(caption);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  async function retag(next: string[]) {
    const before = tags;
    setTags(next);
    setBusy(true);
    const r = await setGalleryTags(id, next).catch(() => ({ error: "That didn't save. Check your connection." }));
    setBusy(false);
    if (r.error) {
      setTags(before);
      return setProblem(r.error);
    }
    setProblem("");
    flashSaved(next.length > before.length ? "Tagged" : "Saved");
    router.refresh();
  }

  async function saveCaption() {
    if (text.trim() === caption.trim()) return;
    const r = await setGalleryCaption(id, text).catch(() => ({ error: "That didn't save. Check your connection." }));
    if (r.error) return setProblem(r.error);
    setProblem("");
    flashSaved();
    router.refresh();
  }

  return (
    <>
      <p className="eyebrow">Details</p>
      <div className="group">
        <div className="row">
          <label className="k" htmlFor="gi-caption">Caption</label>
          <div className="ctl"><input id="gi-caption" value={text} maxLength={1000} placeholder="Optional" onChange={(e) => setText(e.target.value)} onBlur={saveCaption} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} /></div>
        </div>
        <div className="row">
          <span className="k">Tagged</span>
          <div className="ctl"><TagPicker people={people} businessId={businessId} value={tags} onChange={retag} disabled={busy} /></div>
        </div>
      </div>
      <p className="when">Tapping a name tags them straight away. They get a notification, an email and a phone alert.</p>
      {problem && <p className="error">{problem}</p>}
      <div className="gallery-piece-actions">
        <ConfirmButton
          label="Take out of Gallery"
          ask="Take it out of the Gallery?"
          yes="Take out"
          onConfirm={async () => {
            const r = await removeFromGallery(id);
            if (r.error) return setProblem(r.error);
            router.push("/gallery");
          }}
        />
      </div>
    </>
  );
}
