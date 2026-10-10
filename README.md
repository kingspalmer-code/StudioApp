# Studio Desk

Design requests for The Brewery Tap, HopRocket, Boomtowers, Motherchip and Queens Brewery.

- **Clients** (staff at each business) sign in and submit requests: brief, exact copy, inspiration links and files, sizes, deadlines, importance. They only ever see their own business's requests.
- **Designer** (Kingsley) gets every request in one queue ranked by when it needs to *start*, plus a board view, status changes, notes, pinning, and a People page to control who can sign in.
- **Manager** gets a read-only overview: workload per business, what's at risk, what's been delivered.

Built with Next.js, hosted on Vercel, with Supabase for sign-in, the database and file storage.

## How the queue is ordered

Each project type has a lead time in working days (`lib/priority.ts`). A request's start-by date is its needed-by date minus that lead time, brought forward 1 day for High and 2 for Urgent. The queue sorts by start-by date, with pinned requests on top.

| Type | Lead time |
| --- | --- |
| Poster | 5 days |
| Social media | 2 days |
| Menu | 5 days |
| Merch | 10 days |
| Website | 12 days |
| Photoshoot | 4 days |
| Other | 3 days |

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of `supabase/schema.sql`, and run it.
3. Still in the SQL Editor, add yourself as the designer (use your real email):
   ```sql
   insert into public.members (email, full_name, role) values ('you@example.com', 'Kingsley', 'designer');
   ```
4. Go to **Authentication > Emails > Templates** ([direct link](https://supabase.com/dashboard/project/_/auth/templates)). In both **Magic Link** and **Confirm signup**, replace the body with:
   ```html
   <h2>Sign in to Studio Desk</h2>
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in</a></p>
   <p>Or enter this code: <strong>{{ .Token }}</strong></p>
   ```
   The code lets people sign in even when their email app opens links in a different browser.
5. Supabase's built-in email sender only allows a few emails an hour. Before inviting clients, connect your own sender under **Authentication > Emails > SMTP Settings** ([Resend](https://resend.com) has a free tier).
6. Copy the **Project URL** and **anon / publishable key** from **Project Settings > API**.

### 2. Vercel

1. At [vercel.com](https://vercel.com), choose **Add New > Project** and import this GitHub repository.
2. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`: the Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the anon / publishable key
   - `NEXT_PUBLIC_TIMEZONE`: `Europe/London` (or your timezone)
3. Deploy.

### 3. Connect the two

In Supabase, go to **Authentication > URL Configuration** and set **Site URL** to your Vercel address (for example `https://studioapp.vercel.app`). Add the same address followed by `/**` under **Redirect URLs**.

### 4. Add people

Sign in, open **People**, and add each client with their business, plus your manager. Only listed emails can sign in.

## Running locally

```bash
cp .env.example .env.local   # fill in the Supabase values
npm install
npm run dev
```

Add `http://localhost:3000/**` to Supabase's Redirect URLs to sign in locally.
