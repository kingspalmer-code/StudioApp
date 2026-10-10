import type { JobField } from "@/lib/fields";

// One row of a job form, for any kind of field. Works in server and client components.
export default function FieldInput({ field: f, value, idPrefix = "" }: { field: JobField; value?: unknown; idPrefix?: string }) {
  const id = `${idPrefix}${f.key}`;
  const str = value == null ? "" : String(value);
  const common = { id, name: f.key, required: f.required, placeholder: f.hint || undefined };

  if (f.kind === "longtext")
    return (
      <div className="row stack">
        <label htmlFor={id}>{f.label}</label>
        <textarea {...common} defaultValue={str} />
      </div>
    );
  if (f.kind === "checkbox")
    return (
      <label className="row check-row" htmlFor={id}>
        <span>{f.label}</span>
        <input id={id} name={f.key} type="checkbox" defaultChecked={value === true} required={f.required} />
      </label>
    );

  let input: React.ReactNode;
  if (f.kind === "select")
    input = (
      <select id={id} name={f.key} required={f.required} defaultValue={str}>
        <option value="">{f.hint || "Choose…"}</option>
        {f.options.map((o) => <option key={o}>{o}</option>)}
      </select>
    );
  else if (f.kind === "files")
    input = <input id={id} name="files" type="file" multiple required={f.required} accept="image/*,application/pdf,.ai,.psd,.svg,.eps,.dxf,.zip" />;
  else {
    const type = { date: "date", link: "url", phone: "tel", email: "email" }[f.kind as string] ?? "text";
    const inputMode = f.kind === "money" || f.kind === "number" ? "decimal" : undefined;
    input = <input {...common} type={type} inputMode={inputMode} defaultValue={str} />;
  }
  return (
    <div className="row">
      <label htmlFor={id}>{f.label}</label>
      <div className="ctl">{input}</div>
    </div>
  );
}
