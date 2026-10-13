"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { openCreate } from "./CreateMenu";
import { SearchIcon } from "./RailNav";
import { openSearch } from "./Search";

// The top bar in the Mac app (desktop/), beside the window buttons: back and forward, the page
// you're on, then Search and New. On bigger screens the bell moves up into its right-hand end
// (see globals.css). It's in every page but only shows when html.in-app is set, so browsers never see it.
export default function AppBar({ links, canCreate, bell }: { links: { href: string; label: string }[]; canCreate: boolean; bell: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [title, setTitle] = useState("");

  // The page's own heading (a job's name, "Queue"), else the section it's in.
  useEffect(() => {
    const section = links.find((l) => pathname === l.href || pathname.startsWith(l.href + "/"))?.label ?? "";
    const read = () => setTitle(document.querySelector("main h1")?.textContent?.trim() || section);
    read();
    const main = document.querySelector("main");
    if (!main) return;
    const watch = new MutationObserver(read);
    watch.observe(main, { childList: true, subtree: true, characterData: true });
    return () => watch.disconnect();
  }, [pathname, links]);

  // Cmd+K searches, as in most Mac apps (S still works too).
  useEffect(() => {
    if (!canCreate) return;
    const key = (e: KeyboardEvent) => {
      if (e.metaKey && !e.altKey && !e.ctrlKey && e.key.toLowerCase() === "k" && document.documentElement.classList.contains("in-app")) {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [canCreate]);

  return (
    <div className={bell ? "app-bar with-bell" : "app-bar"} data-tauri-drag-region="deep">
      <button type="button" className="app-bar-btn" onClick={() => router.back()} aria-label="Back" title="Back (Cmd+[)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
      </button>
      <button type="button" className="app-bar-btn" onClick={() => router.forward()} aria-label="Forward" title="Forward (Cmd+])">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
      </button>
      <span className="app-bar-title">{title}</span>
      {canCreate && (
        <>
          <button type="button" className="app-bar-pill" onClick={openSearch} aria-label="Search" title="Search (Cmd+K)">
            <SearchIcon />
            <span>Search</span>
            <kbd>⌘K</kbd>
          </button>
          <button type="button" className="app-bar-pill app-bar-new" onClick={openCreate} aria-label="New" title="New (N)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            <span>New</span>
          </button>
        </>
      )}
    </div>
  );
}
