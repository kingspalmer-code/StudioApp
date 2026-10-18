import { pushReady, pushRpc, sendAlert } from "@/lib/push";
import { planWhen } from "@/lib/plan";

const TZ = process.env.NEXT_PUBLIC_TIMEZONE || "Europe/London";

// Calendar reminders. The database calls this every five minutes (migration 040) with the alerts
// secret; push_due_reminders marks each due reminder sent and puts it in the bell, and this sends
// it to the person's phone.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const secrets = [process.env.PUSH_SECRET, process.env.CRON_SECRET].filter(Boolean);
  if (!secrets.some((s) => auth === `Bearer ${s}`)) return new Response("Not allowed", { status: 401 });
  if (!pushReady()) return Response.json({ sent: 0, reason: "alerts not set up" });

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
  return Response.json({ due: due.length, sent: sent.reduce((a, b) => a + b, 0) });
}
