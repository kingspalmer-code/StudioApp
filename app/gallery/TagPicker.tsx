"use client";

// Who to tag on something in the Gallery: tap names to pick as many as you like. People at the
// business it's for come first, then managers, the team, and clients of other businesses (who see
// just this picture once tagged).
export type TagPerson = { email: string; name: string; role: string; businesses: string[]; biz?: string };

export function tagGroups(people: TagPerson[], businessId: string) {
  const here = (p: TagPerson) => p.role === "client" && p.businesses.includes(businessId);
  return [
    { label: "At the business", list: people.filter(here) },
    { label: "Managers", list: people.filter((p) => p.role === "manager") },
    { label: "Your team", list: people.filter((p) => p.role === "designer" || p.role === "staff") },
    { label: "Other clients (see just this)", list: people.filter((p) => p.role === "client" && !here(p)) },
  ].filter((g) => g.list.length);
}

export default function TagPicker({ people, businessId, value, onChange, disabled }: { people: TagPerson[]; businessId: string; value: string[]; onChange: (next: string[]) => void; disabled?: boolean }) {
  const on = new Set(value);
  const toggle = (email: string) => onChange(on.has(email) ? value.filter((e) => e !== email) : [...value, email]);
  const groups = tagGroups(people, businessId);
  if (!groups.length) return <span className="when">Nobody else has a login yet.</span>;
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
                {p.biz && g.label.startsWith("Other") && <span className="tell-biz"> · {p.biz}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
