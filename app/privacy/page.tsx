import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal-document";

export const metadata: Metadata = {
  title: "隐私说明",
};

export default function PrivacyPage() {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();

  return (
    <LegalDocument
      title="隐私说明"
      summary="本说明解释公开测试期间文章正文、匿名额度、产品指标、错误监控和反馈数据如何被处理。"
      sections={[
        {
          title: "文章与分析报告",
          content: (
            <>
              <p>提交分析后，文章标题、正文和必要上下文会发送给已配置的大模型服务 DeepSeek，用于生成评分、诊断与修改建议。</p>
              <p>Evidra 不将文章正文或完整报告写入服务端数据库。报告默认保存在当前浏览器的本地存储中，清除站点数据即可删除。</p>
              <p>模型服务商对请求的处理受其服务条款和隐私规则约束。请不要提交密码、身份证件、未公开商业秘密或其他敏感信息。</p>
            </>
          ),
        },
        {
          title: "匿名身份与限流",
          content: (
            <>
              <p>浏览器会生成随机 UUID。服务端使用独立密钥将该标识与网络地址分别转换为不可逆 HMAC，用于设备额度、共享网络额度和防滥用。</p>
              <p>Redis 不保存原始 IP、User-Agent 或客户端 UUID。限流记录带有 TTL，并会自动过期。</p>
            </>
          ),
        },
        {
          title: "Beta 产品指标",
          content: (
            <>
              <p>我们只聚合访问、完成分析和点击反馈三类事件，用于计算首次分析完成率与跨日期重复使用率。</p>
              <p>事件不包含文章正文、标题、证据、Prompt 或模型输出。匿名事件最多保留 90 天。</p>
            </>
          ),
        },
        {
          title: "错误监控与日志",
          content: (
            <>
              <p>结构化日志用于诊断 API 请求与模型运行状态，仅记录代码白名单允许的路由、请求 ID、状态、耗时、来源、限流/预算状态、Token 数量、费用和受限响应形状及校验诊断。Sentry 仅用于错误监控、发布关联和受控异常的最小上下文，两者字段并不相同。</p>
              <p>结构化日志不会写入请求/响应正文、文章或问题原文、Prompt、Evidence 引文、模型内容/推理、凭据、授权 Token、Cookie、查询参数、User-Agent、客户端标识或 provider request identifier；Sentry 发送前由独立 scrubber 清理消息、请求数据、Cookie、查询参数、User-Agent、客户端标识、授权信息、正文和 Prompt。</p>
            </>
          ),
        },
        {
          title: "反馈与删除",
          content: (
            <>
              <p>反馈入口指向外部表单。你主动填写的内容和联系方式由该表单服务处理，仅用于改进公开测试版。</p>
              <p>浏览器中的草稿和报告可通过清除本站点数据删除。匿名聚合指标无法映射回原始身份，并会在保留期结束后自动过期。</p>
              <p>
                {supportEmail ? (
                  <>
                    数据或删除问题请联系 <a className="text-[#0f766e] underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>。
                  </>
                ) : (
                  "数据问题请通过产品内反馈入口联系我们。"
                )}
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
