/** Static product introduction only. A return destination always means an action was chosen. */
export function isPublicWelcomePath(pathname: string, params: Pick<URLSearchParams, "get" | "has">) {
  if (params.has("returnTo") || params.get("next") === "explore") return false;
  if (pathname === "/harumadi/example") return true;
  if (pathname !== "/" && pathname !== "/entry") return false;
  const mode = params.get("mode");
  return !mode || mode === "guide";
}
