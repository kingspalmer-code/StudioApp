"use client";

import { SearchIcon } from "./RailNav";
import { openSearch } from "./Search";

// Search in the phone top bar, beside Ask Oatcake. Bigger screens have it in the rail instead.
export default function SearchButton() {
  return (
    <button type="button" className="bar-search" onClick={openSearch} aria-label="Search" aria-haspopup="dialog">
      <SearchIcon />
    </button>
  );
}
