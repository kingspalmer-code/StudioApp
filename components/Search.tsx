"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { docNumber, gbp, type DocKind } from "@/lib/documents";
import { createClient } from "@/lib/supabase/client";
import type { WorkspaceKind } from "@/lib/types";
import { openCreate } from "./CreateMenu";

// Search everything: jobs, quotes, invoices, customers, to-dos and Oatcake's own pages, typed or
// spoken. Plain words work ("unpaid invoices for Sarah"): kind and status words narrow the
// results and filler words are ignored. "S" opens it on a keyboard.
const OPEN_EVENT = "oc-search";
export const openSearch = () => window.dispatchEvent(new Event(OPEN_EVENT));

type Kind = "page" | "job" | "doc" | "client" | "task";
type Hit = { kind: Kind; key: string; title: string; sub?: string; href?: string; run?: () => void; words: string; tags: string[]; at?: string };

const GROUP: Record<Kind, string> = { page: "Go to", job: "", doc: "Quotes and invoices", client: "", task: "To-dos" };
const FILLER = new Set("a an the my me i for of to in on with and or show find get open search look looking up all any some please can you what where which who is are was do does that this those these from by".split(" "));
const DOC_STATUS: Record<string, string> = { draft: "Draft", sent: "Sent", accepted: "Accepted", paid: "Paid" };

// Words that say what kind of thing you're after, or what state it's in.
function readQuery(q: string, jobWord: string, clientWord: string) {
  const kinds = new Set<string>();
  const status = new Set<string>();
  const terms: string[] = [];
  for (const raw of q.toLowerCase().replace(/[^\w.\- ]+/g, " ").split(/\s+/).filter(Boolean)) {
    const w = raw.replace(/s$/, "");
    if (w === "invoice" || w === "inv") kinds.add("invoice");
    else if (w === "quote" || w === "estimate") kinds.add("quote");
    else if (w === "job" || w === "request" || w === jobWord) kinds.add("job");
    else if (w === "customer" || w === "client" || w === "busines" || w === clientWord) kinds.add("client");
    else if (w === "task" || w === "todo" || w === "to-do") kinds.add("task");
    else if (raw === "unpaid" || raw === "owed" || raw === "outstanding" || raw === "overdue") status.add("unpaid");
    else if (raw === "paid" || raw === "draft" || raw === "sent" || raw === "accepted") status.add(raw);
    else if (!FILLER.has(raw)) terms.push(raw);
  }
  return { kinds, status, terms };
}

const PAGES = (kind: WorkspaceKind, Job: string): Omit<Hit, "kind" | "key">[] => [
  { title: kind === "studio" ? "Queue" : `${Job}s`, href: "/queue", words: "queue jobs requests projects up next home list", tags: [] },
  { title: "Overview", href: "/overview", words: "overview stats numbers money earnings chart report", tags: [] },
  ...(kind === "solo" ? [{ title: "Gallery", href: "/gallery", words: "gallery finished work portfolio", tags: [] }] : [
    { title: kind === "trade" ? "Customers" : "Businesses", href: "/customers", words: "customers clients businesses contacts", tags: [] },
    { title: "People", href: "/people", words: "people team members access invite", tags: [] },
    { title: "Apps", href: "/apps", words: "apps applications tools pattern backgrounds mailer colours", tags: [] },
  ]),
  { title: "Personal", href: "/personal", words: "personal tasks to-dos todo list projects", tags: [] },
  { title: "Quote and invoice settings", href: "/settings/documents", words: "settings quote invoice style logo vat bank payment terms branding pdf", tags: [] },
  { title: `${Job} form`, href: "/settings/form", words: "settings form fields questions job request", tags: [] },
  { title: "Settings", href: "/settings", words: "settings stages types workflow preferences", tags: [] },
  { title: "Account", href: "/account", words: "account profile photo password sign out appearance theme dark light", tags: [] },
  { title: "Help", href: "/help", words: "help support contact question problem", tags: [] },
];

function useVoice(onText: (text: string, final: boolean) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const rec = useRef<{ start(): void; stop(): void; abort(): void } | null>(null);
  const cb = useRef(onText);
  cb.current = onText;
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown };
    setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => rec.current?.abort();
  }, []);
  const start = () => {
    const w = window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = new Ctor() as any;
    r.lang = navigator.language || "en-GB";
    r.interimResults = true;
    r.continuous = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => {
      let text = "";
      let final = false;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) final = true;
      }
      cb.current(text.trim(), final);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  };
  const stop = () => rec.current?.stop();
  return { listening, supported, start, stop };
}

