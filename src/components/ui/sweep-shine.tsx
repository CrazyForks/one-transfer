import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

type SweepShineProps = React.ComponentProps<"span"> & {
  active?: boolean;
  asChild?: boolean;
};

function SweepShine({ active = true, asChild = false, className, ...props }: SweepShineProps) {
  const Comp = asChild ? Slot : "span";
  return <Comp data-slot="sweep-shine" className={cn(active && "sweep-shine", className)} {...props} />;
}

export { SweepShine };
