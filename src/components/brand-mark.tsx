import type { ImgHTMLAttributes } from "react";

export function BrandMark(props: ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      src={new URL("logo.png", document.baseURI).href}
      alt=""
      aria-hidden="true"
      decoding="async"
      {...props}
    />
  );
}
