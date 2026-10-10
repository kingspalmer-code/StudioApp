export type Role = "designer" | "manager" | "client";
export type Status = "new" | "progress" | "review" | "waiting" | "done";
export type Priority = "Standard" | "High" | "Urgent";

export type Business = { id: string; slug: string; name: string; color: string };

export type Member = {
  email: string;
  full_name: string;
  role: Role;
  business_id: string | null;
};

export type Ticket = {
  id: number;
  business_id: string;
  created_by: string;
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
};

export type Note = {
  id: number;
  ticket_id: number;
  author_email: string;
  author_name: string;
  body: string;
  created_at: string;
};

export type TicketFile = { id: number; ticket_id: number; path: string; name: string };
