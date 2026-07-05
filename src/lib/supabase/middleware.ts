import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/env";

const PUBLIC_PREFIXES = ["/login", "/auth", "/api/auth"];

/** Refreshes the Supabase session cookie and gates unauthenticated users. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  // Without config we can't talk to Supabase. Let public pages and API routes
  // handle it themselves (login shows a setup hint; APIs return 503); send
  // everything else to /login so protected pages don't crash on a missing key.
  if (!isSupabaseConfigured()) {
    if (isPublicPath || pathname.startsWith("/api")) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
