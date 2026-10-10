import Link from "next/link";
import { signOut } from "@/app/actions";
import type { Member } from "@/lib/types";
import NavLinks from "./NavLinks";

const LINKS = {
  designer: [
    { href: "/queue", label: "Queue" },
    { href: "/overview", label: "Overview" },
    { href: "/portal", label: "New request" },
    { href: "/people", label: "People" },
  ],
  manager: [{ href: "/overview", label: "Overview" }],
  client: [{ href: "/portal", label: "Requests" }],
};

export default function Shell({ member, children }: { member: Member; children: React.ReactNode }) {
  return (
    <>
      <header className="bar">
        <div className="bar-in">
          <Link href="/" className="brand">
            <i aria-hidden="true" />
            Studio Desk
          </Link>
          <NavLinks links={LINKS[member.role]} />
          <form action={signOut} className="who">
            <span>{member.full_name || member.email}</span>
            <button className="link" type="submit">Sign out</button>
          </form>
        </div>
      </header>
      <main>{children}</main>
    </>
  );
}
