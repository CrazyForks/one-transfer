import type { SVGProps } from "react";

export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <rect width="64" height="64" fill="#000" />
      <path
        d="M8 57V7h9.6l12.8 12.8V57h-9.6M36.8 7 56 26.2 36.8 45.4v-9.6H24V16.6h12.8V7Z"
        fill="#fff"
      />
    </svg>
  );
}
