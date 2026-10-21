import Shell from "@/components/Shell";
import HomeBlocks from "@/components/HomeBlocks";
import { requireMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { LIST_COLUMNS, type ListTicket } from "@/lib/types";

// The Queue: Up next and the widgets above it to start with, and whatever else the owner puts on
// it with Customise (lib/layouts.ts).
export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; biz?: string; tour?: string }>;
}) {
  const { view, biz, tour } = await searchParams;
  // The jobs load alongside the session rather than after it; the database only returns what this login may see.
  const db = await createClient();
  const [session, { data }] = await Promise.all([
    requireMember(["designer", "manager"], "requests"),
    db.from("tickets").select(LIST_COLUMNS).returns<ListTicket[]>(),
  ]);
  return (
    <Shell {...session.shell}>
      <HomeBlocks session={session} all={data ?? []} page="queue" title="Queue" view={view} biz={biz} tour={tour} />
    </Shell>
  );
}
