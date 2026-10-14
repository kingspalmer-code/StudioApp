import Link from "next/link";
import SaveWhenChanged from "@/components/SaveWhenChanged";
import Shell from "@/components/Shell";
import { STAGE_COLORS, stageColor } from "@/lib/priority";
import { requireMember } from "@/lib/session";
import { addStage, addType, deleteStage, deleteType, moveStage, renameWorkspace, saveStage, saveType } from "./actions";
import Submit from "@/components/Submit";
import { modeTitle } from "@/lib/workspace";
import WorkMode from "./WorkMode";
import RequestLink from "./RequestLink";
import ShowTeam from "./ShowTeam";
import { headers } from "next/headers";

export default async function SettingsPage() {
  const { supabase, ctx, terms, workspace, shell, viewing } = await requireMember(["designer"]);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "oatcake.xyz"}`;
  const [{ data: used }, { count: loggedIn }] = await Promise.all([
    supabase.from("tickets").select("status"),
    // Clients and managers, whose logins pause if the workspace stops taking requests from businesses.
    supabase.from("members").select("email", { count: "exact", head: true }).in("role", ["client", "manager"]),
  ]);
  const inUse = new Set((used ?? []).map((t) => t.status as string));

  return (
    <Shell {...shell}>
      <div style={{ maxWidth: 640 }}>
        <h1 className="large">Settings</h1>
        <p className="sub">How {workspace.name} tracks its {terms.jobs}.</p>

        <p className="eyebrow">Workspace</p>
        <form action={renameWorkspace}>
          <div className="group">
            <div className="row">
              <label htmlFor="ws-name">Name</label>
              <div className="ctl"><input id="ws-name" name="name" defaultValue={workspace.name} required /></div>
              <Submit className="link" type="submit">Save</Submit>
            </div>
          </div>
        </form>
        {workspace.kind !== "solo" && (
          <p className="foot">
            {terms.Clients} and their contact details are on the <Link href="/customers">{terms.Clients} page</Link>.
          </p>
        )}

        <p className="eyebrow">How you work</p>
        {viewing ? (
          <div className="group"><div className="row"><div className="ctl">{modeTitle(workspace.kind)}</div></div></div>
        ) : (
          <WorkMode kind={workspace.kind} loggedIn={loggedIn ?? 0} />
        )}
        <p className="foot">
          Sets the words Oatcake uses and who can send you {terms.jobs}. Switching never deletes anything.
        </p>

        {!viewing && (
          <>
            <p className="eyebrow">Menu</p>
            <ShowTeam on={shell.showTeam} />
          </>
        )}

        {workspace.kind === "trade" && (
          <>
            <p className="eyebrow">Request link</p>
            <RequestLink open={Boolean(workspace.requests_open)} url={workspace.request_slug ? `${origin}/r/${workspace.request_slug}` : null} />
            <p className="foot">
              Put this link on your website, Instagram or email signature. Anyone can use it to ask you for a job without signing up,
              and they get an email with a link to follow it. You can still add customers and jobs yourself.
            </p>
          </>
        )}

        <p className="eyebrow">{terms.Job} form</p>
        <div className="group">
          <Link href="/settings/form" className="row nav-row">
            <div className="ctl">
              <div style={{ fontWeight: 600 }}>Edit the {terms.job} form</div>
              <div className="when">Add, rename, reorder or hide what a new {terms.job} asks for</div>
            </div>
            <span className="when">›</span>
          </Link>
        </div>

        <p className="eyebrow">Quotes &amp; invoices</p>
        <div className="group">
          <Link href="/settings/documents" className="row nav-row">
            <div className="ctl">
              <div style={{ fontWeight: 600 }}>Your quote and invoice style</div>
              <div className="when">Logo, font, colour, business and bank details</div>
            </div>
            <span className="when">›</span>
          </Link>
        </div>

        <p className="eyebrow">Stages</p>
        <div className="group">
          {ctx.stages.map((s, i) => (
            <div className="row stage-row" key={s.id}>
              <span className="dot" style={{ background: stageColor(s.color), width: 10, height: 10 }} />
              <SaveWhenChanged action={saveStage.bind(null, s.id)} className="ctl stage-form">
                <input name="label" defaultValue={s.label} aria-label="Stage name" required />
                <select name="color" defaultValue={s.color} aria-label="Colour" className="swatch-select">
                  {STAGE_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </SaveWhenChanged>
              <span className="stage-tools">
                <form action={moveStage.bind(null, s.id, -1)}><Submit className="link" disabled={i === 0} aria-label="Move up">↑</Submit></form>
                <form action={moveStage.bind(null, s.id, 1)}><Submit className="link" disabled={i === ctx.stages.length - 1} aria-label="Move down">↓</Submit></form>
                {!inUse.has(s.key) && ctx.stages.length > 2 && (
                  <form action={deleteStage.bind(null, s.id)}><Submit className="link" style={{ color: "var(--red)" }} aria-label={`Delete ${s.label}`}>✕</Submit></form>
                )}
              </span>
            </div>
          ))}
          <form action={addStage} className="row">
            <div className="ctl"><input name="label" placeholder="Add a stage" aria-label="New stage name" required /></div>
            <Submit className="link" type="submit">Add</Submit>
          </form>
        </div>
        <p className="foot">
          {terms.Jobs} move through these in order. The last stage counts as finished. A stage can only be deleted when no {terms.jobs} are in it.
        </p>

        <p className="eyebrow">{terms.Job} types</p>
        <div className="group">
          {ctx.types.map((t) => (
            <div className="row" key={t.id}>
              <SaveWhenChanged action={saveType.bind(null, t.id)} className="ctl stage-form">
                <input name="name" defaultValue={t.name} aria-label="Type name" required />
                <input name="lead_days" type="number" min={0} max={365} defaultValue={t.lead_days} aria-label="Working days needed" className="days" />
                <span className="when">days</span>
              </SaveWhenChanged>
              {ctx.types.length > 1 && (
                <form action={deleteType.bind(null, t.id)}><Submit className="link" style={{ color: "var(--red)" }} aria-label={`Delete ${t.name}`}>✕</Submit></form>
              )}
            </div>
          ))}
          <form action={addType} className="row">
            <div className="ctl stage-form">
              <input name="name" placeholder="Add a type" aria-label="New type name" required />
              <input name="lead_days" type="number" min={0} max={365} defaultValue={3} aria-label="Working days needed" className="days" />
              <span className="when">days</span>
            </div>
            <Submit className="link" type="submit">Add</Submit>
          </form>
        </div>
        <p className="foot">Days is how many working days that kind of {terms.job} needs. Oatcake uses it to work out when to start.</p>
      </div>
    </Shell>
  );
}
