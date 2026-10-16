import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Evidra",
  title: {
    default: "Evidra · 智能内容可信度审查",
    template: "%s · Evidra",
  },
    description: "Evidra 是面向智能搜索时代的内容可信度审查平台。",
    keywords: ["Evidra", "内容可信度", "证据审查", "智能搜索"],
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: "Evidra",
    title: "Evidra · 智能内容可信度审查",
    description: "面向智能搜索时代的内容可信度审查平台。",
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
