"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/priority";
import { firstTime, pushReady, pushRpc, sendAlert } from "@/lib/push";
import { requireEditor } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export type BriefHelp = {
  brief: string;
  questions: string[];
  styles: { name: string; look: string; search: string }[];
};

const BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["brief", "questions", "styles"],
  properties: {
    brief: { type: "string", description: "The request rewritten as a clear brief, in the client's voice." },
    questions: { type: "array", items: { type: "string" }, description: "Up to 4 short things worth adding that the brief doesn't say yet." },
    styles: {
      type: "array",
      description: "3 or 4 distinct visual directions to look at for references.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "look", "search"],
        properties: {
          name: { type: "string", description: "Two to four words." },
          look: { type: "string", description: "One sentence: colours, type, textures, layout." },
          search: { type: "string", description: "A short image search phrase for finding references." },
        },
      },
    },
  },
} as const;

const SYSTEM = `You help small businesses brief a designer. They often don't know what they want or what to show as references. From their rough idea, write:
- brief: a clear, friendly brief in their voice (first person, "we"), 60 to 140 words. Say what it's for, where it will be seen, the feel, and any wording or dates they gave. Don't invent facts like dates, prices or wording; leave gaps for the questions instead.
- questions: up to 4 short questions about what's missing that would most help the designer (sizes, where it's shown, exact wording, must-haves).
- styles: 3 or 4 distinct visual directions to explore, each with a short name, one sentence on how it looks (colours, type, textures, layout), and a short image search phrase.
UK English, plain and warm. Never mention AI.`;

// "Help me write the brief": turns a rough idea into a clear brief, questions to answer, and style directions.
export async function helpWithBrief(idea: string, type: string): Promise<{ help?: BriefHelp; error?: string }> {
  const text = idea.trim().slice(0, 1500);
  if (text.length < 4) return { error: "Say a few words about what you need first." };
  if (!process.env.ANTHROPIC_API_KEY) return { error: "Brief help isn't switched on yet." };
  const { supabase, workspace } = await requireEditor(["client", "designer"]);
  const { error: limit } = await supabase.rpc("note_brief_help");
  if (limit) return { error: limit.message };

  try {
    const response = await new Anthropic().messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { effort: "low", format: { type: "json_schema", schema: BRIEF_SCHEMA } },
      messages: [{ role: "user", content: `Designer: ${workspace.name}\nKind of job: ${type.slice(0, 80) || "not given"}\n\nWhat we need:\n${text}` }],
    });
    if (response.stop_reason === "refusal") return { error: "That couldn't be helped with. Try describing it differently." };
    const json = response.content.find((b) => b.type === "text")?.text;
    const raw = json ? (JSON.parse(json) as BriefHelp) : null;
    if (!raw?.brief) return { error: "That didn't come out right. Try again." };
    return {
      help: {
        brief: String(raw.brief).slice(0, 2000),
        questions: (raw.questions ?? []).slice(0, 4).map((q) => String(q).slice(0, 200)),
        styles: (raw.styles ?? []).slice(0, 4).map((s) => ({ name: String(s.name).slice(0, 60), look: String(s.look).slice(0, 240), search: String(s.search).slice(0, 80) })),
      },
    };
  } catch (e) {
    console.error("helpWithBrief", e);
    return { error: "Oatcake couldn't help with that just now. Try again in a moment." };
  }
}

// A business changing its own logo and colour (or the studio doing it for them).
export async function saveBrand(businessId: string, logo: string, accent: string | null): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(["client", "designer"]);
  const { error } = await supabase.rpc("set_business_brand", { p_business: businessId, p_logo: logo, p_accent: accent });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return {};
}

// A client just sent a request: alert the people who run the workspace on their phones. Only the
// person who sent it can trigger this, only shortly after, and only once per request.
export async function alertNewRequest(ticketId: number) {
  if (!pushReady()) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email) return;
  const [{ data: me }, { data: ticket }] = await Promise.all([
    supabase.from("members").select("role, full_name").eq("email", email).maybeSingle<{ role: string; full_name: string }>(),
    supabase
      .from("tickets")
      .select("id, title, type, deadline, created_by, created_at, requester_name")
      .eq("id", ticketId)
      .maybeSingle<{ id: number; title: string; type: string; deadline: string; created_by: string; created_at: string; requester_name: string }>(),
  ]);
  if (me?.role !== "client" || !ticket || ticket.created_by !== email) return;
  if (Date.now() - Date.parse(ticket.created_at) > 15 * 60_000) return;
  if (!(await firstTime("new_request", String(ticket.id)))) return;

  const [info] = (await pushRpc<{ business: string; emails: string[] }[]>("push_request_info", { p_ticket: ticket.id })) ?? [];
  if (!info?.emails?.length) return;
  const who = ticket.requester_name || me.full_name || email;
  await sendAlert(
    info.emails,
    {
      title: `New request from ${info.business || who}`,
      body: `${ticket.title} (${ticket.type}), needed by ${formatDate(ticket.deadline)}. Sent by ${who}.`,
      url: `/tickets/${ticket.id}`,
      tag: `ticket-${ticket.id}`,
    },
    "new_requests"
  );
}

// A client added files to a job after sending it: alert the studio on their phones. Only files
// added in the last few minutes count, and each batch alerts once.
export async function alertNewFiles(ticketId: number) {
  if (!pushReady()) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email) return;
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const [{ data: me }, { data: ticket }, { data: files }] = await Promise.all([
    supabase.from("members").select("role, full_name").eq("email", email).maybeSingle<{ role: string; full_name: string }>(),
    supabase.from("tickets").select("id, title").eq("id", ticketId).maybeSingle<{ id: number; title: string }>(),
    supabase
      .from("ticket_files")
      .select("id, name")
      .eq("ticket_id", ticketId)
      .gte("created_at", since)
      .order("id", { ascending: false })
      .returns<{ id: number; name: string }[]>(),
  ]);
  if (me?.role !== "client" || !ticket || !files?.length) return;
  if (!(await firstTime("new_files", `${ticket.id}:${files[0].id}`))) return;

  const [info] = (await pushRpc<{ business: string; emails: string[] }[]>("push_request_info", { p_ticket: ticket.id })) ?? [];
  if (!info?.emails?.length) return;
  const who = me.full_name || email;
  const names = files.slice(0, 3).map((f) => f.name).join(", ") + (files.length > 3 ? ` and ${files.length - 3} more` : "");
  await sendAlert(
    info.emails,
    {
      title: `${who} added ${files.length > 1 ? `${files.length} files` : "a file"} to ${ticket.title}`,
      body: `${names}${info.business ? ` · ${info.business}` : ""}`,
      url: `/tickets/${ticket.id}`,
      tag: `ticket-${ticket.id}-files`,
    },
    "new_requests"
  );
}