export default function Search({
  kind,
  Job,
  Client,
  clients,
}: {
  kind: WorkspaceKind;
  Job: string;
  Client: string;
  clients: { id: string; name: string; slug: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [data, setData] = useState<Hit[] | null>(null);
  const [mounted, setMounted] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => setMounted(true), []);

  const voice = useVoice((text) => setQ(text));

  useEffect(() => {
    const show = () => {
      setQ("");
      setSel(0);
      setData(null);
      setOpen(true);
    };
    const onEvent = show;
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      if (!open && !typing && e.key.toLowerCase() === "s" && !document.querySelector("[role=dialog]")) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener(OPEN_EVENT, onEvent);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener(OPEN_EVENT, onEvent);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  // Load what there is to search each time it opens, so it's always current.
  useEffect(() => {
    if (!open || data) return;
    const name = Object.fromEntries(clients.map((c) => [c.id, c.name]));
    const sb = createClient();
    const pages: Hit[] = PAGES(kind, Job).map((p, i) => ({ ...p, kind: "page", key: `p${i}` }));
    const actions: Hit[] = [
      { kind: "page", key: "new", title: `New ${Job.toLowerCase()}, quote or invoice`, run: openCreate, words: `new create add make ${Job} quote invoice task customer invite`, tags: [] },
    ];
    const clientHits: Hit[] = clients.map((c) => ({ kind: "client", key: `c${c.id}`, title: c.name, href: `/queue?view=list&biz=${c.slug}`, words: c.name.toLowerCase(), tags: [] }));
    Promise.all([
      sb.from("tickets").select("id, title, business_id, site_address, status, deadline, updated_at").order("updated_at", { ascending: false }).limit(400),
      sb.from("documents").select("id, kind, number, customer_name, title, status, total, updated_at").order("created_at", { ascending: false }).limit(400),
      sb.from("personal_tasks").select("id, title, done").eq("done", false).limit(200),
    ]).then(
      ([t, d, k]) => {
        const jobs: Hit[] = (t.data ?? []).map((j) => ({
          kind: "job",
          key: `j${j.id}`,
          title: j.title || `Untitled ${Job.toLowerCase()}`,
          sub: [name[j.business_id], j.site_address, j.status].filter(Boolean).join(" · "),
          href: `/tickets/${j.id}`,
          words: [j.title, name[j.business_id], j.site_address, j.status, `#${j.id}`].join(" ").toLowerCase(),
          tags: [],
          at: j.updated_at,
        }));
        const docs: Hit[] = (d.data ?? []).map((x) => {
          const n = docNumber({ kind: x.kind as DocKind, number: x.number });
          return {
            kind: "doc",
            key: `d${x.id}`,
            title: `${x.kind === "quote" ? "Quote" : "Invoice"} ${n}`,
            sub: [x.customer_name, x.title, DOC_STATUS[x.status] ?? x.status, x.total != null ? gbp(Number(x.total)) : ""].filter(Boolean).join(" · "),
            href: `/documents/${x.id}`,
            words: [x.customer_name, x.title, n, String(x.number), x.status, x.total].join(" ").toLowerCase(),
            tags: [x.kind, x.status, x.kind === "invoice" && x.status !== "paid" ? "unpaid" : ""],
            at: x.updated_at,
          };
        });
        const tasks: Hit[] = (k.data ?? []).map((x) => ({ kind: "task", key: `t${x.id}`, title: x.title, href: "/personal", words: x.title.toLowerCase(), tags: [] }));
        setData([...actions, ...pages, ...jobs, ...docs, ...clientHits, ...tasks]);
      },
      () => setData([...actions, ...pages, ...clientHits])
    );
  }, [open, data, clients, kind, Job]);

  const groups = useMemo(() => {
    if (!data) return [];
    const { kinds, status, terms } = readQuery(q, Job.toLowerCase(), Client.toLowerCase());
    const wantKind = (h: Hit) => {
      if (!kinds.size) return true;
      if (h.kind === "doc") return kinds.has(h.tags[0]);
      if (h.kind === "page") return false;
      return kinds.has(h.kind);
    };
    const hits = data.filter((h) => {
      if (status.size && !(h.kind === "doc" && [...status].every((s) => h.tags.includes(s)))) return false;
      if (!wantKind(h) && !(h.kind === "page" && terms.length)) return false;
      const hay = `${h.title.toLowerCase()} ${h.words}`;
      return terms.every((t) => hay.includes(t));
    });
    // With nothing typed: a few shortcuts and the latest work, rather than everything.
    const empty = !q.trim();
    const order: Kind[] = ["page", "job", "doc", "client", "task"];
    const label: Record<Kind, string> = { ...GROUP, job: `${Job}s`, client: kind === "studio" ? "Businesses" : "Customers" };
    return order
      .map((k) => {
        let items = hits.filter((h) => h.kind === k);
        // Best matches first: the whole title, then titles that start with or contain the words.
        if (terms.length) {
          const phrase = terms.join(" ");
          const score = (h: Hit) => {
            const t = h.title.toLowerCase();
            return t === phrase ? 3 : t.startsWith(phrase) ? 2 : terms.every((w) => t.includes(w)) ? 1 : 0;
          };
          items = items.map((h, n) => ({ h, n, s: score(h) })).sort((a, b) => b.s - a.s || a.n - b.n).map((x) => x.h);
        }
        if (empty && k === "page") items = items.slice(0, 1);
        if (empty && (k === "client" || k === "task")) items = [];
        return { kind: k, label: empty && k === "job" ? `Recent ${Job.toLowerCase()}s` : label[k], items: items.slice(0, empty ? 4 : k === "page" ? 3 : 6) };
      })
      .filter((g) => g.items.length);
  }, [data, q, Job, Client, kind]);
  const flat = groups.flatMap((g) => g.items);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    list.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);
  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => input.current?.focus());
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  const close = () => {
    voice.stop();
    setOpen(false);
  };
  const go = (h: Hit | undefined) => {
    if (!h) return;
    close();
    if (h.run) h.run();
    else if (h.href) router.push(h.href);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(flat[sel]);
    }
  };

  if (!mounted) return null;
  let i = -1;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="sr-layer">
          <motion.div className="sr-scrim" onClick={close} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} />
          <motion.div
            className="sr-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            initial={{ opacity: 0, y: -12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.985 }}
            transition={{ type: "spring", stiffness: 520, damping: 40 }}
          >
            <div className="sr-field">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
              <input
                ref={input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKey}
                placeholder={voice.listening ? "Listening…" : `Search ${Job.toLowerCase()}s, invoices${kind === "solo" ? ", to-dos" : kind === "trade" ? ", customers" : ", businesses"}…`}
                aria-label="Search"
                role="combobox"
                aria-expanded="true"
                aria-controls="sr-list"
                aria-activedescendant={flat[sel] ? `sr-${flat[sel].key}` : undefined}
                autoComplete="off"
                enterKeyHint="search"
              />
              {voice.supported && (
                <button
                  type="button"
                  className={voice.listening ? "sr-mic on" : "sr-mic"}
                  onClick={() => (voice.listening ? voice.stop() : (setQ(""), voice.start()))}
                  aria-label={voice.listening ? "Stop listening" : "Search by voice"}
                  aria-pressed={voice.listening}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>
                </button>
              )}
              <button type="button" className="sr-cancel" onClick={close}>Cancel</button>
            </div>
            <div className="sr-list" id="sr-list" role="listbox" ref={list}>
              {!data && <p className="sr-note">Loading…</p>}
              {data && !flat.length && <p className="sr-note">Nothing matches “{q.trim()}”.</p>}
              {groups.map((g) => (
                <div key={g.kind} role="group" aria-label={g.label}>
                  <p className="sr-group">{g.label}</p>
                  {g.items.map((h) => {
                    i++;
                    const n = i;
                    return (
                      <button
                        key={h.key}
                        id={`sr-${h.key}`}
                        data-i={n}
                        type="button"
                        role="option"
                        aria-selected={n === sel}
                        className="sr-item"
                        onMouseMove={() => setSel(n)}
                        onClick={() => go(h)}
                      >
                        <span className="sr-t">{h.title}</span>
                        {h.sub && <span className="sr-s">{h.sub}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            {voice.supported && !q && !voice.listening && <p className="sr-hint">Tap the mic and say something like “unpaid invoices for Sarah”.</p>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
