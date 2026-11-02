import type { ChatStatus, UIMessage } from "ai";

/** 有任何可渲染的 assistant 内容（文本 / reasoning / 工具 / 图表 / 文件 / data）时返回 true */
export function hasVisibleAssistantContent(parts: UIMessage["parts"] | undefined): boolean {
  if (!parts?.length) return false;

  return parts.some(part => {
    if (part.type === "text") return part.text.trim().length > 0;
    if (part.type === "reasoning") return part.text.trim().length > 0;
    if (part.type === "file" || part.type === "dynamic-tool") return true;
    if (part.type === "step-start") return false;
    return part.type.startsWith("tool-") || part.type.startsWith("data-");
  });
}

/**
 * submitted（尚未收到流内容）或 streaming 且最后一条 assistant 仍为空时显示等待态；
 * 有错误时优先展示错误，不显示等待态。
 */
export function shouldShowTypingIndicator({
  status,
  messages,
  hasError,
}: {
  status: ChatStatus;
  messages: UIMessage[];
  hasError: boolean;
}): boolean {
  if (hasError) return false;
  if (status === "submitted") return true;
  if (status !== "streaming") return false;

  // 只看最后一条消息：新回复的 assistant 占位尚未出现（末尾仍是 user）时也应显示
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== "assistant") return true;
  return !hasVisibleAssistantContent(lastMessage.parts);
}
