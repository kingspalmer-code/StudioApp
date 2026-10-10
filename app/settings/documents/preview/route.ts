import { loadSettings, pdfFor, sampleDoc } from "@/lib/docs-server";
import { requireMember } from "@/lib/session";

// A sample quote in the workspace's saved style, for the preview in Settings.
export async function GET(req: Request) {
  const { supabase, workspace } = await requireMember(["designer"]);
  const settings = await loadSettings(supabase, workspace.id);
  const pdf = await pdfFor(supabase, sampleDoc(settings), settings, new URL(req.url).origin);
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="Sample quote.pdf"', "Cache-Control": "private, no-store" },
  });
}
