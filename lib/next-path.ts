// Where to go after signing in (/login?next=/habits): only a page on Oatcake itself, never another site.
export function safeNext(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\") || value.startsWith("/login")) return null;
  return value.slice(0, 500);
}
