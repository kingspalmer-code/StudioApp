import Link from "next/link";
import Shell from "@/components/Shell";
import { STAGE_COLORS, stageColor } from "@/lib/priority";
import { requireMember } from "@/lib/session";
import { addStage, addType, deleteStage, deleteType, moveStage, renameWorkspace, saveStage, saveType } from "./actions";

export default async function SettingsPage() {
  const { supabase, ctx, terms, workspace, shell } = await requireMember(["designer"]);
  const { data: used } = await supabase.from("tickets").select("status");
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
              <button className="link" type="submit">Save</button>
            </div>
          </div>
        </form>
        <p className="foot">
          {terms.Clients} and their contact details are on the <Link href="/customers">{terms.Clients} page</Link>.
        </p>

        <p className="eyebrow">Stages</p>
        <div className="group">
          {ctx.stages.map((s, i) => (
            <div className="row stage-row" key={s.id}>
              <span className="dot" style={{ background: stageColor(s.color), width: 10, height: 10 }} />
              <form action={saveStage.bind(null, s.id)} className="ctl stage-form">
                <input name="label" defaultValue={s.label} aria-label="Stage name" required />
                <select name="color" defaultValue={s.color} aria-label="Colour" className="swatch-select">
                  {STAGE_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button className="link" type="submit">Save</button>
              </form>
              <span className="stage-tools">
                <form action={moveStage.bind(null, s.id, -1)}><button className="link" disabled={i === 0} aria-label="Move up">↑</button></form>
                <form action={moveStage.bind(null, s.id, 1)}><button className="link" disabled={i === ctx.stages.length - 1} aria-label="Move down">↓</button></form>
                {!inUse.has(s.key) && ctx.stages.length > 2 && (
                  <form action={deleteStage.bind(null, s.id)}><button className="link" style={{ color: "var(--red)" }} aria-label={`Delete ${s.label}`}>✕</button></form>
                )}
              </span>
            </div>
          ))}
          <form action={addStage} className="row">
            <div className="ctl"><input name="label" placeholder="Add a stage" aria-label="New stage name" required /></div>
            <button className="link" type="submit">Add</button>
          </form>
        </div>
        <p className="foot">
          {terms.Jobs} move through these in order. The last stage counts as finished. A stage can only be deleted when no {terms.jobs} are in it.
        </p>

        <p className="eyebrow">{terms.Job} types</p>
        <div className="group">
          {ctx.types.map((t) => (
            <div className="row" key={t.id}>
              <form action={saveType.bind(null, t.id)} className="ctl stage-form">
                <input name="name" defaultValue={t.name} aria-label="Type name" required />
                <input name="lead_days" type="number" min={0} max={365} defaultValue={t.lead_days} aria-label="Working days needed" className="days" />
                <span className="when">days</span>
                <button className="link" type="submit">Save</button>
              </form>
              {ctx.types.length > 1 && (
                <form action={deleteType.bind(null, t.id)}><button className="link" style={{ color: "var(--red)" }} aria-label={`Delete ${t.name}`}>✕</button></form>
              )}
            </div>
          ))}
          <form action={addType} className="row">
            <div className="ctl stage-form">
              <input name="name" placeholder="Add a type" aria-label="New type name" required />
              <input name="lead_days" type="number" min={0} max={365} defaultValue={3} aria-label="Working days needed" className="days" />
              <span className="when">days</span>
            </div>
            <button className="link" type="submit">Add</button>
          </form>
        </div>
        <p className="foot">Days is how many working days that kind of {terms.job} needs. Oatcake uses it to work out when to start.</p>
      </div>
    </Shell>
  );
}
