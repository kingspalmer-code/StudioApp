import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Shell from "@/components/Shell";
import { requireMember } from "@/lib/session";
import RequestLink from "../RequestLink";
import SectionHead from "../SectionHead";

export default async function RequestLinkSettingsPage() {
  const { workspace, shell } = await requireMember(["designer"]);
  // Only for working with customers.
  if (workspace.kind !== "trade") redirect("/settings");
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "oatcake.xyz"}`;

  return (
    <Shell {...shell}>
      <div style={{ maxWidth: 640 }}>
        <SectionHead title="Request link" />
        <RequestLink open={Boolean(workspace.requests_open)} url={workspace.request_slug ? `${origin}/r/${workspace.request_slug}` : null} />
        <p className="foot">
          Put this link on your website, Instagram or email signature. Anyone can use it to ask you for a job without signing up,
          and they get an email with a link to follow it. You can still add customers and jobs yourself.
        </p>
      </div>
    </Shell>
  );
}
