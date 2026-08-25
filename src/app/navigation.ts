import type * as React from "react";

export type TransitionTo = (to: string) => void;
export type RouteOutletContext = { transitionTo: TransitionTo };

export function handleRouteClick(
  event: React.MouseEvent<HTMLAnchorElement>,
  to: string,
  transitionTo: TransitionTo,
) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  transitionTo(to);
}
