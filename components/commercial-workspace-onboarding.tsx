"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type OnboardingState =
  | "loading"
  | "organization_required"
  | "organization_admin_required"
  | "bootstrap_required"
  | "membership_required"
  | "ready"
  | "error";

type Payload = { state?: OnboardingState; error?: string };

const stateCopy: Partial<Record<OnboardingState, string>> = {
  organization_required: "请先创建或选择一个 Clerk 组织，作为内容团队工作区。",
  organization_admin_required: "当前组织尚未建立工作区，请由组织管理员先完成设置。",
  bootstrap_required: "当前组织可以创建新的团队工作区。初始运行额度为 0，不会伪造试用额度。",
  membership_required: "当前组织已有工作区，请由组织管理员完成数据库成员配置后再继续。",
};

function safeError(code: string | undefined): string {
  if (code === "UNAUTHENTICATED") return "请先登录或注册。";
  if (code === "WORKSPACE_ADMIN_REQUIRED") return "需要当前组织管理员先完成工作区设置。";
  if (code === "AUTH_UNAVAILABLE") return "身份服务尚未配置，无法设置工作区。";
  if (code === "DATA_UNAVAILABLE") return "工作区数据服务暂不可用。";
  return "工作区设置暂不可用，请稍后重试。";
}

export function CommercialWorkspaceOnboarding() {
  const [state, setState] = useState<OnboardingState>("loading");
  const [message, setMessage] = useState("");

  async function load() {
    setState("loading");
    setMessage("");
    try {
      const response = await fetch("/api/commercial/onboarding", { cache: "no-store" });
      const payload = await response.json() as Payload;
      if (!response.ok) throw new Error(safeError(payload.error));
      setState(payload.state ?? "error");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : safeError(undefined));
      setState("error");
    }
  }

  useEffect(() => { void load(); }, []);

  async function setup() {
    setState("loading");
    setMessage("");
    try {
      const response = await fetch("/api/commercial/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent: "setup" }),
      });
      const payload = await response.json() as Payload;
      if (!response.ok || payload.state !== "ready") throw new Error(safeError(payload.error));
      setState("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : safeError(undefined));
      setState("error");
    }
  }

  if (state === "loading") return <p className="commercial-onboarding-status" role="status">正在核对工作区状态…</p>;
  if (state === "ready") return <div className="commercial-onboarding-ready" role="status"><p>工作区已就绪。</p><Link href="/dashboard">进入项目工作台</Link></div>;
  if (state === "error") return <div className="commercial-dashboard-alert" role="alert"><span>{message}</span><button type="button" onClick={() => void load()}>重试</button></div>;
  return <div className="commercial-onboarding-action">
    <p>{stateCopy[state]}</p>
    {state === "bootstrap_required" ? <button type="button" onClick={() => void setup()}>创建团队工作区</button> : null}
    {state === "membership_required" ? <p>请让组织管理员完成工作区成员配置后再继续。</p> : null}
    <button type="button" className="commercial-onboarding-refresh" onClick={() => void load()}>已选择组织，重新检查</button>
  </div>;
}
