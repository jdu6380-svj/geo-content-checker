import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal-document";

export const metadata: Metadata = {
  title: "使用条款 · 理据 GEO",
};

export default function TermsPage() {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();

  return (
    <LegalDocument
      title="使用条款"
      summary="理据 GEO 当前为公开测试版。使用产品即表示你理解模型输出存在不确定性，并同意在发布内容前自行复核。"
      sections={[
        {
          title: "服务范围",
          content: (
            <>
              <p>产品提供文章的 GEO 准备度评分、问题预测、诊断证据和修改建议，不保证搜索排名、模型引用、流量或商业结果。</p>
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
          title: "责任边界",
          content: (
            <>
              <p>公开测试版按现状提供。对于因依赖未经复核的模型输出、服务中断或第三方服务造成的间接损失，我们在适用法律允许范围内不承担责任。</p>
              <p>本产品不构成法律、医疗、财务或其他专业意见。</p>
            </>
          ),
        },
        {
          title: "联系与变更",
          content: (
            <>
              <p>条款可能随公开测试进展更新，页面顶部日期代表当前版本。</p>
              <p>
                {supportEmail ? (
                  <>
                    支持邮箱：<a className="text-[#0f766e] underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>。
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
