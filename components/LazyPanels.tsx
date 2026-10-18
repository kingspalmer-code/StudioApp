"use client";

import dynamic from "next/dynamic";

// Search and the Create menu stay hidden until someone opens them, so their code loads just after
// the page instead of with it. Opening one before it has arrived still works (see panel-events.ts).
export const LazySearch = dynamic(() => import("./Search"), { ssr: false });
export const LazyCreateMenu = dynamic(() => import("./CreateMenu"), { ssr: false });
