import { pushReady, pushRpc, sendAlert } from "@/lib/push";
import { planWhen } from "@/lib/plan";

const TZ = process.env.NEXT_PUBLIC_TIMEZONE || "Europe/London";

// Calendar reminders and habit nudges. The database calls this every five minutes (migration 040) with the alerts
// secret; push_due_reminders marks each due reminder sent and puts it in the bell, and this sends
// it to the person's phone.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const secrets = [process.env.PUSH_SECRET, process.env.CRON_SECRET].filter(Boolean);
  if (!secrets.some((s) => auth === `Bearer ${s}`)) return new Response("Not allowed", { status: 401 });
  if (!pushReady()) return Response.json({ sent: 0, reason: "alerts not set up" });

  // Habits with a nudge time that's passed today, due today and not logged yet (migration 050).
  // Several landing at once go out as one alert, so a phone never buzzes over and over.
  const habits = await pushRpc<{ id: number; email: string; name: string; kind: string; per_day: number; unit: string }[]>("push_due_habits", { p_tz: TZ });
  const byPerson = new Map<string, NonNullable<typeof habits>>();
  for (const h of Array.isArray(habits) ? habits : []) byPerson.set(h.email, [...(byPerson.get(h.email) ?? []), h]);
  const nudged = await Promise.all(
    [...byPerson.values()].map((hs) => {
      const h = hs[0];
      const alert =
        hs.length > 1
          ? { title: `${hs.length} habits for today`, body: `${hs.map((x) => x.name).join(", ")}. Log any you've done, or skip, no harm done.`, url: "/today", tag: "habits" }
          : {
              title: h.name,
              body: h.kind === "count" ? `Still a few to go today. Tap to log.` : h.kind === "money" ? `How did today's spending go? Slide to log it.` : `Today's the day. Slide to log it, or skip, no harm done.`,
              url: `/habits?h=${h.id}`,
              tag: `habit-${h.id}`,
            };
      return sendAlert([h.email], alert).catch(() => 0);
    })
  );
  const due = await pushRpc<{ id: number; email: string; title: string; parent_title: string | null; on_date: string; at_time: string | null }[]>(
    "push_due_reminders",
    { p_tz: TZ }
  );
  if (!due) return Response.json({ error: "couldn't read reminders" }, { status: 500 });
  const sent = await Promise.all(
    due.map((r) =>
      sendAlert([r.email], {
        title: r.title,
        body: [planWhen(r.on_date, r.at_time), r.parent_title].filter(Boolean).join(" · "),
        url: `/calendar?item=${r.id}`,
        tag: `plan-${r.id}`,
      }).catch(() => 0)
    )
  );
  return Response.json({ due: due.length, sent: sent.reduce((a, b) => a + b, 0), habits: nudged.reduce((a, b) => a + b, 0) });
}
