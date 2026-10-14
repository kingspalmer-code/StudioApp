import Link from "next/link";
import FrameChanged from "@/components/FrameChanged";

// The top of a Settings section: a way back to the list (on phones; on computers the section
// opens beside the list, see app/settings/page.tsx, and this is hidden), then its title. Saving
// something here tells the Settings list beside it to catch up (components/FrameChanged.tsx).
export default function SectionHead({ title, sub }: { title: string; sub?: React.ReactNode }) {
  return (
    <>
      <p className="eyebrow settings-back" style={{ textTransform: "none", letterSpacing: 0 }}><Link href="/settings">‹ Settings</Link></p>
      <h1 className="large">{title}</h1>
      {sub && <p className="sub">{sub}</p>}
      <FrameChanged at={Date.now()} />
    </>
  );
}
