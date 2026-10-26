import { firstTime, pushReady, pushRpc, sendAlert } from "@/lib/push";
import { todayISO } from "@/lib/priority";

// Vercel runs this each morning (see vercel.json): one gentle alert per person with something on
// for today (or still waiting from earlier days), naming just the first thing and opening Today.
// It never counts what's late. Nothing is sent to people with nothing on.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Not allowed", { status: 401 });
  if (!pushReady()) return Response.json({ sent: 0, reason: "alerts not set up" });

  const today = todayISO();
  const data = await pushRpc<{ email: string; tasks: number; jobs: number; first_title: string }[]>("push_morning_digest", { p_today: today });
  if (!data) return Response.json({ error: "couldn't read what's due" }, { status: 500 });
  const rows = data;
  let sent = 0;
  for (const row of rows) {
    if (!(await firstTime("morning", `${row.email}:${today}`))) continue;
    sent += await sendAlert(
      [row.email],
      {
        title: "Good morning",
        body: row.tasks + row.jobs > 1 ? `One small start: ${row.first_title}. Today has the rest.` : `One small start: ${row.first_title}.`,
        url: "/today",
        tag: "morning",
      },
      "morning"
    );
  }
  return Response.json({ people: rows.length, sent });
}
