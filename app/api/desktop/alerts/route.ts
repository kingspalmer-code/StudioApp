import { formatDate } from "@/lib/priority";
import { createClient } from "@/lib/supabase/server";

// The Mac app can't receive web push, so while it's open it asks here every minute for requests
// clients have sent since it last looked, and shows each one as a Mac notification (see desktop/).
// Only the studio gets these, matching the "new request" phone alert in app/portal/actions.ts.
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const now = new Date().toISOString();
  if (!user) return Response.json({ alerts: [], now });

  const email = (user.email ?? "").toLowerCase();
  const { data: me } = await supabase.from("members").select("role").eq("email", email).maybeSingle<{ role: string }>();
  // Never look back more than a day, so a Mac that's been asleep for a week doesn't pop up everything at once.
  const asked = Date.parse(new URL(req.url).searchParams.get("since") ?? "");
  const since = new Date(Math.max(Number.isFinite(asked) ? asked : Date.now(), Date.now() - 86400000)).toISOString();
  if (me?.role !== "designer") return Response.json({ alerts: [], now });

  const { data: tickets } = await supabase
    .from("tickets")
    .select("id, title, type, deadline, requester_name, created_by, created_at, businesses(name)")
    .gt("created_at", since)
    .neq("created_by", email)
    .order("created_at")
    .limit(10)
    .returns<{ id: number; title: string; type: string; deadline: string | null; requester_name: string; created_by: string; businesses: { name: string } | null }[]>();

  const alerts = (tickets ?? []).map((t) => {
    const who = t.requester_name || t.created_by;
    return {
      title: `New request from ${t.businesses?.name || who}`,
      body: `${t.title} (${t.type})${t.deadline ? `, needed by ${formatDate(t.deadline)}` : ""}. Sent by ${who}.`,
      url: `/tickets/${t.id}`,
    };
  });
  return Response.json({ alerts, now });
}
