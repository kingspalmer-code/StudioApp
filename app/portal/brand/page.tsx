import Link from "next/link";
import { redirect } from "next/navigation";
import Shell from "@/components/Shell";
import { brandFor } from "@/lib/brands";
import { requireEditor } from "@/lib/session";
import BrandForm from "./BrandForm";

// A business sets its own logo and colour, which theme its portal and its cards in the studio's queue.
export default async function BrandPage() {
  const { member, businesses, shell } = await requireEditor(["client"]);
  const biz = businesses.find((b) => b.id === member.business_id);
  if (!biz) redirect("/portal");
  const brand = brandFor(biz);

  return (
    <Shell {...shell}>
      <div style={{ maxWidth: 560 }}>
        <p className="eyebrow" style={{ textTransform: "none", letterSpacing: 0 }}><Link href="/portal">‹ Requests</Link></p>
        <h1 className="large">Your logo and colour</h1>
        <p className="sub">They appear on your portal and on your requests in {shell.workspace.owner_name || "the studio"}&apos;s list.</p>
        <BrandForm biz={{ id: biz.id, name: biz.name }} shownLogo={brand.logo ?? ""} ownLogo={biz.logo_url ?? ""} accent={biz.accent ?? brand.color} custom={Boolean(biz.accent || biz.logo_url)} />
      </div>
    </Shell>
  );
}
