import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Saves your profile details (photo, menu choices, hints seen and so on). Pages read them from
// your sign-in token rather than asking the sign-in server each time, so the token is renewed
// straight after to carry the new details.
export async function saveProfile(attributes: Parameters<ReturnType<typeof createClient>["auth"]["updateUser"]>[0]) {
  const supabase = createClient();
  const result = await supabase.auth.updateUser(attributes);
  if (!result.error) await supabase.auth.refreshSession();
  return result;
}
