import { redirect } from "next/navigation";
import Shell, { linksFor } from "@/components/Shell";
import { requireMember } from "@/lib/session";
import MenuButtons from "../MenuButtons";
import SectionHead from "../SectionHead";
import { HomeModeChoice } from "@/components/NewHome";

export default async function MenuSettingsPage() {
  const { workspace, shell, viewing } = await requireMember(["designer", "staff"]);
  // These are the owner's own switches, so someone viewing the workspace doesn't get them.
  if (viewing) redirect("/settings");

  return (
    <Shell {...shell}>
      <div style={{ maxWidth: 640 }}>
        <SectionHead title="Menu" />
        {shell.member.role === "designer" && !shell.member.staff && (
          <div className="home-modes-wrap">
            <h2 className="home-modes-head">How Oatcake opens</h2>
            <HomeModeChoice current={shell.mode} />
          </div>
        )}
        <MenuButtons links={linksFor(shell.member, workspace, false, shell.mode)} hidden={shell.hidden} />
        <p className="foot">Turn off what you don&apos;t use to keep the menu simple. On your phone, buttons that are off wait under More. Hidden pages still open from links and alerts.</p>
      </div>
    </Shell>
  );
}
