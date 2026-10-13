import Anthropic from "@anthropic-ai/sdk";
import { daysFromToday, formatDate, isAtRisk, isDone, money, sortQueue, startBy, startLabel, statusLabel } from "@/lib/priority";
import { requireMember } from "@/lib/session";
import type { Ticket } from "@/lib/types";

// Ask Oatcake: answers questions about the signed-in person's own work, and how to use Oatcake.
// Everything it knows is read with their own session, so the database rules decide what it sees.
export const maxDuration = 60;

type Turn = { role: "user" | "assistant"; content: string };

const GUIDE = `How Oatcake is laid out (use these paths for links):
- Jobs (/queue): every open job, ordered by when to start it, worked back from the deadline and how long that type of job takes. The line at the top says what to start now and what's due this week. "Board" (/queue?view=board) shows jobs in columns by stage. Customer filters sit next to it.
- Overview (/overview): totals (open jobs, money quoted but not yet paid, at risk, delivered this month), progress for each customer, jobs at risk and recently delivered.
- New job (/portal): add a job as soon as it comes in. Typing a new customer name saves the customer automatically. On a phone it's the + in the bottom bar.
- How you work (Settings): Businesses (requests from businesses who log in; People page), Customers (jobs for members of the public; Customers page) or Just me (projects, no clients). Switching never deletes anything; leaving Businesses pauses client logins.
- Customers (/customers) in Customers workspaces, or People (/people) in Businesses workspaces: contact details, adding and deleting customers. On People you can add someone with a role (client, manager or designer) and send them an invite email.
- Personal (/personal): a private to-do list only you can see. Type "tomorrow", a weekday or "next week" to set a date, and "!" to flag it. Projects group to-dos.
- A job's page (open it from Jobs): change its stage, pin it to the top, edit details, add notes, and make quotes and invoices with "+ New quote" or "+ New invoice". When a job is finished it offers to create the invoice.
- A quote or invoice: edit the customer, line items, VAT and notes; "Draft with Oatcake" fills in line items; "Preview PDF", "Email to customer" (sends the PDF, replies come back to you), "Mark accepted" or "Mark paid".
- Settings (/settings; tap your photo or initials at the top right, then Settings): rename the workspace; job types and how many days each takes; stages (add, rename, reorder, colour, delete); the job form (/settings/form) to add, rename, reorder or hide fields; quote and invoice style (/settings/documents) for logo, font, colour, business details, VAT, bank details, payment terms and footer.
- Account (/account; tap your photo or initials at the top right): password, light or dark appearance, sign out, and "Show me around again" to replay the walkthrough. Also "Help & support" (/help) to message the Oatcake team.
- Help (/help): message the Oatcake team about a problem or idea, with a screenshot if useful. Replies show there and by email.`;

