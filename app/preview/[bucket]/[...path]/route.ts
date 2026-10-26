import { createClient } from "@/lib/supabase/server";
import { PREVIEW_BUCKETS, previewPath, type PreviewBucket } from "@/lib/preview";

// Hands out a file's small preview at an address that never changes, read with the viewer's own
// login so the storage rules still decide who sees what. A preview never changes once it's made
// (every upload gets a new path), so the browser keeps it for a month instead of fetching it again.
export async function GET(_req: Request, { params }: { params: Promise<{ bucket: string; path: string[] }> }) {
  const { bucket, path } = await params;
  if (!PREVIEW_BUCKETS.includes(bucket as PreviewBucket) || !path?.length) return gone();
  const supabase = await createClient();
  const { data } = await supabase.storage.from(bucket).download(previewPath(path.join("/")));
  if (!data) return gone();
  return new Response(data, {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=2592000, immutable" },
  });
}

// Not made yet (or not yours to see). Not kept, so the preview shows once it's been made.
const gone = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
