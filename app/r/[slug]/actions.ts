"use server";

import { readFields, type JobField } from "@/lib/fields";
import { customerLink } from "@/lib/customers";
import { email } from "@/lib/finished";
import { pushRpc, sendAlert } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";

export type LinkForm = { name: string; owner_name: string; types: { id: number; name: string; lead_days: number }[]; fields: JobField[] };

// Someone without a login asking for a job through a workspace's request link.
export async function sendLinkRequest(slug: string, formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: form } = await supabase.rpc("request_form", { slug });
  const f = form as LinkForm | null;
  if (!f) return { error: "This link isn't taking requests right now." };
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const type = f.types.find((t) => t.name === get("type"));
  const fields = f.fields.filter((x) => !x.type_ids?.length || (type && x.type_ids.includes(type.id)));
  const { columns, details } = readFields(fields, get, (k) => formData.get(k) != null);
  const { data: ticketId, error } = await supabase.rpc("send_customer_request", {
    slug,
    cust_name: get("name"),
    cust_email: get("email"),
    cust_phone: get("phone"),
    job_title: get("title"),
    job_type: get("type"),
    need_by: get("deadline") || null,
    cols: columns,
    extra: details,
  });
  if (error) return { error: error.message };

  // With the alerts secret the server can see who to email their private link to. Nobody else can.
  if (process.env.PUSH_SECRET) {
    const [info] = (await pushRpc<{ customer: string; email: string; token: string; workspace: string; title: string; owners: string[] }[]>("link_request_info", { p_ticket: ticketId })) ?? [];
    if (info) {
      await Promise.all([
        email(
          info.email,
          `${info.workspace} has your request`,
          [`Hi ${info.customer.split(/\s+/)[0] || "there"},`, `Thanks for asking ${info.workspace} about "${info.title}". They'll be in touch soon.`, "You can see where it's up to, and reply, on your page. Keep this email to get back to it."],
          await customerLink(info.token),
          "See your jobs",
          info.workspace,
          ""
        ),
        sendAlert(info.owners, { title: `New job from ${info.customer}`, body: `${info.title}, sent through your request link.`, url: `/tickets/${ticketId}`, tag: `ticket-${ticketId}` }, "new_requests"),
      ]);
    }
  }
  return {};
}
