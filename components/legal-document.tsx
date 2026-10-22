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
          <Link href="/" className="inline-flex items-center gap-2.5 text-sm font-semibold text-[#111827]">
            <EvidraBrandMark className="size-7" />
            Evidra
          </Link>
          <nav className="flex items-center gap-4 text-xs text-[#66707c]" aria-label="法律页面导航">
            <Link href="/privacy" className="hover:text-[#111827]">
              隐私
            </Link>
            <Link href="/terms" className="hover:text-[#111827]">
              条款
            </Link>
          </nav>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <p className="text-xs font-semibold text-[#0f766e]">公开测试版 · 更新于 2026-07-18</p>
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
