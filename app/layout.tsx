import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Evidra",
  title: {
    default: "Evidra · AI 内容可信度审查",
    template: "%s · Evidra",
  },
  description: "Evidra 是面向 AI 搜索时代的内容可信度审查平台。",
  keywords: ["Evidra", "AI 内容可信度", "Evidence Review", "AI 搜索", "GEO"],
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: "Evidra",
    title: "Evidra · AI 内容可信度审查",
    description: "面向 AI 搜索时代的内容可信度审查平台。",
  },
  appleWebApp: {
    title: "Evidra",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
