import type { SVGProps } from "react";

export function EvidraBrandMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 36 36"
      className={`evidra-brand-mark ${className ?? ""}`}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path className="evidra-brand-mark-line" d="M14 7H9a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2h5M22 7h5a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2h-5" />
      <circle className="evidra-brand-mark-node" cx="18" cy="18" r="3" />
    </svg>
  );
}
