import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "理据 GEO · 内容体检",
  description: "让内容更容易被 AI 正确理解与引用",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
