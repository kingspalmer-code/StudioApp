import Link from "next/link";
import Shell from "@/components/Shell";
import FrameChanged from "@/components/FrameChanged";
import SaveForm from "@/components/SaveForm";
import { ADDABLE_KINDS, KIND_LABELS, type JobField } from "@/lib/fields";
import { requireMember } from "@/lib/session";
import { addField, deleteField, moveCoreField, moveField, saveCoreField, saveField, setCoreHidden, setFieldHidden } from "../actions";
import { coreFields, type CoreField } from "@/lib/core-fields";
import Submit from "@/components/Submit";

export default async function JobFormPage() {
  const { supabase, ctx, terms, shell, workspace } = await requireMember(["designer"], "settings");
  const core = coreFields(workspace.core_fields, { trade: workspace.kind !== "studio", solo: workspace.kind === "solo" });
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
      <SaveForm action={saveField.bind(null, f.id)} saved={f.kind === "heading" ? "Heading saved" : "Field saved"} then="close" className="field-form">
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
            <label className="field-check"><input type="checkbox" name="required" defaultChecked={f.required} /> Must be filled in</label>
            <label className="field-check"><input type="checkbox" name="on_form" defaultChecked={f.on_form} /> Ask on the new {terms.job} form (otherwise only on the {terms.job} page)</label>
            {ctx.types.length > 1 && (
              <fieldset className="types">
                <legend>Ask for these {terms.job} types</legend>
                {ctx.types.map((t) => (
                  <label className="field-check" key={t.id}>
                    <input type="checkbox" name="type_ids" value={t.id} defaultChecked={!f.type_ids?.length || f.type_ids.includes(t.id)} /> {t.name}
                  </label>
                ))}
              </fieldset>
            )}
          </>
        )}
        <div className="field-actions">
          <Submit className="btn small" type="submit">Save</Submit>
        </div>
      </SaveForm>
      {!f.builtin && (
        <form action={deleteField.bind(null, f.id)} className="field-actions">
          <Submit className="link" style={{ color: "var(--red)" }} type="submit">
            Delete {f.kind === "heading" ? "heading" : "field"}
          </Submit>
          {f.kind !== "heading" && <span className="when">Answers already saved on {terms.jobs} are kept.</span>}
        </form>
      )}
    </details>
  );

  const coreEditor = (c: CoreField) => (
    <details className="ctl field-edit">
      <summary>
        <span className="field-name">{c.label}</span>
        <span className="when">{[c.label !== c.defaultLabel && `Was ${c.defaultLabel}`, c.hidden ? "Hidden" : !c.canHide && "Always asked"].filter(Boolean).join(" · ")}</span>
      </summary>
      <SaveForm action={saveCoreField.bind(null, c.key)} saved="Field saved" then="close" className="field-form">
        <label>
          Name
          <input name="label" defaultValue={c.label === c.defaultLabel ? "" : c.label} placeholder={c.defaultLabel} maxLength={60} />
        </label>
        {c.hasHint && (
          <label>
            Hint
            <input name="hint" defaultValue={c.hint} placeholder="Example text shown in the empty box" maxLength={120} />
          </label>
        )}
        <div className="field-actions">
          <Submit className="btn small" type="submit">Save</Submit>
        </div>
      </SaveForm>
    </details>
  );

  return (
    <Shell {...shell}>
      <div style={{ maxWidth: 640 }}>
        <p className="eyebrow settings-back"><Link href="/settings">‹ Settings</Link></p>
        <FrameChanged at={Date.now()} />
        <h1 className="large">{terms.Job} form</h1>
        <p className="sub">
          What the new {terms.job} form asks, in order. Tap a field to rename it or change its hint.{" "}
          <Link href="/portal">See the form</Link>
        </p>

        <p className="eyebrow">Top of the form</p>
        <div className="group">
          {core.map((c, i) => (
            <div className="row field-row" key={c.key}>
              {coreEditor(c)}
              <span className="stage-tools">
                <form action={moveCoreField.bind(null, c.key, -1)}><Submit className="link" disabled={i === 0} aria-label={`Move ${c.label} up`}>↑</Submit></form>
                <form action={moveCoreField.bind(null, c.key, 1)}><Submit className="link" disabled={i === core.length - 1} aria-label={`Move ${c.label} down`}>↓</Submit></form>
                {c.canHide && (
                  <form action={setCoreHidden.bind(null, c.key, !c.hidden)}><Submit className="link" aria-label={`${c.hidden ? "Switch on" : "Switch off"} ${c.label}`}>{c.hidden ? "Show" : "Hide"}</Submit></form>
                )}
              </span>
            </div>
          ))}
        </div>
        <p className="foot">Every {terms.job} needs these, so only {core.filter((c) => c.canHide).map((c) => c.defaultLabel.toLowerCase()).join(" and ")} can be hidden. A hidden importance means Standard.</p>

        <p className="eyebrow">On the form</p>
        <div className="group">
          {on.map((f, i) => (
            <div className={`row field-row${f.kind === "heading" ? " is-heading" : ""}`} key={f.id}>
              {editor(f)}
              <span className="stage-tools">
                <form action={moveField.bind(null, f.id, -1)}><Submit className="link" disabled={i === 0} aria-label={`Move ${f.label} up`}>↑</Submit></form>
                <form action={moveField.bind(null, f.id, 1)}><Submit className="link" disabled={i === on.length - 1} aria-label={`Move ${f.label} down`}>↓</Submit></form>
                <form action={setFieldHidden.bind(null, f.id, true)}><Submit className="link" aria-label={`Switch off ${f.label}`}>Hide</Submit></form>
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
            <Submit className="link" type="submit">Add</Submit>
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
                    <form action={setFieldHidden.bind(null, f.id, false)}><Submit className="link" aria-label={`Switch on ${f.label}`}>Show</Submit></form>
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
