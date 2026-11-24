import Link from "next/link";
import { notFound } from "next/navigation";
import Shell from "@/components/Shell";
import { formatDate } from "@/lib/priority";
import { folderOf, GALLERY_COLUMNS, taggablePeople, tagNames, type GalleryItem } from "@/lib/gallery";
import { fileSize, isImage, isVideo } from "@/lib/deliveries";
import { downloadUrl, signedUrls } from "@/lib/signed";
import { allows } from "@/lib/access";
import { requireMember } from "@/lib/session";
import ItemEdit from "./ItemEdit";

// One picture added straight to the Gallery: the picture, its caption, who it's for and who's tagged.
// Anyone who can see it lands here, including an employee tagged on it from a notification. The
// studio can change the caption and tags, or take it out. A picture added with others belongs to
// their folder: this links back to it and steps to the one before or after.
export default async function GalleryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) notFound();
  const { supabase, member, businesses, shell, viewing } = await requireMember(undefined, "requests");
  const { data: item } = await supabase.from("gallery_items").select(GALLERY_COLUMNS).eq("id", id).maybeSingle<GalleryItem>();
  if (!item) notFound();
  const studio = member.role === "designer" && !viewing && !shell.readOnly;
  const bizName = new Map(businesses.map((b) => [b.id, b.name]));
  const [view, download, tags, people, folder] = await Promise.all([
    signedUrls(supabase, "deliveries", [item.path]).then((u) => u[item.path] ?? null),
    downloadUrl(supabase, "deliveries", item.path, item.name),
    tagNames(supabase, [item.id]),
    studio ? taggablePeople(supabase, member.email, bizName) : Promise.resolve([]),
    folderOf(supabase, item),
  ]);
  const inFolder = folder.length > 1;
  const at = folder.findIndex((i) => i.id === item.id);
  const prev = inFolder && at > 0 ? folder[at - 1] : null;
  const next = inFolder && at < folder.length - 1 ? folder[at + 1] : null;
  const folderHref = `/gallery/folder/${folder[0].id}`;
  const folderName = folder.find((i) => i.caption.trim())?.caption || "Folder";
  const { data: by } = await supabase.from("members").select("full_name").eq("email", item.added_by).maybeSingle<{ full_name: string }>();
  const forName = bizName.get(item.business_id) ?? (member.role === "designer" ? "My business" : "");
  // Employees only get the Gallery itself if they may look at jobs.
  const canGallery = member.role !== "staff" || allows(member.access, "requests");

  return (
    <Shell {...shell}>
      {inFolder ? (
        <p><Link href={folderHref} className="link">‹ {folderName}</Link></p>
      ) : (
        canGallery && <p><Link href="/gallery" className="link">‹ Gallery</Link></p>
      )}
      <h1 className="large">{item.caption || item.name}</h1>
      <p className="sub">
        {forName && <>For {forName} · </>}
        Added {formatDate(item.created_at)}{by?.full_name ? ` by ${by.full_name}` : ""}
      </p>
      <div className="gallery-piece">
        {view && isImage(item) ? (
          <a href={view} target="_blank" rel="noreferrer"><img src={view} alt={item.caption || item.name} /></a>
        ) : view && isVideo(item) ? (
          <video src={view} controls playsInline preload="metadata" />
        ) : (
          <div className="group"><div className="empty">{item.name}</div></div>
        )}
      </div>
      {inFolder && (
        <nav className="gallery-step" aria-label="Pictures in this folder">
          {prev ? <Link href={`/gallery/${prev.id}`} className="btn plain small" aria-label="Previous picture">‹</Link> : <span className="btn plain small" aria-hidden="true">‹</span>}
          <span className="when">{at + 1} of {folder.length}</span>
          {next ? <Link href={`/gallery/${next.id}`} className="btn plain small" aria-label="Next picture">›</Link> : <span className="btn plain small" aria-hidden="true">›</span>}
        </nav>
      )}
      <div className="gallery-piece-actions">
        {download && <a className="btn plain small" href={download}>Download</a>}
        <span className="when">{item.name}{item.size ? ` · ${fileSize(item.size)}` : ""}</span>
      </div>
      {studio ? (
        <ItemEdit id={item.id} caption={item.caption} tagged={item.tagged} people={people} businessId={item.business_id} back={inFolder ? `/gallery/folder/${(next ?? prev)!.id}` : "/gallery"} />
      ) : (
        tags.length > 0 && (
          <>
            <p className="eyebrow">Tagged</p>
            <div className="group"><div className="row"><div className="ctl">{tags.map((t) => (t.email === member.email ? "You" : t.name)).join(", ")}</div></div></div>
          </>
        )
      )}
    </Shell>
  );
}
