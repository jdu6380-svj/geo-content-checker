import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal-document";

export const metadata: Metadata = {
  title: "使用条款",
};

export default function TermsPage() {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();

  return (
    <LegalDocument
      title="使用条款"
      summary="Evidra 提供面向 B2B SaaS 内容、增长与品牌团队的 AI 内容可信度与 GEO 发布前审查工作台。使用产品即表示你理解模型输出存在不确定性，并同意在发布或交付前自行复核。"
      sections={[
        {
          title: "服务范围",
          content: (
            <>
              <p>产品提供 AI 内容可信度与 GEO 发布前审查，包括准备度评分、问题预测、诊断证据、修改建议和工作区交付报告；不保证搜索排名、模型引用、流量或商业结果。</p>
              <p>公开测试期间，功能、额度和可用性可能调整，也可能因模型服务、网络或限流暂时不可用。</p>
            </>
          ),
        },
        {
          title: "你的责任",
          content: (
            <>
              <p>你应当拥有提交内容的必要权利，不得上传违法内容、恶意代码、个人敏感信息或无权处理的保密资料。</p>
              <p>评分、证据和 Patch 可能不完整或出错。发布前必须核对引用、数字、事实、适用范围和原意。</p>
            </>
          ),
        },
        {
          title: "合理使用与额度",
          content: (
            <>
              <p>我们会通过匿名设备额度、共享网络额度和全局模型预算控制滥用与费用。绕过限流、自动批量调用或干扰服务可能导致访问受限。</p>
              <p>单篇文章及请求体大小受产品界面和 API 校验限制。</p>
            </>
          ),
        },
        {
          title: "支付宝套餐与额度",
          content: (
            <>
              <p>商业工作台提供支付宝一次性套餐：Starter、Growth、Team 与 Scale，以及工作区共享额度。页面显示的套餐、价格与分析额度来自服务端配置；付款成功并经支付宝回调验证后，额度才会发放到当前工作区。</p>
              <p>一次性套餐不是自动续费订阅。付款处理中、回调未验证、订单关闭或状态不明时不会提前发放额度。</p>
            </>
          ),
        },
        {
          title: "退款与对账",
          content: (
            <>
              <p>退款申请先进入人工审核，不代表已经退款，也不承诺固定完成时限。是否可退及处理方式取决于订单状态、额度使用情况、支付渠道规则和适用法律。</p>
              <p>订单关闭、退款或对账差异不会静默扣减已消费额度；相关异常进入人工复核。请勿通过普通反馈表提交完整订单号、签名、密钥或支付凭证。</p>
            </>
          ),
        },
        {
          title: "责任边界",
          content: (
            <>
              <p>本服务按现状提供。对于因依赖未经复核的模型输出、服务中断或第三方服务造成的间接损失，我们在适用法律允许范围内不承担责任。</p>
              <p>本产品不构成法律、医疗、财务或其他专业意见。</p>
            </>
          ),
        },
        {
          title: "联系与变更",
          content: (
            <>
              <p>条款可能随产品与服务更新，页面顶部日期代表当前版本。</p>
              <p>
                {supportEmail ? (
                  <>
                    支持邮箱：<a className="text-[var(--geo-primary)] underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>。
                  </>
                ) : (
                  "问题请通过产品内反馈入口联系我们。"
                )}
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
