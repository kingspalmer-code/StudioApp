import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // Checks the session token's signature here instead of asking Supabase on every page, and
  // refreshes it when it has run out.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims.sub;

  const path = request.nextUrl.pathname;
  // Request links (/r) and customers' own pages (/c) are for people without an Oatcake login.
  const isPublic = path.startsWith("/login") || path.startsWith("/auth") || path.startsWith("/r/") || path.startsWith("/c/");
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|icons/|sw.js|manifest.webmanifest|api/cron/|brands/|fonts/).*)"],
};
