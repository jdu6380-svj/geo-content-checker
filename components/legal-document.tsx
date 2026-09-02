import Link from "next/link";
import type { ReactNode } from "react";

import { EvidraBrandMark } from "@/components/evidra-brand-mark";

type LegalSection = {
  title: string;
  content: ReactNode;
};

type LegalDocumentProps = {
  title: string;
  summary: string;
  sections: LegalSection[];
};

export function LegalDocument({ title, summary, sections }: LegalDocumentProps) {
  return (
    <main className="min-h-screen bg-[#f8fafc] text-[#111827]">
      <header className="border-b border-[#e5e7eb] bg-white">
        <div className="mx-auto flex min-h-16 max-w-3xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" className="inline-flex min-h-10 items-center gap-2.5 rounded-md px-1 text-sm font-semibold text-[#111827] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--geo-focus-ring)]">
            <EvidraBrandMark className="size-7" />
            Evidra
          </Link>
          <nav className="flex items-center gap-4 text-xs text-[#66707c]" aria-label="法律页面导航">
            <Link href="/privacy" className="inline-flex min-h-10 items-center rounded-md px-2 hover:text-[#111827] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--geo-focus-ring)]">
              隐私
            </Link>
            <Link href="/terms" className="inline-flex min-h-10 items-center rounded-md px-2 hover:text-[#111827] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--geo-focus-ring)]">
              条款
            </Link>
            <Link href="/support" className="inline-flex min-h-10 items-center rounded-md px-2 hover:text-[#111827] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--geo-focus-ring)]">
              支持
            </Link>
          </nav>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <p className="text-xs font-semibold text-[var(--geo-primary)]">服务说明 · 更新于 2026-08-30</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal text-[#111827]">{title}</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[#5f6975]">{summary}</p>

        <div className="mt-10 space-y-9">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-base font-semibold text-[#111827]">{section.title}</h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-[#4b5563]">
                {section.content}
              </div>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