function line(t: Ticket, biz: string, ctx: Parameters<typeof sortQueue>[1]) {
  const done = isDone(t, ctx);
  const parts = [
    `#${t.id} ${t.title}`,
    `customer: ${biz}`,
    `type: ${t.type}`,
    `stage: ${statusLabel(ctx, t.status)}`,
    done ? `delivered ${formatDate(t.delivered_at ?? t.deadline)}` : `due ${formatDate(t.deadline)} (${daysFromToday(t.deadline)} days from today)`,
    !done && `start: ${startLabel(startBy(t, ctx)).text}`,
    t.priority !== "Standard" && `priority: ${t.priority}`,
    t.pinned && "pinned",
    !done && isAtRisk(t, ctx) && "AT RISK",
    t.quote_amount != null && `quoted ${money(t.quote_amount)}`,
    t.paid_amount != null && `paid ${money(t.paid_amount)}`,
    t.site_address && `site: ${t.site_address}`,
  ];
  return parts.filter(Boolean).join(" · ");
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return new Response("Ask Oatcake isn't switched on yet.", { status: 503 });
  const { supabase, businesses, ctx, terms, workspace, member } = await requireMember(["designer"]);

  const body = (await req.json().catch(() => null)) as { messages?: Turn[] } | null;
  const messages = (body?.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") return new Response("Ask a question first.", { status: 400 });

  const { error: limit } = await supabase.rpc("note_ask");
  if (limit) return new Response(limit.message, { status: 429 });

  const [{ data: tickets }, { data: docs }] = await Promise.all([
    supabase.from("tickets").select("*").returns<Ticket[]>(),
    supabase.from("documents").select("kind, number, ticket_id, customer_name, total, status, issued_on, due_on").order("created_at", { ascending: false }).limit(150),
  ]);
  const all = tickets ?? [];
  const byId = Object.fromEntries(businesses.map((b) => [b.id, b]));
  const open = sortQueue(all, ctx).slice(0, 250);
  const done = all
    .filter((t) => isDone(t, ctx))
    .sort((a, b) => (b.delivered_at ?? "").localeCompare(a.delivered_at ?? ""))
    .slice(0, 60);
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

  const data = [
    `Workspace: ${workspace.name} (${terms.jobs} for ${terms.clients}). Stages in order: ${ctx.stages.map((s) => s.label).join(" → ")}.`,
    `Open ${terms.jobs}, in the order to start them:\n${open.map((t, n) => `${n + 1}. ${line(t, byId[t.business_id]?.name ?? "?", ctx)}`).join("\n") || "None."}`,
    `Recently finished:\n${done.map((t) => line(t, byId[t.business_id]?.name ?? "?", ctx)).join("\n") || "None."}`,
    `${terms.Clients}:\n${businesses.map((b) => [b.name, b.phone, b.email, b.address].filter(Boolean).join(" · ")).join("\n") || "None."}`,
    `Quotes and invoices:\n${(docs ?? [])
      .map((d) => `${d.kind === "quote" ? "Quote Q" : "Invoice INV"}-${String(d.number).padStart(4, "0")} · ${d.customer_name || "no customer"} · ${money(Number(d.total))} · ${d.status}${d.ticket_id ? ` · job #${d.ticket_id}` : ""}${d.due_on ? ` · ${d.kind === "quote" ? "valid until" : "due"} ${formatDate(d.due_on)}` : ""}`)
      .join("\n") || "None."}`,
  ].join("\n\n");

  const system = `You are Ask Oatcake, the helper inside Oatcake, a job tracker for small UK studios and trades. You're talking to ${member.full_name || "the owner"} of ${workspace.name}. Today is ${today}.

Answer two kinds of question:
1. About their work, using only the data below. Be specific: name jobs and customers, give dates and amounts. If the data doesn't say, say so plainly. Never invent jobs, customers or figures.
2. How to do something in Oatcake, using the guide below. Say where to tap in a sentence or two.

Style: UK English, warm and brief, like a capable colleague. Lead with the answer. Keep it under about 120 words unless they ask for a list. Use short bullet lists ("- ") for several items and **bold** sparingly. Link to pages as markdown links with the paths from the guide, for example [Settings](/settings) or [open the job](/tickets/12) for job #12. Never mention AI, models or prompts. You can't change anything yourself yet, so explain how they can. If something seems broken, or you can't help, suggest they [message the Oatcake team](/help).

${GUIDE}

Their data:
${data}`;

  const stream = new Anthropic().messages.stream({
    model: "claude-opus-5-5",
    max_tokens: 1500,
    system,
    output_config: { effort: "low" },
    messages,
  });

  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          for await (const ev of stream) {
            if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") controller.enqueue(encoder.encode(ev.delta.text));
          }
        } catch (e) {
          console.error("ask", e);
          controller.enqueue(encoder.encode("\n\nSorry, Oatcake couldn't answer that just now. Try again in a moment."));
        }
        controller.close();
      },
      cancel() {
        stream.abort();
      },
    }),
    { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } }
  );
}
