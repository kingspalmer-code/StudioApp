import SaveWhenChanged from "@/components/SaveWhenChanged";
import Shell from "@/components/Shell";
import Submit from "@/components/Submit";
import { requireMember } from "@/lib/session";
import { addType, deleteType, saveType } from "../actions";
import SectionHead from "../SectionHead";

export default async function TypesSettingsPage() {
  const { ctx, terms, shell } = await requireMember(["designer"]);

  return (
    <Shell {...shell}>
      <div style={{ maxWidth: 640 }}>
        <SectionHead title={`${terms.Job} types`} />
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
