import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Oatcake admins looking inside another workspace send it along; the database ignores it for everyone else.
export const VIEW_COOKIE = "view_ws";
// The studio previewing its request pages as one of its clients would see them (a business id).
export const PREVIEW_COOKIE = "preview_biz";

export async function createClient() {
  const cookieStore = await cookies();
  const viewing = cookieStore.get(VIEW_COOKIE)?.value;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(viewing ? { global: { headers: { "x-oatcake-workspace": viewing } } } : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component; the middleware refreshes the session instead.
          }
        },
      },
    }
  );
}
