"use client";

// Who to keep updated on a job: tap names to pick as many as you like. The business's own clients
// come first, then managers (who can see every job), then clients of other businesses, who see just
// this one job once picked.
export type TellPerson = { email: string; name: string; manager: boolean; elsewhere?: string };

export default function TellPicker({ people, value, onChange, disabled }: { people: TellPerson[]; value: string[]; onChange: (next: string[]) => void; disabled?: boolean }) {
  const on = new Set(value);
  const toggle = (email: string) => onChange(on.has(email) ? value.filter((e) => e !== email) : [...value, email]);
  const groups = [
    { label: "At the business", list: people.filter((p) => !p.manager && !p.elsewhere) },
    { label: "Managers", list: people.filter((p) => p.manager) },
    { label: "Other clients (see just this job)", list: people.filter((p) => !p.manager && p.elsewhere) },
  ].filter((g) => g.list.length);
  return (
    <div className="tell-pick">
      {groups.map((g) => (
        <div key={g.label} role="group" aria-label={g.label}>
          {groups.length > 1 && <small>{g.label}</small>}
          <div className="tell-chips">
            {g.list.map((p) => (
              <button key={p.email} type="button" aria-pressed={on.has(p.email)} disabled={disabled} onClick={() => toggle(p.email)}>
                {on.has(p.email) && <span aria-hidden="true">✓ </span>}
                {p.name}
                {p.elsewhere && <span className="tell-biz"> · {p.elsewhere}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
