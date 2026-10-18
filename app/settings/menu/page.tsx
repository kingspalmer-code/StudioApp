import { redirect } from "next/navigation";
import Shell, { linksFor } from "@/components/Shell";
import { requireMember } from "@/lib/session";
import MenuButtons from "../MenuButtons";
import SectionHead from "../SectionHead";

export default async function MenuSettingsPage() {
  const { workspace, shell, viewing } = await requireMember(["designer"]);
  // These are the owner's own switches, so someone viewing the workspace doesn't get them.
  if (viewing) redirect("/settings");

  return (
    <Shell {...shell}>
      <div style={{ maxWidth: 640 }}>
        <SectionHead title="Menu" />
        <MenuButtons links={linksFor(shell.member, workspace, false)} hidden={shell.hidden} />
        <p className="foot">Turn off what you don&apos;t use to keep the menu simple. On your phone, buttons that are off wait under More. Hidden pages still open from links and alerts.</p>
      </div>
    </Shell>
  );
}
