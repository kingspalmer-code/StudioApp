import SaveWhenChanged from "@/components/SaveWhenChanged";
import Shell from "@/components/Shell";
import Submit from "@/components/Submit";
import { STAGE_COLORS, stageColor } from "@/lib/priority";
import { requireMember } from "@/lib/session";
import { addStage, deleteStage, moveStage, saveStage } from "../actions";
import SectionHead from "../SectionHead";

export default async function StagesSettingsPage() {
  const { supabase, ctx, terms, shell } = await requireMember(["designer"], "settings");
  const { data: used } = await supabase.from("tickets").select("status");
  const inUse = new Set((used ?? []).map((t) => t.status as string));

  return (
    <Shell {...shell}>
      <div style={{ maxWidth: 640 }}>
        <SectionHead title="Stages" />
        <div className="group">
          {ctx.stages.map((s, i) => (
            <div className="row stage-row" key={s.id}>
              <span className="dot" style={{ background: stageColor(s.color), width: 10, height: 10 }} />
              <SaveWhenChanged action={saveStage.bind(null, s.id)} className="ctl stage-form" saved="Stage saved">
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

      </div>
    </Shell>
  );
}
