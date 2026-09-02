"use client";

import { useRef, useState } from "react";

type Observation = {
  runId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  usageState: "unknown" | "reserved" | "charged" | "released";
  resultRecorded: boolean;
  reconciliation: "active" | "consistent" | "reservation_mismatch" | "manual_review";
  createdAt: string;
};

const reconciliationLabel: Record<Observation["reconciliation"], string> = {
  active: "运行中",
  consistent: "一致",
  reservation_mismatch: "占用待释放",
  manual_review: "需人工基础设施对账",
};

export function CommercialRunRecoveryPanel() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [runs, setRuns] = useState<Observation[]>([]);
  const [summary, setSummary] = useState({ reservedCount: 0, observedReservedRuns: 0 });
  const [message, setMessage] = useState("");
  const keys = useRef(new Map<string, string>());

  async function load() {
    setOpen(true); setStatus("loading"); setMessage("");
    try {
      const response = await fetch("/api/commercial/operator/runs", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(response.status === 403 ? "仅工作区所有者可使用运行恢复能力。" : "运行恢复能力暂不可用。");
      setRuns(Array.isArray(body.runs) ? body.runs : []);
      setSummary({ reservedCount: Number(body.reservedCount) || 0, observedReservedRuns: Number(body.observedReservedRuns) || 0 });
      setStatus("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "运行恢复能力暂不可用。"); setStatus("error");
    }
  }

  async function recover(run: Observation) {
    const action = run.status === "queued" || run.status === "running" ? "cancel_and_release" : "release_reservation";
    const keyName = `${run.runId}:${action}`;
    const idempotencyKey = keys.current.get(keyName) ?? crypto.randomUUID();
    keys.current.set(keyName, idempotencyKey);
    setStatus("loading"); setMessage("");
    try {
      const response = await fetch("/api/commercial/operator/runs", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey }, body: JSON.stringify({ runId: run.runId, action }) });
      const body = await response.json();
      if (!response.ok) throw new Error(response.status === 409 ? "运行状态已变化，请刷新后重新核对。" : response.status === 403 ? "仅工作区所有者可使用运行恢复能力。" : "恢复动作未执行。");
      if (!body.action || body.action.status !== "completed") throw new Error("恢复动作未执行。");
      keys.current.delete(keyName);
      await load();
      setMessage("恢复动作已完成并记录审计事件。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "恢复动作未执行。"); setStatus("error");
    }
  }

  return <section className="commercial-operator-panel" aria-labelledby="commercial-run-recovery-title">
    <button type="button" onClick={() => void load()} disabled={status === "loading"}>{status === "loading" ? "正在核对运行" : "运行故障恢复"}</button>
    {open ? <div>
      <h2 id="commercial-run-recovery-title">运行与额度对账</h2>
      <p>仅显示安全状态，不显示用户内容、结果路径或供应商数据。孤立私有结果只进入人工基础设施对账，不会自动删除。</p>
      {message ? <p role={status === "error" ? "alert" : "status"}>{message}</p> : null}
      {status === "ready" ? <p>数据库占用 {summary.reservedCount}；已观察 reserved run {summary.observedReservedRuns}。</p> : null}
      {status === "ready" && runs.length === 0 ? <p>当前工作区暂无运行记录。</p> : null}
      {runs.length ? <ul>{runs.map((run) => {
        const canRecover = run.usageState === "reserved" && run.status !== "succeeded" && (run.reconciliation === "active" || run.reconciliation === "reservation_mismatch");
        return <li key={run.runId}><div><strong>{run.status}</strong><span>{reconciliationLabel[run.reconciliation]}</span><small>{run.resultRecorded ? "数据库已记录结果" : "数据库未记录结果"}</small></div>{canRecover ? <button type="button" onClick={() => void recover(run)}>{run.reconciliation === "active" ? "终止并释放占用" : "释放异常占用"}</button> : null}</li>;
      })}</ul> : null}
    </div> : null}
  </section>;
}
