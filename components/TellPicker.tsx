"use client";

// Who to keep updated on a job: tap names to pick as many as you like. The business's own clients
// come first, then managers (who can see every job).
export type TellPerson = { email: string; name: string; manager: boolean };

export default function TellPicker({ people, value, onChange, disabled }: { people: TellPerson[]; value: string[]; onChange: (next: string[]) => void; disabled?: boolean }) {
  const on = new Set(value);
  const toggle = (email: string) => onChange(on.has(email) ? value.filter((e) => e !== email) : [...value, email]);
  const groups = [
    { label: "At the business", list: people.filter((p) => !p.manager) },
    { label: "Managers", list: people.filter((p) => p.manager) },
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
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
