import { firstTime, pushAdmin, pushReady, sendAlert } from "@/lib/push";
import { todayISO } from "@/lib/priority";

// Vercel runs this each morning (see vercel.json): one alert per person listing their to-dos
// and jobs that are due today or overdue. Nothing is sent to people with nothing due.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Not allowed", { status: 401 });
  if (!pushReady()) return Response.json({ sent: 0, reason: "alerts not set up" });

  const today = todayISO();
  const { data, error } = await pushAdmin().rpc("push_morning_digest", { p_today: today });
  if (error) {
    console.error("morning digest", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as { email: string; tasks: number; jobs: number; first_title: string }[];
  let sent = 0;
  for (const row of rows) {
    if (!(await firstTime("morning", `${row.email}:${today}`))) continue;
    const parts = [
      row.tasks ? `${row.tasks} to-do${row.tasks === 1 ? "" : "s"}` : "",
      row.jobs ? `${row.jobs} job${row.jobs === 1 ? "" : "s"}` : "",
    ].filter(Boolean);
    const total = row.tasks + row.jobs;
    sent += await sendAlert(
      [row.email],
      {
        title: `${parts.join(" and ")} due today or overdue`,
        body: total === 1 ? row.first_title : `Starting with ${row.first_title}.`,
        url: row.jobs && !row.tasks ? "/queue" : "/personal",
        tag: "morning",
      },
      "morning"
    );
  }
  return Response.json({ people: rows.length, sent });
}
