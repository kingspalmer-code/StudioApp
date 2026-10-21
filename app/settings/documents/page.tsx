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
  const [settings, { data: account }, { mail }] = await Promise.all([
    loadSettings(supabase, workspace.id),
    // Only people who can edit quotes see this row; for everyone else it reads as not connected.
    supabase.from("mail_accounts").select("email").eq("workspace_id", workspace.id).maybeSingle<{ email: string }>(),
    searchParams,
  ]);
  const logo = settings.logo_path ? (await supabase.storage.from("brand").createSignedUrl(settings.logo_path, 3600)).data?.signedUrl ?? null : null;

  return (
    <Shell {...shell}>
      <div style={{ maxWidth: 720 }}>
        <p className="eyebrow settings-back" style={{ textTransform: "none", letterSpacing: 0 }}><Link href="/settings">‹ Settings</Link></p>
        <FrameChanged at={Date.now()} />
        <h1 className="large">Quotes &amp; invoices</h1>
        <p className="when" style={{ fontSize: 14 }}>Set this up once and every quote and invoice uses it. Make one from any job.</p>
        <DocSettingsForm
          settings={{ ...settings, business_name: settings.business_name || workspace.name, email: settings.email || member.email }}
          logoUrl={logo}
          workspaceId={workspace.id}
          readOnly={viewing}
        />
        <MailConnect ready={gmailReady()} email={account?.email ?? null} result={mail} readOnly={viewing || !allows(member.access, "quotes", "edit")} />
      </div>
    </Shell>
  );
}
