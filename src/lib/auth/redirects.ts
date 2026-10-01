/**
 * Only allow redirects to paths on this site, so a crafted link like
 * /sign-in?next=https://evil.example can't send people elsewhere.
 */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\"))
    return fallback;
  return next;
}

/** Routes anyone can open without signing in. */
export const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/invite", "/auth", "/dev"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
