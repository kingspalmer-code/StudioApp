import Link from "next/link";
import { notFound } from "next/navigation";
import Shell from "@/components/Shell";
import { docName, STATUS_LABEL } from "@/lib/documents";
import { asDoc, loadSettings } from "@/lib/docs-server";
import { requireMember } from "@/lib/session";
import DocEditor from "./DocEditor";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, workspace, shell, viewing } = await requireMember(["designer"], "quotes");
  const { data: row } = await supabase.from("documents").select("*").eq("id", Number(id)).maybeSingle();
  if (!row) notFound();
  const doc = asDoc(row);
  const settings = await loadSettings(supabase, workspace.id);
  const setUp = Boolean(settings.business_name);

  return (
    <Shell {...shell}>
      <div style={{ maxWidth: 760 }}>
        <p className="eyebrow" style={{ textTransform: "none", letterSpacing: 0 }}>
          {doc.ticket_id ? <Link href={`/tickets/${doc.ticket_id}`}>‹ Back to the job</Link> : <Link href="/queue">‹ Back</Link>}
        </p>
        <h1 className="large" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {docName(doc)}
          <span className={`chip doc-status ${doc.status}`}>{STATUS_LABEL[doc.status]}</span>
        </h1>
        {doc.sent_at && <p className="when">Sent to {doc.sent_to} on {new Date(doc.sent_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>}
        {!setUp && (
          <p className="notice">
            Add your logo, business details and bank details once in <Link href="/settings/documents">Settings → Quotes &amp; invoices</Link> so they appear on every PDF.
          </p>
        )}
        <DocEditor
          doc={doc}
          vatRegistered={settings.vat_registered}
          vatRate={settings.vat_rate}
          ai={Boolean(process.env.ANTHROPIC_API_KEY)}
          email={Boolean(process.env.RESEND_API_KEY)}
          readOnly={viewing}
        />
      </div>
    </Shell>
  );
}
