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

  // A Home Screen app on an iPhone always opens on the page it was added from, which is often the
  // sign-in page. Someone still signed in goes straight on in, keeping any token just renewed above.
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    const home = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => home.cookies.set(cookie));
    return home;
  }

  return response;
}

// The PDF fonts in public/pdf-fonts are fetched by the server itself while it makes a PDF, with no
// login, so they must not be sent to /login. Phones fetch the Home Screen app details without one too.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|icons/|sw.js|home-screen/|api/cron/|brands/|fonts/|pdf-fonts/).*)"],
};
