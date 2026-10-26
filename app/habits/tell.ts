"use server";

import Anthropic from "@anthropic-ai/sdk";
import { requireEditor } from "@/lib/session";
import { HABIT_COLOURS, HABIT_ICONS, type Starter } from "@/lib/habits";

// "Tell Oatcake" on Habits: describe the habits you want in your own words and Oatcake sets each
// one up (how it's logged, how often, when, a nudge time). Nothing is added until they've looked.

const ICONS = Object.keys(HABIT_ICONS);
export type HabitIdea = Starter & { remind_at: string | null };

export async function readHabits(text: string, have: string[]): Promise<{ habits?: HabitIdea[]; summary?: string; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { error: "This isn't switched on yet." };
  const said = text.trim().slice(0, 3000);
  if (!said) return { error: "Type or say the habits you'd like first." };
  const { supabase } = await requireEditor();
  const { error: limit } = await supabase.rpc("note_ai_use", { what: "habits" });
  if (limit) return { error: limit.message.includes("Only the workspace owner") ? "Only the workspace owner can use this for now. You can still add habits with +." : limit.message };
  try {
    const response = await new Anthropic().messages.create({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      system: `You set up habits in a habit tracker from what someone says they want to do. They're in the UK.

Pitch every goal gently: people do better starting comfortably than over-promising, so if they're vague, pick the easier end (e.g. "get back into running" is 2 times a week, not every day). Keep what they explicitly ask for.

For each habit:
- name: short and plain, first letter capitalised ("Running", "Drink water", "Spend under £20").
- kind: "session" when it's done once with an amount (a run in km, yoga in minutes, reading in pages); "count" when it's several small ticks a day (glasses of water, meals, brushing teeth twice); "money" for a daily spending limit.
- unit: for session one of "min", "km", "miles", "pages", "reps", or "" for just done; for count a plural noun like "glasses" or ""; for money "£".
- per_day: for count, how many a day; for money, the daily budget in pounds; otherwise 1.
- labels: for count, names for each one when natural (["Breakfast","Lunch","Dinner"], ["Morning","Night"]), else [].
- freq: "daily" (every day), "days" (set weekdays, in days as 0 = Monday to 6 = Sunday), or "times" (times_per times every period_weeks weeks, any days). Unused ones: days [], times_per 1, period_weeks 1.
- part: "morning", "afternoon", "evening" or "any".
- remind_at: "HH:MM" if they mention a time or it's obvious (teeth at night 21:30), else null.
- icon: one of ${ICONS.join(", ")}. colour: one of ${HABIT_COLOURS.join(", ")}, different ones for different habits where you can.
Skip any they already have: ${have.length ? have.join(", ") : "none yet"}. Don't invent habits they didn't mention.
summary: one short plain sentence confirming what you set up.`,
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["summary", "habits"],
            properties: {
              summary: { type: "string" },
              habits: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["name", "kind", "unit", "per_day", "labels", "freq", "days", "times_per", "period_weeks", "part", "remind_at", "icon", "colour"],
                  properties: {
                    name: { type: "string" },
                    kind: { type: "string", enum: ["session", "count", "money"] },
                    unit: { type: "string" },
                    per_day: { type: "number" },
                    labels: { type: "array", items: { type: "string" } },
                    freq: { type: "string", enum: ["daily", "days", "times"] },
                    days: { type: "array", items: { type: "integer" } },
                    times_per: { type: "integer" },
                    period_weeks: { type: "integer" },
                    part: { type: "string", enum: ["morning", "afternoon", "evening", "any"] },
                    remind_at: { type: ["string", "null"] },
                    icon: { type: "string", enum: ICONS },
                    colour: { type: "string", enum: HABIT_COLOURS },
                  },
                },
              },
            },
          },
        },
      },
      messages: [{ role: "user", content: said }],
    });
    const out = JSON.parse(response.content.find((b) => b.type === "text")?.text ?? "{}");
    const habits: HabitIdea[] = (Array.isArray(out.habits) ? out.habits : [])
      .map((h: Record<string, unknown>) => ({
        name: String(h.name ?? "").trim().slice(0, 80),
        kind: ["session", "count", "money"].includes(h.kind as string) ? h.kind : "session",
        icon: ICONS.includes(h.icon as string) ? h.icon : "spark",
        colour: HABIT_COLOURS.includes(h.colour as string) ? h.colour : HABIT_COLOURS[0],
        unit: String(h.unit ?? "").slice(0, 20),
        per_day: Math.max(1, Math.min(100000, Number(h.per_day) || 1)),
        labels: Array.isArray(h.labels) ? h.labels.map((l) => String(l).slice(0, 30)).filter(Boolean).slice(0, 12) : [],
        freq: ["daily", "days", "times"].includes(h.freq as string) ? h.freq : "daily",
        days: Array.isArray(h.days) ? [...new Set(h.days.map(Number).filter((d) => d >= 0 && d <= 6))] : [],
        times_per: Math.max(1, Math.min(21, Math.round(Number(h.times_per) || 1))),
        period_weeks: Math.max(1, Math.min(8, Math.round(Number(h.period_weeks) || 1))),
        part: ["morning", "afternoon", "evening", "any"].includes(h.part as string) ? h.part : "any",
        remind_at: typeof h.remind_at === "string" && /^\d{2}:\d{2}$/.test(h.remind_at) ? h.remind_at : null,
      }))
      .map((h: HabitIdea) => (h.freq === "days" && !h.days.length ? { ...h, freq: "daily" as const } : h))
      .filter((h: HabitIdea) => h.name)
      .slice(0, 20);
    if (!habits.length) return { error: "Oatcake couldn't find a habit in that. Try saying it another way." };
    return { habits, summary: String(out.summary ?? "").trim().slice(0, 400) };
  } catch (e) {
    console.error("readHabits", e);
    return { error: "Oatcake couldn't read that just now. Try again in a moment." };
  }
}
