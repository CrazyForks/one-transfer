import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

function Slider({
  className,
  "aria-label": ariaLabel,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn("slider-style-01", className)}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="slider-style-02"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="slider-style-03"
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        aria-label={ariaLabel}
        className="slider-style-04"
      />
    </SliderPrimitive.Root>
  );
}

export { Slider };
