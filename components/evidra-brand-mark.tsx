import type { HTMLAttributes } from "react";

export function EvidraBrandMark({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`evidra-brand-mark ${className ?? ""}`}
      aria-hidden="true"
      {...props}
    >
      <svg
        viewBox="0 0 64 64"
        role="img"
        aria-label="Evidra"
        className="evidra-brand-mark-image"
      >
        <rect className="evidra-brand-mark-surface" x="8" y="8" width="48" height="48" rx="16" />
        <path className="evidra-brand-mark-line" d="M20 36c8-14 16-14 24 0" />
        <path className="evidra-brand-mark-line" d="M20 42c8-10 16-10 24 0" />
        <circle className="evidra-brand-mark-node" cx="32" cy="24" r="5" />
      </svg>
    </span>
  );
}
