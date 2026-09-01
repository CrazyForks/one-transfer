export type RouteKey = "home" | "send" | "receive";

export const ROUTE_TITLES: Record<RouteKey, string> = {
  home: "One Transfer",
  send: "发送 · One Transfer",
  receive: "接收 · One Transfer",
};

export const VIEW_SHELL = "view-shell";
export const PAGE_HEADING = "page-heading";

export function routeFromPath(pathname: string): RouteKey {
  if (pathname === "/send") return "send";
  if (pathname === "/receive") return "receive";
  return "home";
}
