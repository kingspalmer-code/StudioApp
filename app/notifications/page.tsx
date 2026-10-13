import Shell from "@/components/Shell";
import { requireMember } from "@/lib/session";
import AllNotifications from "./AllNotifications";

// Every notification, not just the latest few the bell shows.
export default async function NotificationsPage() {
  const { shell } = await requireMember();
  return (
    <Shell {...shell}>
      <div style={{ maxWidth: 720 }}>
        <h1 className="large">Notifications</h1>
        <p className="sub">What other people have done on your jobs: new requests, notes and replies, approvals, files and drafts.</p>
        <AllNotifications />
      </div>
    </Shell>
  );
}
