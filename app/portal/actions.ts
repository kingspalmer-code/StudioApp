"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { requireEditor } from "@/lib/session";

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
