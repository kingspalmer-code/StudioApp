import Link from "next/link";
import { notFound } from "next/navigation";
import Shell from "@/components/Shell";
import Thumb from "@/components/Thumb";
import { formatDate } from "@/lib/priority";
import { FOLDER_ICON_PATH, folderOf, GALLERY_COLUMNS, taggablePeople, tagNames, type GalleryItem } from "@/lib/gallery";
import { canPreview } from "@/lib/preview";
import { signedUrls } from "@/lib/signed";
import { allows } from "@/lib/access";
import { requireMember } from "@/lib/session";
import ItemEdit from "../../[id]/ItemEdit";

// A folder in the Gallery: every picture added together in one go (lib/gallery.ts inFolders), so a
// shoot reads as one thing. Any picture's id opens its folder. Tapping a picture opens it on its own
// page, where you can step through the rest. The studio can caption, tag or take out the whole folder.
export default async function GalleryFolderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) notFound();
  const { supabase, member, businesses, shell, viewing } = await requireMember(undefined, "requests");
  const { data: item } = await supabase.from("gallery_items").select(GALLERY_COLUMNS).eq("id", id).maybeSingle<GalleryItem>();
  if (!item) notFound();
  const studio = member.role === "designer" && !viewing && !shell.readOnly;
  const bizName = new Map(businesses.map((b) => [b.id, b.name]));
  const items = await folderOf(supabase, item);
  const ids = items.map((i) => i.id);
  const [urls, tags, people, { data: by }] = await Promise.all([
    signedUrls(supabase, "deliveries", items.map((i) => i.path)),
    tagNames(supabase, ids),
    studio ? taggablePeople(supabase, member.email, bizName) : Promise.resolve([]),
    supabase.from("members").select("full_name").eq("email", item.added_by).maybeSingle<{ full_name: string }>(),
  ]);
  const first = items[0];
  const title = items.find((i) => i.caption.trim())?.caption || first.name;
  const forName = bizName.get(item.business_id) ?? (member.role === "designer" ? "My business" : "");
  const canGallery = member.role !== "staff" || allows(member.access, "requests");
  // Everyone tagged on any of them, once each.
  const tagged = [...new Map(tags.map((t) => [t.email, t])).values()];
  const allTags = [...new Set(items.flatMap((i) => i.tagged))];

  return (
    <Shell {...shell}>
      {canGallery && <p><Link href="/gallery" className="link">‹ Gallery</Link></p>}
      <h1 className="large gallery-folder-title">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={FOLDER_ICON_PATH} /></svg>
        <span>{title}</span>
      </h1>
      <p className="sub">
        {items.length} {items.length === 1 ? "picture" : "pictures"}
        {forName && <> · For {forName}</>} · Added {formatDate(item.created_at)}{by?.full_name ? ` by ${by.full_name}` : ""}
        {!studio && tagged.length > 0 && <> · Tagged: {tagged.map((t) => (t.email === member.email ? "You" : t.name.split(" ")[0])).join(", ")}</>}
      </p>
      <div className="gallery gallery-folder">
        {items.map((i, n) => (
          <Link key={i.id} href={`/gallery/${i.id}`} className="gallery-card" aria-label={`Picture ${n + 1} of ${items.length}`}>
            <span className="gallery-img">
              {canPreview(i.mime, i.name) ? <Thumb bucket="deliveries" path={i.path} full={urls[i.path] ?? null} video={i.mime.startsWith("video/")} canMake={studio} /> : <span>{i.name}</span>}
            </span>
          </Link>
        ))}
      </div>
      {studio && (
        <div className="gallery-folder-edit">
          <ItemEdit id={ids} caption={first.caption} tagged={allTags} people={people} businessId={item.business_id} />
        </div>
      )}
    </Shell>
  );
}
