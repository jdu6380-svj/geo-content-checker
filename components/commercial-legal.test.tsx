import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TermsPage from "@/app/terms/page";
import PrivacyPage from "@/app/privacy/page";
import SupportPage from "@/app/support/page";

afterEach(() => vi.unstubAllEnvs());

describe("commercial legal and support routes", () => {
  it("describes one-time Alipay entitlement and manual refund review without guarantees", () => {
    render(<TermsPage />);
    expect(screen.getByText("支付宝套餐与额度")).toBeTruthy();
    expect(screen.getByText(/面向 B2B SaaS 内容、增长与品牌团队/)).toBeTruthy();
    expect(screen.getByText(/工作区共享额度/)).toBeTruthy();
    expect(screen.getByText(/一次性套餐不是自动续费订阅/)).toBeTruthy();
    expect(screen.getByText(/退款申请先进入人工审核/)).toBeTruthy();
    expect(screen.queryByText(/自动退款|保证.*小时/)).toBeNull();
  });

  it("documents commercial account, private result and payment records", () => {
    render(<PrivacyPage />);
    expect(screen.getByText("账户、工作区与支付")).toBeTruthy();
    expect(screen.getByText(/私有结果存储/)).toBeTruthy();
    expect(screen.getByText(/客户端不会获得支付宝私钥/)).toBeTruthy();
  });

  it("uses only validated public support configuration and exposes legal navigation", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "support@example.test");
    vi.stubEnv("NEXT_PUBLIC_FEEDBACK_URL", "https://feedback.example.test/form");
    render(<SupportPage />);
    expect(screen.getByRole("link", { name: "support@example.test" }).getAttribute("href")).toBe("mailto:support@example.test");
    expect(screen.getByRole("link", { name: "打开安全反馈入口" }).getAttribute("href")).toBe("https://feedback.example.test/form");
    expect(screen.getByRole("link", { name: "隐私" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "条款" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "支持" })).toBeTruthy();
  });

  it("keeps legal header navigation touch targets and focus styles discoverable", () => {
    render(<TermsPage />);
    const navigation = screen.getByRole("navigation", { name: "法律页面导航" });
    for (const link of navigation.querySelectorAll("a")) {
      expect(link.className).toContain("min-h-10");
      expect(link.className).toContain("focus-visible:outline-2");
    }
  });
});
