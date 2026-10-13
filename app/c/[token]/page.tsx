import type { Metadata } from "next";
import Link from "next/link";
import { formatDate, stageColor } from "@/lib/priority";
import { createClient } from "@/lib/supabase/server";
import ReplyBox from "./ReplyBox";

export const metadata: Metadata = { robots: { index: false } };

type Page = {
  customer: string;
  email: string;
  workspace: string;
  owner_name: string;
  slug: string | null;
  stages: { key: string; label: string; color: string }[];
  jobs: {
    id: number;
    title: string;
    type: string;
    status: string;
    created_at: string;
    deadline: string;
    delivered_at: string | null;
    notes: { who: string; mine: boolean; body: string; at: string }[];
  }[];
};

// A customer's own page, opened from the link in their emails: every job they've had from this
// workspace, where each is up to, and a way to reply. No login; the link is the key.
export default async function CustomerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
  const supabase = await createClient();
  const { data } = valid ? await supabase.rpc("customer_page", { token }) : { data: null };
  const page = data as Page | null;

  if (!page)
    return (
      <main className="auth public-page">
        <h1 className="large">Link not working</h1>
        <p className="sub">This link has expired or isn&apos;t quite right. Ask whoever sent it for a new one.</p>
      </main>
    );

  const last = page.stages.length - 1;
  const at = (status: string) => page.stages.findIndex((s) => s.key === status);
  const open = page.jobs.filter((j) => at(j.status) !== last);
  const done = page.jobs.filter((j) => at(j.status) === last);
  const first = page.customer.split(/\s+/)[0];

  const job = (j: Page["jobs"][number]) => {
    const now = at(j.status);
    return (
      <section className="cust-job" key={j.id}>
        <h2>{j.title}</h2>
        <p className="when">{j.type} · asked {formatDate(j.created_at)}{j.delivered_at ? ` · finished ${formatDate(j.delivered_at)}` : ""}</p>
        <div className="group">
          {page.stages.map((s, i) => (
            <div className={`row cust-stage${i === now ? " now" : i > now ? " later" : ""}`} key={s.key}>
              <span className="dot" style={{ background: i <= now ? stageColor(s.color) : "var(--fill)" }} />
              <div className="ctl">{s.label}</div>
              {i === now && <span className="when">Now</span>}
            </div>
          ))}
        </div>
        {j.notes.length > 0 && (
          <ul className="cust-notes">
            {j.notes.map((n, i) => (
              <li key={i} className={n.mine ? "mine" : undefined}>
                <b>{n.mine ? "You" : n.who || page.workspace}</b> <span className="when">{formatDate(n.at)}</span>
                <p>{n.body}</p>
              </li>
            ))}
          </ul>
        )}
        <ReplyBox token={token} job={j.id} to={page.owner_name || page.workspace} />
      </section>
    );
  };

  return (
    <main className="public-page">
      <p className="eyebrow">{page.workspace}</p>
      <h1 className="large">Hi {first}</h1>
      <p className="sub">Here&apos;s everything you&apos;ve asked {page.workspace} for, and where each one is up to.</p>
      {page.slug && (
        <Link className="btn plain" href={`/r/${page.slug}?n=${encodeURIComponent(page.customer)}&e=${encodeURIComponent(page.email)}`}>
          Ask for another job
        </Link>
      )}
      {open.length > 0 && <><p className="eyebrow">In progress</p>{open.map(job)}</>}
      {done.length > 0 && <><p className="eyebrow">Finished</p>{done.map(job)}</>}
      {!page.jobs.length && <p className="sub">Nothing here yet.</p>}
      <p className="foot public-foot">Keep the email this link came in to get back here. Sent with Oatcake.</p>
    </main>
  );
}
