export type Role = "designer" | "manager" | "client";
// A stage key. Each workspace defines its own stages; the last one means finished.
export type Status = string;
export type Priority = "Standard" | "High" | "Urgent";

export type WorkspaceKind = "studio" | "trade" | "solo";
export type Workspace = { id: string; name: string; kind: WorkspaceKind; owner_name: string; profile?: string };
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
};

export type Member = {
  email: string;
  full_name: string;
  role: Role;
  business_id: string | null;
  // A client's businesses (main one first); only filled in for the signed-in member.
  business_ids?: string[];
};

export type Ticket = {
  id: number;
  business_id: string;
  created_by: string;
  // The finished job this one follows on from, if it does.
  follows: number | null;
  // A client or manager the studio picked to keep updated on this job.
  notify: string | null;
  requester_name: string;
  title: string;
  type: string;
  formats: string;
  brief: string;
  copy: string;
  links: string;
  colours: string;
  deadline: string;
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

export type Note = {
  id: number;
  ticket_id: number;
  author_email: string;
  author_name: string;
  body: string;
  created_at: string;
  // Set when the note is about one of the job's drafts.
  draft_id: number | null;
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
