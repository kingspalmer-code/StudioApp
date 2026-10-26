import type { SupabaseClient } from "@supabase/supabase-js";

// Small previews of stored pictures and videos. Lists, galleries and widgets used to load the
// original files (often 2-15MB artboards and 40MB reels) just to show a thumbnail, which used up
// the storage allowance fast. Now each picture or video gets a small JPEG beside it, at the same
// path plus ".preview", so it falls under the same storage rules as the file it belongs to.
// Previews are shown through /preview/<bucket>/<path>, an address that never changes, so the
// browser keeps its copy instead of downloading it again on every visit.

export const PREVIEW_BUCKETS = ["deliveries", "inspiration"] as const;
export type PreviewBucket = (typeof PREVIEW_BUCKETS)[number];

const EDGE = 800;

export const previewPath = (path: string) => `${path}.preview`;
export const previewSrc = (bucket: PreviewBucket, path: string) => `/preview/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;

// Pictures and videos a browser can draw a frame of. SVGs are left alone (they're small and scale).
export const canPreview = (mime: string, name: string) =>
  (mime.startsWith("image/") && !mime.includes("svg")) || mime.startsWith("video/") || /\.(png|jpe?g|gif|webp|heic|mp4|mov|webm)$/i.test(name);

function toJpeg(source: CanvasImageSource, w: number, h: number): Promise<Blob | null> {
  if (!w || !h) return Promise.resolve(null);
  const scale = Math.min(1, EDGE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  // JPEGs have no see-through parts, so transparent artwork sits on white like it would on paper.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((done) => {
    try {
      canvas.toBlob((b) => done(b), "image/jpeg", 0.75);
    } catch {
      done(null); // a picture from another site without permission can't be read back
    }
  });
}

// A frame from a video about a second in (or a tenth of the way through a short one).
function videoFrame(src: string): Promise<Blob | null> {
  return new Promise((done) => {
    const v = document.createElement("video");
    const finish = (b: Blob | null) => {
      v.removeAttribute("src");
      v.load();
      done(b);
    };
    const timer = setTimeout(() => finish(null), 20000);
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      v.currentTime = Math.min(1, (v.duration || 0) / 10);
    };
    v.onseeked = async () => {
      clearTimeout(timer);
      finish(await toJpeg(v, v.videoWidth, v.videoHeight));
    };
    v.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
    v.src = src;
  });
}

// A preview of a file the person just picked, before or after it's uploaded.
export async function previewOfFile(file: File): Promise<Blob | null> {
  if (!canPreview(file.type, file.name)) return null;
  try {
    if (file.type.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(file.name)) {
      const url = URL.createObjectURL(file);
      try {
        return await videoFrame(url);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    const bmp = await createImageBitmap(file);
    try {
      return await toJpeg(bmp, bmp.width, bmp.height);
    } finally {
      bmp.close();
    }
  } catch {
    return null;
  }
}

// A preview made from a picture already showing on the page (loaded with crossOrigin="anonymous").
export const previewOfImage = (img: HTMLImageElement) => toJpeg(img, img.naturalWidth, img.naturalHeight);
export const previewOfVideo = (src: string) => videoFrame(src);


// Stores a preview beside a file. Best effort: a missing preview just means the original shows.
export async function savePreview(supabase: SupabaseClient, bucket: PreviewBucket, path: string, blob: Blob | null) {
  if (!blob) return;
  await supabase.storage.from(bucket).upload(previewPath(path), blob, { contentType: "image/jpeg" }).catch(() => {});
}

// Makes and stores the preview for a file that was just uploaded to `path`.
export async function uploadPreview(supabase: SupabaseClient, bucket: PreviewBucket, path: string, file: File) {
  await savePreview(supabase, bucket, path, await previewOfFile(file));
}

// The originals and their previews, for removing files from storage together.
export const withPreviews = (paths: string[]) => paths.flatMap((p) => [p, previewPath(p)]);
