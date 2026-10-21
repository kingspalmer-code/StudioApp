import type { Access } from "./access";

// staff: an employee the owner sets tasks for. They see their own to-do list, and any areas the owner lets them into.
export type Role = "designer" | "manager" | "client" | "staff";
// A stage key. Each workspace defines its own stages; the last one means finished.
export type Status = string;
export type Priority = "Standard" | "High" | "Urgent";

export type WorkspaceKind = "studio" | "trade" | "solo";
export type Workspace = { id: string; name: string; kind: WorkspaceKind; owner_name: string; profile?: string; request_slug?: string | null; requests_open?: boolean; core_fields?: unknown };
export type Stage = { id: number; key: string; label: string; color: string; position: number };
export type JobType = { id: number; name: string; lead_days: number; position: number };

export type Business = {
  id: string;
  slug: string;
  name: string;
  color: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  logo_url?: string | null;
  accent?: string | null;
  // Customers workspaces: the secret in the link to the customer's own page.
  access_token?: string;
};

export type Member = {
  email: string;
  full_name: string;
  role: Role;
  business_id: string | null;
  // A client's businesses (main one first); only filled in for the signed-in member.
  business_ids?: string[];
  // Whether there are apps they can open (a client's are only their businesses' ones).
  has_apps?: boolean;
  // An employee's access to each area, as the owner set it on Team (lib/access.ts). Signed-in member only.
  permissions?: unknown;
  access?: Access;
  // An employee the owner let into at least one area. On those pages they get the owner's view,
  // shown as Employee (see requireMember); everywhere else they're staff.
  staff?: boolean;
};

export type Ticket = {
  id: number;
  business_id: string;
  created_by: string;
  // The finished job this one follows on from, if it does.
  follows: number | null;
  // Clients and managers the studio picked to keep updated on this job.
  tell: string[];
  requester_name: string;
  title: string;
  type: string;
  formats: string;
  brief: string;
  copy: string;
  links: string;
  colours: string;
  // Empty when the workspace works without dates (Needed by hidden on the job form).
  deadline: string | null;
  event_date: string | null;
  priority: Priority;
  approver: string;
  status: Status;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  delivered_at: string | null;
  quote_amount: number | null;
  paid_amount: number | null;
  site_address: string;
  details: Record<string, unknown>;
};

// What lists of jobs (Queue, Overview, Gallery, a client's requests) load: everything but the long
// written parts of the brief, which only the job's own page shows. Keeps those pages quick as the
// number of finished jobs grows.
export const LIST_COLUMNS = "id, business_id, created_by, follows, tell, requester_name, title, type, deadline, event_date, priority, status, pinned, created_at, updated_at, delivered_at, quote_amount, paid_amount";
export type ListTicket = Omit<Ticket, "formats" | "brief" | "copy" | "links" | "colours" | "approver" | "site_address" | "details">;

export type Note = {
  id: number;
  ticket_id: number;
  author_email: string;
  author_name: string;
  body: string;
  created_at: string;
  // Set when the note is about one of the job's drafts.
  draft_id: number | null;
  // "approval" when it's the client approving a draft.
  kind: "note" | "approval";
};

export type TicketFile = { id: number; ticket_id: number; path: string; name: string };

export type PersonalProject = { id: number; name: string; color: string; archived: boolean };

export type PersonalTask = {
  id: number;
  project_id: number | null;
  title: string;
  notes: string;
  due: string | null;
  flagged: boolean;
  done: boolean;
  done_at: string | null;
  created_at: string;
};

// A to-do on an employee's list (Team). Daily ones come back unticked each day.
export type StaffTask = {
  id: number;
  assignee: string;
  title: string;
  // The owner's notes on what to do.
  details: string;
  due: string | null;
  daily: boolean;
  created_by: string;
  created_at: string;
};

// One ticking-off of a task: one per day for daily tasks. A one-off task is finished once the owner confirms it.
export type StaffTick = { task_id: number; day: string; done: boolean; done_by: string; done_at: string; confirmed_at: string | null };

// The reply chain on a task: notes, asking for sign-off, signing off, and sending it back.
export type StaffNote = { id: number; task_id: number; author: string; author_name?: string; kind: "note" | "ask" | "confirm" | "reopen"; body: string; created_at: string };
