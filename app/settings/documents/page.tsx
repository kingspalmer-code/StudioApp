import Link from "next/link";
import Shell from "@/components/Shell";
import FrameChanged from "@/components/FrameChanged";
import { loadSettings } from "@/lib/docs-server";
import { requireMember } from "@/lib/session";
import { allows } from "@/lib/access";
import { gmailReady } from "@/lib/gmail";
import DocSettingsForm from "./DocSettingsForm";
import MailConnect from "./MailConnect";

// Settings → Quotes & invoices: the look and business details every PDF uses.
export default async function DocumentSettingsPage({ searchParams }: { searchParams: Promise<{ mail?: string }> }) {
  const { supabase, workspace, member, shell, viewing } = await requireMember(["designer"], "quotes");
  const lastNumber = (kind: "invoice" | "quote") =>
    supabase.from("documents").select("number").eq("workspace_id", workspace.id).eq("kind", kind).order("number", { ascending: false }).limit(1).maybeSingle<{ number: number }>();
  const [settings, lastInvoice, lastQuote, { data: account }, { mail }] = await Promise.all([
    loadSettings(supabase, workspace.id),
    lastNumber("invoice"),
    lastNumber("quote"),
    // Only people who can edit quotes see this row; for everyone else it reads as not connected.
    supabase.from("mail_accounts").select("email").eq("workspace_id", workspace.id).maybeSingle<{ email: string }>(),
    searchParams,
  ]);
  const logo = settings.logo_path ? (await supabase.storage.from("brand").createSignedUrl(settings.logo_path, 3600)).data?.signedUrl ?? null : null;
  // The lowest each can go is one past the last number used, so a new one never clashes.
  const used = { invoice: lastInvoice.data?.number ?? 0, quote: lastQuote.data?.number ?? 0 };

  return (
    <Shell {...shell}>
      <div style={{ maxWidth: 720 }}>
        <p className="eyebrow settings-back" style={{ textTransform: "none", letterSpacing: 0 }}><Link href="/settings">‹ Settings</Link></p>
        <FrameChanged at={Date.now()} />
        <h1 className="large">Quotes &amp; invoices</h1>
        <p className="when" style={{ fontSize: 14 }}>Set this up once and every quote and invoice uses it. Make one from any job.</p>
        <DocSettingsForm
          settings={{
            ...settings,
            business_name: settings.business_name || workspace.name,
            email: settings.email || member.email,
            next_invoice: Math.max(settings.next_invoice, used.invoice + 1),
            next_quote: Math.max(settings.next_quote, used.quote + 1),
          }}
          used={used}
          logoUrl={logo}
          workspaceId={workspace.id}
          readOnly={viewing}
        />
        <MailConnect ready={gmailReady()} email={account?.email ?? null} result={mail} readOnly={viewing || !allows(member.access, "quotes", "edit")} />
      </div>
    </Shell>
  );
}
