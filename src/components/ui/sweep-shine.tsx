import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

type SweepShineProps = React.ComponentProps<"span"> & {
  active?: boolean;
  asChild?: boolean;
};

const SWEEP_SHINE_CSS = `
  @keyframes sweep-shine-motion {
    0% {
      background-position: 110% 50%;
    }

    65%,
    100% {
      background-position: -10% 50%;
    }
  }

  .sweep-shine {
    -webkit-text-fill-color: transparent;
    background-image: linear-gradient(
      100deg,
      currentColor 0%,
      currentColor 42%,
      rgb(174, 174, 178) 47%,
      rgb(209, 209, 214) 50%,
      rgb(174, 174, 178) 53%,
      currentColor 58%,
      currentColor 100%
    );
    background-position: 110% 50%;
    background-size: 240% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    animation: sweep-shine-motion 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    will-change: background-position;
  }

  @media (prefers-reduced-motion: reduce) {
    .sweep-shine {
      animation: none;
      -webkit-text-fill-color: currentColor;
      background: none;
      will-change: auto;
    }
  }
`;

function SweepShine({
  active = true,
  asChild = false,
  className,
  ...props
}: SweepShineProps) {
  const Comp = asChild ? Slot : "span";

  return (
    <>
      <style href="one-transfer-sweep-shine" precedence="default">
        {SWEEP_SHINE_CSS}
      </style>
      <Comp
        data-slot="sweep-shine"
        className={cn(active && "sweep-shine", className)}
        {...props}
      />
    </>
  );
}

export { SweepShine };
