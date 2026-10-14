import Link from "next/link";
import Shell from "@/components/Shell";
import { requireMember } from "@/lib/session";
import Viewer3D from "./Viewer3D";

// The 3D viewer: built into Apps for everyone. Open STL files from this computer to turn, zoom and
// light them. Nothing is uploaded; the files are read in the browser.
export default async function ThreeDViewerPage() {
  const { shell } = await requireMember();
  return (
    <Shell {...shell}>
      <p className="eyebrow"><Link href="/apps">Apps</Link></p>
      <h1 className="large app-title">3D viewer</h1>
      <p className="sub">Open STL models to turn, zoom and try different finishes. They stay on your computer.</p>
      <Viewer3D />
    </Shell>
  );
}
