-- Who to keep updated on a job the studio added. When the studio logs a job for a business, it
-- can pick one of that business's clients or managers to tell about it; that person is also told
-- when the job is sent for review or finished, as if they'd sent it themselves.

alter table public.tickets add column if not exists notify text references public.members (email) on delete set null on update cascade;
