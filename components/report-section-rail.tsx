"use client";

import { BarChart3, FileSearch, ListChecks, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

type ReportSectionId = "report-core" | "diagnostic-section" | "evidence-section" | "patch-workshop";

type ReportSectionRailProps = {
  completedCount: number;
  totalCount: number;
  evidenceCount: number;
  patchAvailable: boolean;
  onScrollToSection: (sectionId: string) => void;
};

const SECTIONS = [
  { id: "report-core", label: "报告结论", description: "评分与最大风险", icon: BarChart3 },
  { id: "evidence-section", label: "Evidence", description: "核对原文依据", icon: FileSearch },
  { id: "diagnostic-section", label: "关键诊断", description: "逐项理解问题", icon: ListChecks },
  { id: "patch-workshop", label: "修改建议", description: "生成辅助材料", icon: Sparkles },
] as const;

export function ReportSectionRail({
  completedCount,
  totalCount,
  evidenceCount,
  patchAvailable,
  onScrollToSection,
}: ReportSectionRailProps) {
  const [activeSection, setActiveSection] = useState<ReportSectionId>("report-core");

  useEffect(() => {
    const elements = SECTIONS.map(({ id }) => document.getElementById(id)).filter(
      (element): element is HTMLElement => Boolean(element),
    );
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visibleEntry?.target.id) setActiveSection(visibleEntry.target.id as ReportSectionId);
      },
      { rootMargin: "-18% 0px -64% 0px", threshold: [0.01, 0.2, 0.6] },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  const meta: Record<ReportSectionId, string> = {
    "report-core": "当前结论",
    "diagnostic-section": totalCount ? `${completedCount} / ${totalCount}` : "等待结果",
    "evidence-section": evidenceCount ? `${evidenceCount} 条依据` : "等待依据",
    "patch-workshop": patchAvailable ? "可以进入" : "等待正文",
  };

  return (
    <aside className="report-section-rail surface-flat" aria-label="报告工作区导航">
      <div className="report-section-rail-heading">
        <p className="section-kicker">WORKSPACE</p>
        <h2>报告导航</h2>
      </div>
      <nav className="report-section-nav" aria-label="报告章节">
        {SECTIONS.map(({ id, label, description, icon: Icon }, index) => {
          const active = activeSection === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setActiveSection(id);
                onScrollToSection(id);
              }}
              aria-current={active ? "location" : undefined}
              className={`report-section-link ${active ? "is-active" : ""}`}
            >
              <span className="report-section-number">{String(index + 1).padStart(2, "0")}</span>
              <span className="report-section-icon"><Icon aria-hidden="true" className="size-3.5" /></span>
              <span className="report-section-copy">
                <span className="report-section-label">{label}</span>
                <span className="report-section-description">{description}</span>
              </span>
              <span className="report-section-meta">{meta[id]}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
