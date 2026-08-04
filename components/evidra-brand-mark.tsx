import Image from "next/image";
import type { HTMLAttributes } from "react";

export function EvidraBrandMark({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`evidra-brand-mark ${className ?? ""}`}
      aria-hidden="true"
      {...props}
    >
      <Image
        src="/brand/evidra-flower-mark.png"
        alt=""
        width={256}
        height={256}
        className="evidra-brand-mark-image"
        priority
      />
    </span>
  );
}
