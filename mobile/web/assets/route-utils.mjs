export const BEER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeRoute(value) {
  let candidate = String(value ?? "").trim();
  if (candidate.startsWith("#")) candidate = candidate.slice(1);
  candidate = candidate.split(/[?#]/, 1)[0];
  if (!candidate) return "/";
  if (!candidate.startsWith("/")) candidate = `/${candidate}`;
  return candidate.replace(/\/+$/, "") || "/";
}

export function readRoute(location, home = "/beers") {
  const hash = String(location?.hash ?? "");
  const raw = hash ? hash.slice(1) : String(location?.pathname ?? "");
  const normalized = normalizeRoute(raw);
  return normalized === "/" || normalized === "/index.html" ? home : normalized;
}

export function readRouteWithQuery(location, home = "/beers") {
  const hash = String(location?.hash ?? "");
  const raw = hash ? hash.slice(1) : `${String(location?.pathname ?? "")}${String(location?.search ?? "")}`;
  const path = readRoute(location, home);
  const queryIndex = raw.indexOf("?");
  return queryIndex >= 0 ? `${path}${raw.slice(queryIndex)}` : path;
}

export function parseBeerDetailRoute(path) {
  const match = normalizeRoute(path).match(/^\/beers\/([^/]+)$/i);
  return match && BEER_ID_PATTERN.test(match[1]) ? match[1] : null;
}

export function parseBeerEditRoute(path) {
  const match = normalizeRoute(path).match(/^\/beers\/([^/]+)\/edit$/i);
  return match && BEER_ID_PATTERN.test(match[1]) ? match[1] : null;
}
