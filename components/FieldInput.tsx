import AmountInput from "./AmountInput";
import FilesInput from "./FilesInput";
import type { LineItem } from "@/lib/documents";
import type { JobField } from "@/lib/fields";

// One row of a job form, for any kind of field. Works in server and client components.
// Amounts can be broken into line items where itemise is on (the owner's forms), starting from items.
export default function FieldInput({
  field: f,
  value,
  idPrefix = "",
  items,
  itemise = false,
}: {
  field: JobField;
  value?: unknown;
  idPrefix?: string;
  items?: LineItem[];
  itemise?: boolean;
}) {
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

  if (f.kind === "money")
    return <AmountInput id={id} name={f.key} label={f.label} required={f.required} placeholder={f.hint || undefined} defaultValue={str} defaultItems={items} itemise={itemise} />;

  let input: React.ReactNode;
  if (f.kind === "select")
    input = (
      <select id={id} name={f.key} required={f.required} defaultValue={str}>
        <option value="">{f.hint || "Choose…"}</option>
        {f.options.map((o) => <option key={o}>{o}</option>)}
      </select>
    );
  else if (f.kind === "files")
    input = <FilesInput id={id} required={f.required} accept="image/*,application/pdf,.ai,.psd,.svg,.eps,.dxf,.zip" />;
  else {
    const type = { date: "date", link: "url", phone: "tel", email: "email" }[f.kind as string] ?? "text";
    const inputMode = f.kind === "number" ? "decimal" : undefined;
    input = <input {...common} type={type} inputMode={inputMode} defaultValue={str} />;
  }
  return (
    <div className="row">
      <label htmlFor={id}>{f.label}</label>
      <div className="ctl">{input}</div>
    </div>
  );
}
