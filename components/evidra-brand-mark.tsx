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
      <rect className="evidra-brand-mark-surface" x="1" y="1" width="34" height="34" rx="9" />
      <path className="evidra-brand-mark-line" d="M10.5 9.5v17M10.5 10h13M10.5 18h10M10.5 26h13" />
      <circle className="evidra-brand-mark-node" cx="25.5" cy="10" r="1.75" />
      <circle className="evidra-brand-mark-node" cx="22.5" cy="18" r="1.75" />
      <circle className="evidra-brand-mark-node" cx="25.5" cy="26" r="1.75" />
    </svg>
  );
}
