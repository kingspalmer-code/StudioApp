import type { SupabaseClient } from "@supabase/supabase-js";
import { email, origin, type Moment } from "@/lib/finished";
import { firstTime, pushReady } from "@/lib/push";
import type { Terms } from "@/lib/workspace";

// Customers (in a Customers workspace) never log in. They follow their jobs on a private page at
// /c/<token>, and only ever get that link by email from here, sent while the owner is signed in.

type Studio = { name: string; replyTo: string; terms: Terms };
type Customer = { id: string; name: string; email: string; access_token: string };

export const customerLink = async (token: string) => `${await origin()}/c/${token}`;

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";

// A job was sent over for them to look at, or finished: email the customer, if we have their email.
export async function tellCustomers(supabase: SupabaseClient, ids: number[], studio: Studio, moment: Moment) {
  const { data: jobs } = await supabase
    .from("tickets")
    .select("id, title, delivered_at, updated_at, business_id")
    .in("id", ids)
    .returns<{ id: number; title: string; delivered_at: string | null; updated_at: string; business_id: string }[]>();
  const list = (jobs ?? []).filter((j) => moment === "review" || j.delivered_at);
  if (!list.length) return;
  const { data: people } = await supabase
    .from("businesses")
    .select("id, name, email, access_token")
    .in("id", [...new Set(list.map((j) => j.business_id))])
    .returns<Customer[]>();
  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  const { job } = studio.terms;
  for (const j of list) {
    const c = byId.get(j.business_id);
    if (!c?.email || !c.access_token) continue;
    if (pushReady() && !(await firstTime(`customer-${moment}`, `${j.id}:${moment === "finished" ? j.delivered_at : j.updated_at}`))) continue;
    const line = moment === "finished"
      ? `${studio.name} has finished your ${job} "${j.title}".`
      : `${studio.name} has your ${job} "${j.title}" ready for you to look at.`;
    const subject = moment === "finished" ? `Finished: ${j.title}` : `Ready to look at: ${j.title}`;
    await email(c.email, subject, [`Hi ${firstName(c.name)},`, line, "You can see where all your jobs are up to, and reply, on your page."], await customerLink(c.access_token), "See your jobs", studio.name, studio.replyTo);
  }
}

// The owner sending a customer the link to their page (from the job or the Customers page).
export async function sendCustomerLink(customer: Customer, studio: Studio) {
  if (!customer.email) return "Add their email address first.";
  await email(
    customer.email,
    `Your ${studio.terms.jobs} with ${studio.name}`,
    [`Hi ${firstName(customer.name)},`, `Here's your page for your ${studio.terms.jobs} with ${studio.name}. It shows where each one is up to, and you can reply or ask for another from there. Keep this email to get back to it.`],
    await customerLink(customer.access_token),
    "See your jobs",
    studio.name,
    studio.replyTo
  );
}
