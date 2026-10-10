import Link from "next/link";
import Shell from "@/components/Shell";
import { ADDABLE_KINDS, KIND_LABELS, type JobField } from "@/lib/fields";
import { requireMember } from "@/lib/session";
import { addField, deleteField, moveField, saveField, setFieldHidden } from "../actions";

export default async function JobFormPage() {
  const { supabase, ctx, terms, shell } = await requireMember(["designer"]);
  const { data } = await supabase.from("job_fields").select("*").order("position").order("id").returns<JobField[]>();
  const fields = data ?? [];
  const on = fields.filter((f) => !f.hidden);
  const off = fields.filter((f) => f.hidden);
  const typeName = (id: number) => ctx.types.find((t) => t.id === id)?.name;

  const tags = (f: JobField) =>
    [
      f.kind !== "heading" && KIND_LABELS[f.kind],
      f.required && "Required",
      !f.on_form && f.kind !== "heading" && `${terms.Job} page only`,
      f.type_ids?.length ? `Only ${f.type_ids.map(typeName).filter(Boolean).join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const editor = (f: JobField) => (
    <details className="ctl field-edit">
      <summary>
        <span className={f.kind === "heading" ? "field-heading" : "field-name"}>{f.label}</span>
        <span className="when">{f.kind === "heading" ? "Section heading" : tags(f)}</span>
      </summary>
      <form action={saveField.bind(null, f.id)} className="field-form">
        <label>
          Name
          <input name="label" defaultValue={f.label} required />
        </label>
        {f.kind !== "heading" && (
          <>
            <label>
              Hint
              <input name="hint" defaultValue={f.hint} placeholder="Example text shown in the empty box" />
            </label>
            {!f.builtin && (
              <label>
                Kind
                <select name="kind" defaultValue={f.kind}>
                  {ADDABLE_KINDS.filter((k) => k !== "heading").map((k) => (
                    <option key={k} value={k}>{KIND_LABELS[k]}</option>
                  ))}
                </select>
              </label>
            )}
            {f.kind === "select" && (
              <label>
                Choices, one per line
                <textarea name="options" defaultValue={f.options.join("\n")} rows={4} />
              </label>
            )}
            <label className="tick"><input type="checkbox" name="required" defaultChecked={f.required} /> Must be filled in</label>
            <label className="tick"><input type="checkbox" name="on_form" defaultChecked={f.on_form} /> Ask on the new {terms.job} form (otherwise only on the {terms.job} page)</label>
            {ctx.types.length > 1 && (
              <fieldset className="types">
                <legend>Ask for these {terms.job} types</legend>
                {ctx.types.map((t) => (
                  <label className="tick" key={t.id}>
                    <input type="checkbox" name="type_ids" value={t.id} defaultChecked={!f.type_ids?.length || f.type_ids.includes(t.id)} /> {t.name}
                  </label>
                ))}
              </fieldset>
            )}
          </>
        )}
        <div className="field-actions">
          <button className="btn small" type="submit">Save</button>
        </div>
      </form>
      {!f.builtin && (
        <form action={deleteField.bind(null, f.id)} className="field-actions">
          <button className="link" style={{ color: "var(--red)" }} type="submit">
            Delete {f.kind === "heading" ? "heading" : "field"}
          </button>
          {f.kind !== "heading" && <span className="when">Answers already saved on {terms.jobs} are kept.</span>}
        </form>
      )}
    </details>
  );

  return (
    <Shell {...shell}>
      <div style={{ maxWidth: 640 }}>
        <p className="eyebrow"><Link href="/settings">‹ Settings</Link></p>
        <h1 className="large">{terms.Job} form</h1>
        <p className="sub">
          What the new {terms.job} form asks, in order. {terms.Client}, title, type, needed-by date and importance are always there. Tap a field to change it.{" "}
          <Link href="/portal">See the form</Link>
        </p>

        <p className="eyebrow">On the form</p>
        <div className="group">
          {on.map((f, i) => (
            <div className={`row field-row${f.kind === "heading" ? " is-heading" : ""}`} key={f.id}>
              {editor(f)}
              <span className="stage-tools">
                <form action={moveField.bind(null, f.id, -1)}><button className="link" disabled={i === 0} aria-label={`Move ${f.label} up`}>↑</button></form>
                <form action={moveField.bind(null, f.id, 1)}><button className="link" disabled={i === on.length - 1} aria-label={`Move ${f.label} down`}>↓</button></form>
                <form action={setFieldHidden.bind(null, f.id, true)}><button className="link" aria-label={`Switch off ${f.label}`}>Hide</button></form>
              </span>
            </div>
          ))}
          {!on.length && <div className="empty">Nothing extra is asked yet.</div>}
        </div>

        <p className="eyebrow">Add a field</p>
        <form action={addField} className="group">
          <div className="row">
            <div className="ctl stage-form">
              <input name="label" placeholder="e.g. Van registration" aria-label="Field name" required />
              <select name="kind" defaultValue="text" aria-label="Kind of field">
                {ADDABLE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
              </select>
            </div>
            <button className="link" type="submit">Add</button>
          </div>
        </form>
        <p className="foot">New fields go at the bottom. Use the arrows to move them, and tap one to add choices for a dropdown or limit it to some {terms.job} types.</p>

        {off.length > 0 && (
          <>
            <p className="eyebrow">Switched off</p>
            <div className="group">
              {off.map((f) => (
                <div className="row field-row" key={f.id}>
                  {editor(f)}
                  <span className="stage-tools">
                    <form action={setFieldHidden.bind(null, f.id, false)}><button className="link" aria-label={`Switch on ${f.label}`}>Show</button></form>
                  </span>
                </div>
              ))}
            </div>
            <p className="foot">Hidden fields aren&apos;t asked any more, but anything already filled in still shows on those {terms.jobs}.</p>
          </>
        )}
      </div>
    </Shell>
  );
}
