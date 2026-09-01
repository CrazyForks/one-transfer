import { useLayoutEffect, useRef, type ReactNode } from "react";
import { gsap } from "gsap";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type SegmentedTab = {
  value: string;
  label: ReactNode;
};

export function SegmentedTabs({
  value,
  onValueChange,
  items,
  ariaLabel,
  className,
  listClassName,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  items: readonly [SegmentedTab, SegmentedTab];
  ariaLabel: string;
  className?: string;
  listClassName?: string;
  children?: ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    const indicator = indicatorRef.current;
    const trigger = list?.querySelector<HTMLElement>(`[data-tab-value="${value}"]`);
    if (!list || !indicator || !trigger) return;
    const tween = gsap.to(indicator, {
      x: trigger.offsetLeft - 4,
      width: trigger.offsetWidth,
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 0.14,
      ease: "power3.out",
      overwrite: "auto",
    });
    return () => {
      tween.kill();
    };
  }, [value]);

  return (
    <Tabs value={value} onValueChange={onValueChange} className={className}>
      <TabsList ref={listRef} className={cn("app-style-25", listClassName)} aria-label={ariaLabel}>
        <span ref={indicatorRef} className="app-style-26" />
        {items.map((item) => (
          <TabsTrigger key={item.value} value={item.value} data-tab-value={item.value}>
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </Tabs>
  );
}
