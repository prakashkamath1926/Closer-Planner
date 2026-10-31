import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";
import { validateNextParam } from "@/lib/auth/redirect";

/**
 * Next.js 16 Proxy (Middleware Replacement).
 *
 * Plumbs @supabase/ssr session refresh on all matched requests.
 * Evaluates route protections and redirections:
 * - Reads user on server with supabase.auth.getUser(), NEVER getSession().
 * - Protected routes (/dashboard, /plan/:path*) require a session (anonymous counts).
 * - /login and /signup redirect signed-in non-anonymous users.
 * - PUBLIC routes stay public: /, /r/[token], /contribute/[token], /api/recipient/*, /auth/callback.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const pathname = request.nextUrl.pathname;

  // Static assets bypass proxy
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|woff2?|ico)$/)
  ) {
    return response;
  }

  const env = getPublicEnv();

  // Create cookie-based supabase client for session refresh
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Read user securely via getUser() (never getSession() on server)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1. Redirect signed-in non-anonymous users away from /login and /signup
  if (pathname === "/login" || pathname === "/signup") {
    if (user && !user.is_anonymous) {
      const nextParam = request.nextUrl.searchParams.get("next");
      const destination = validateNextParam(nextParam, "/");
      return NextResponse.redirect(new URL(destination, request.url));
    }
    return response;
  }

  // 2. Public routes stay public: landing, /r/[token], /contribute/[token], /api/recipient/*, /auth/callback, /forgot-password, /reset-password
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/r/") ||
    pathname.startsWith("/contribute/") ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/api/recipient/") ||
    pathname.startsWith("/api/letters/contribute/") ||
    pathname.startsWith("/api/intake");

  if (isPublic) {
    return response;
  }

  // 3. Protected routes: /dashboard, /plan/:path*
  // Require a session (anonymous counts).
  const isProtected = pathname.startsWith("/plan/") || pathname.startsWith("/dashboard");
  if (isProtected) {
    if (!user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

