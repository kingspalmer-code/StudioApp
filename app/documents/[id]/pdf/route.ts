import { docName } from "@/lib/documents";
import { asDoc, loadSettings, pdfFailed, pdfFor } from "@/lib/docs-server";
import { createClient } from "@/lib/supabase/server";

// The PDF for one quote or invoice. ?download=1 saves it instead of opening it.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: row } = await supabase.from("documents").select("*").eq("id", Number(id)).maybeSingle();
  if (!row) return new Response("Not found", { status: 404 });
  const doc = asDoc(row);
  const settings = await loadSettings(supabase, doc.workspace_id);
  const url = new URL(req.url);
  let pdf: Buffer;
  try {
    pdf = await pdfFor(supabase, doc, settings, url.origin);
  } catch (e) {
    return pdfFailed(e);
  }
  const name = `${docName(doc)}${doc.customer_name ? ` - ${doc.customer_name}` : ""}.pdf`.replace(/[^\w .,&()-]/g, "");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${url.searchParams.get("download") ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
