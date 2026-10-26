import Link from "next/link";
import Shell from "@/components/Shell";
import SplitHost from "@/components/SplitHost";
import { requireMember } from "@/lib/session";
import { allows } from "@/lib/access";
import { modeTitle } from "@/lib/workspace";

// Settings is a list of sections. On computers a section opens on the right, beside the list,
// the way a job opens beside the queue (components/SplitHost.tsx); on phones it's its own page.
export default async function SettingsPage() {
  const { ctx, terms, workspace, shell, member } = await requireMember(["designer"], ["settings", "quotes"]);
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  const all = [
    { href: "/settings/workspace", title: "Workspace", sub: `${workspace.name} · ${modeTitle(workspace.kind)}` },
    ...(shell.viewing ? [] : [{ href: "/settings/menu", title: "Menu", sub: `${shell.mode === "work" ? "Just work" : "Life and work"}. Which buttons show on your phone and computer` }]),
    ...(workspace.kind === "trade"
      ? [{ href: "/settings/request-link", title: "Request link", sub: workspace.requests_open ? "On: anyone with the link can ask for a job" : "Off" }]
      : []),
    { href: "/settings/form", title: `${terms.Job} form`, sub: `Add, rename, reorder or hide what a new ${terms.job} asks for` },
    { href: "/settings/documents", title: "Quotes & invoices", sub: "Logo, font, colour, business and bank details" },
    { href: "/settings/stages", title: "Stages", sub: ctx.stages.map((s) => s.label).join(", ") },
    { href: "/settings/types", title: `${terms.Job} types`, sub: count(ctx.types.length, "type", "types") },
  ];
  // An employee sees the sections the owner let them into (quotes, the rest, or both) and their own Menu.
  const sections = member.staff
    ? all.filter((s) => s.href === "/settings/menu" || (s.href === "/settings/documents" ? allows(member.access, "quotes") : allows(member.access, "settings")))
    : all;

  return (
    <Shell {...shell}>
      <div style={{ maxWidth: 640 }}>
        <h1 className="large">Settings</h1>
        <p className="sub">How {workspace.name} tracks its {terms.jobs}.</p>
        <SplitHost under="/settings" label="Settings">
          <div className="group settings-list">
            {sections.map((s) => (
              <Link key={s.href} href={s.href} className="row nav-row">
                <div className="ctl">
                  <div style={{ fontWeight: 600 }}>{s.title}</div>
                  <div className="when">{s.sub}</div>
                </div>
                <span className="when">›</span>
              </Link>
            ))}
          </div>
        </SplitHost>
      </div>
    </Shell>
  );
}
