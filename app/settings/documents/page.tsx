import Link from "next/link";
import Shell from "@/components/Shell";
import { loadSettings } from "@/lib/docs-server";
import { requireMember } from "@/lib/session";
import DocSettingsForm from "./DocSettingsForm";

// Settings → Quotes & invoices: the look and business details every PDF uses.
export default async function DocumentSettingsPage() {
  const { supabase, workspace, member, shell, viewing } = await requireMember(["designer"]);
  const settings = await loadSettings(supabase, workspace.id);
  const logo = settings.logo_path ? (await supabase.storage.from("brand").createSignedUrl(settings.logo_path, 3600)).data?.signedUrl ?? null : null;

  return (
    <Shell {...shell}>
      <div style={{ maxWidth: 720 }}>
        <p className="eyebrow" style={{ textTransform: "none", letterSpacing: 0 }}><Link href="/settings">‹ Settings</Link></p>
        <h1 className="large">Quotes &amp; invoices</h1>
        <p className="when" style={{ fontSize: 14 }}>Set this up once and every quote and invoice uses it. Make one from any job.</p>
        <DocSettingsForm
          settings={{ ...settings, business_name: settings.business_name || workspace.name, email: settings.email || member.email }}
          logoUrl={logo}
          workspaceId={workspace.id}
          readOnly={viewing}
        />
      </div>
    </Shell>
  );
}
