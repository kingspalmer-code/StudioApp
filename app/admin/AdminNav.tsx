import Link from "next/link";

// Tabs across the top of the admin area.
export default function AdminNav({ current, unread = 0 }: { current: "overview" | "people" | "support" | "workspaces"; unread?: number }) {
  const tabs = [
    { key: "overview", href: "/admin", label: "Overview" },
    { key: "people", href: "/admin/people", label: "People" },
    { key: "support", href: "/admin/support", label: unread ? `Support · ${unread}` : "Support" },
    { key: "workspaces", href: "/admin/workspaces", label: "Workspaces" },
  ];
  return (
    <nav className="seg admin-nav" aria-label="Admin">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === current ? "page" : undefined}>{t.label}</Link>
      ))}
    </nav>
  );
}
