import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath, safeNext } from "@/lib/auth/redirects";

/**
 * Runs before every page: refreshes the Supabase session cookie and sends
 * signed-out visitors to sign in. This is an optimistic check only; pages and
 * server actions verify access again, and the database enforces it with RLS.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string) => {
    const target = NextResponse.redirect(new URL(path, request.url));
    for (const cookie of response.cookies.getAll()) target.cookies.set(cookie);
    return target;
  };

  if (!signedIn && !isPublicPath(pathname)) {
    const next = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return redirectTo(`/sign-in${next}`);
  }
  if (signedIn && (pathname === "/sign-in" || pathname === "/sign-up")) {
    return redirectTo(safeNext(request.nextUrl.searchParams.get("next")));
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
