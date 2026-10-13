"use server";

import Anthropic from "@anthropic-ai/sdk";
import { normalizeSetup, SETUP_SCHEMA, type Setup } from "@/lib/setup";
import { createClient } from "@/lib/supabase/server";
import type { WorkspaceKind } from "@/lib/types";

const SYSTEM = `You set up Oatcake workspaces. Oatcake is a simple job tracker for small UK businesses and freelancers: each job moves through stages on a board, has a job type (which sets how many working days it usually needs, so Oatcake can say when to start it), and is created by filling in a short job form.

From what the person says about their work, suggest:
- stages: 3 to 7, in the order a job moves through them. Short labels (one to three words). The first is where a new job lands; the last means the job is finished. Give each a colour; use green for the last one.
- job_types: 3 to 8 kinds of job they actually do, with realistic working days for each, ending with "Other".
- fields: 4 to 12 questions the job form asks, in a sensible order, in the person's own vocabulary. Up to three section headings (kind "heading", use "custom") can group them when the form is long.

For fields, use a built-in field where one fits, set "use" to its key and its label to whatever suits them:
- brief: main description or notes (long text)
- copy: exact wording to use (long text)
- formats: sizes, measurements or deliverables (short text)
- links: links (link)
- colours: colours or mood (short text)
- event_date: the key date, like an event, shoot or go-live date (date)
- site_address: where the job happens (address)
- quote_amount: price, quote, fee or budget (money)
- paid_amount: amount paid so far (money)
- requester_name: who asked for it (short text)
- approver: who signs it off (short text)
- files: photos, drawings or files to upload. Include this whenever uploads make sense.
Anything else is "use": "custom" with a kind from the list; "select" needs at least two options. For built-in fields the kind is ignored, so repeat the built-in's kind. Each built-in key can be used once. Hints are short examples of what to write, or empty. Mark at most two fields as required.

Also give: base, the closest of creative (designers, agencies), photo (photo and video), trades (signwriters, joiners, makers), events (pubs, venues, event planners), content (social media, marketing), personal (anything else); a workspace_name, using their business name if they gave one; and clients_log_in, true only if they say clients or customers send them requests or briefs to work from.

They also say who their work is for. For businesses, the form can ask who at the business asked for it and who signs it off. For members of the public, the customer's name and phone are asked separately, so don't add fields for them. For just themselves, there are no clients: call the work projects, and leave out anything about clients, quotes, payment or sign-off.

Use UK English and plain words. Example for a signwriter: stages Quote sent, Quote paid, Design, Building, Finished; job types Shop fascia 10, Van livery 5, Hand lettering 3, A-board 3, Window vinyl 2, Other 3; fields Size / measurements (formats), Job notes (brief), Site address (site_address), Quote (quote_amount), Photos / drawings (files).`;

export type SuggestResult = { setup?: Setup; error?: string };

// Asks Claude for a workspace setup from a few sentences about someone's work.
const FOR: Record<WorkspaceKind, string> = { studio: "businesses", trade: "members of the public", solo: "just me, no clients" };

export async function suggestSetup(about: string, name: string, mode: WorkspaceKind = "studio"): Promise<SuggestResult> {
  const text = about.trim().slice(0, 1500);
  if (text.length < 10) return { error: "Tell us a little more about what you do." };
  if (!process.env.ANTHROPIC_API_KEY) return { error: "This isn't switched on yet. Start with a blank workspace instead." };

  // Only people setting up their first workspace, a few tries each, with a daily cap across Oatcake.
  const supabase = await createClient();
  const { error: tryError } = await supabase.rpc("note_setup_try");
  if (tryError) return { error: tryError.message };

  try {
    const response = await new Anthropic().messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: "low", format: { type: "json_schema", schema: SETUP_SCHEMA } },
      messages: [{ role: "user", content: `My name: ${name.trim().slice(0, 80) || "not given"}\n\nWho my work is for: ${FOR[mode] ?? FOR.studio}\n\nWhat I do:\n${text}` }],
    });
    if (response.stop_reason === "refusal") return { error: "That couldn't be set up. Try describing it differently, or start with a blank workspace." };
    const json = response.content.find((b) => b.type === "text")?.text;
    const setup = json ? normalizeSetup(JSON.parse(json)) : null;
    if (!setup) return { error: "That didn't come out right. Try again, or start with a blank workspace." };
    return { setup };
  } catch (e) {
    console.error("suggestSetup", e);
    return { error: "Couldn't reach the setup helper just now. Try again, or start with a blank workspace." };
  }
}
