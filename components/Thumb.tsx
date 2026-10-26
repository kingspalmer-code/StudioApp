"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { previewOfImage, previewOfVideo, previewSrc, savePreview, type PreviewBucket } from "@/lib/preview";

// A small preview of a stored picture or video. It shows the saved preview when there is one.
// Files from before previews existed show the original once, and the first person allowed to add
// files there makes the preview from it then, so everyone after gets the small one.
export default function Thumb({
  bucket,
  path,
  full,
  video = false,
  alt = "",
  canMake = false,
}: {
  bucket: PreviewBucket;
  path: string;
  full: string | null;
  video?: boolean;
  alt?: string;
  // Making a video's preview downloads the start of the video, so only people who can store the
  // preview try. Pictures are downloaded to be shown anyway, so anyone tries (and quietly fails).
  canMake?: boolean;
}) {
  const [mode, setMode] = useState<"preview" | "full" | "plain" | "none">("preview");
  const [made, setMade] = useState<string | null>(null);
  const tried = useRef(false);

  useEffect(() => () => {
    if (made) URL.revokeObjectURL(made);
  }, [made]);

  function missing() {
    if (!full) return setMode("none");
    if (!video) return setMode("full");
    if (!canMake || tried.current) return setMode("plain");
    tried.current = true;
    setMode("plain");
    previewOfVideo(full).then(async (blob) => {
      if (!blob) return;
      setMade(URL.createObjectURL(blob));
      await savePreview(createClient(), bucket, path, blob);
    });
  }

  async function make(img: HTMLImageElement) {
    if (tried.current) return;
    tried.current = true;
    await savePreview(createClient(), bucket, path, await previewOfImage(img));
  }

  if (/\.svg$/i.test(path)) return full ? <img src={full} alt={alt} loading="lazy" /> : null;
  if (made) return <img src={made} alt={alt} />;
  if (mode === "preview") return <img src={previewSrc(bucket, path)} alt={alt} loading="lazy" onError={missing} />;
  if (mode === "none" || !full) return null;
  if (video) return <video src={full} muted playsInline preload="none" />;
  // Read back to make the preview, which needs the file sent with permission to read it. If that
  // fails it's shown plainly instead.
  if (mode === "full") return <img src={full} alt={alt} crossOrigin="anonymous" onLoad={(e) => make(e.currentTarget)} onError={() => setMode("plain")} />;
  return <img src={full} alt={alt} loading="lazy" />;
}
