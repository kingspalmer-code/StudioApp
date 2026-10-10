import { loadSettings, pdfFailed, pdfFor, readSettingsForm, sampleDoc } from "@/lib/docs-server";
import { requireMember } from "@/lib/session";

// A sample quote in the workspace's style, for the preview in Settings. GET uses what's saved;
// POST sends the form as it is on screen, so changes show before they're saved.
async function sample(req: Request, form: FormData | null) {
  const { supabase, workspace } = await requireMember(["designer"]);
  const saved = await loadSettings(supabase, workspace.id);
  const settings = form ? { ...saved, ...readSettingsForm(form) } : saved;
  let pdf: Buffer;
  try {
    pdf = await pdfFor(supabase, sampleDoc(settings), settings, new URL(req.url).origin);
  } catch (e) {
    return pdfFailed(e);
  }
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="Sample quote.pdf"', "Cache-Control": "private, no-store" },
  });
}

export const GET = (req: Request) => sample(req, null);
export const POST = async (req: Request) => sample(req, await req.formData());
