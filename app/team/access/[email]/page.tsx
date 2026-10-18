import Link from "next/link";
import { notFound } from "next/navigation";
import FrameChanged from "@/components/FrameChanged";
import Shell from "@/components/Shell";
import { accessFor, type Area } from "@/lib/access";
import { requireMember } from "@/lib/session";
import AccessForm from "../../AccessForm";

// What one employee can see and change, beside the Team page on computers (SplitHost under
// "/team/access") and as its own page on phones. Only the owner gets here.
export default async function EmployeeAccessPage({ params }: { params: Promise<{ email: string }> }) {
  const email = decodeURIComponent((await params).email).toLowerCase();
  const { supabase, terms, workspace, shell, viewing } = await requireMember(["designer"]);
  const { data: person } = await supabase
    .from("members")
    .select("email, full_name, permissions")
    .eq("email", email)
    .eq("role", "staff")
    .maybeSingle<{ email: string; full_name: string; permissions: unknown }>();
  if (!person) notFound();
  const name = person.full_name || person.email;

  const areas: { key: Area; label: string; sub: string }[] = [
    { key: "requests", label: terms.Jobs, sub: `The queue, the overview and every ${terms.job}: notes, drafts and files` },
    ...(workspace.kind === "solo" ? [] : [{ key: "clients" as Area, label: terms.Clients, sub: `Their details, logins and apps` }]),
    { key: "quotes", label: "Quotes & invoices", sub: "Making, sending and marking them paid" },
    { key: "team", label: "Team", sub: "Everyone's to-do lists. Adding people and changing access stays with you." },
    { key: "settings", label: "Settings", sub: `Stages, ${terms.job} types, the ${terms.job} form and the workspace` },
  ];

  return (
    <Shell {...shell}>
      <div style={{ maxWidth: 640 }}>
        <p className="eyebrow settings-back" style={{ textTransform: "none", letterSpacing: 0 }}><Link href="/team">‹ Team</Link></p>
        <h1 className="large">{name.split(" ")[0]}&apos;s access</h1>
        <p className="sub">They always have their own to-do list. Choose what else they can look at, or change too.</p>
        <FrameChanged at={Date.now()} />
        <AccessForm email={person.email} initial={accessFor("staff", person.permissions)} areas={areas} readOnly={viewing} />
      </div>
    </Shell>
  );
}
