const MIN_ANSWER_CHARS = 80;
const GREETING = /^(你好|您好|hi|hello|嗨|在吗|谢谢|感谢|thanks|thank you)[！!。.\s]*$/i;
const META_QUESTION = /(有哪些字段|字段列表|列名|表头|多少行|行数|列数|数据量|字段含义|哪些列)/;
const ANALYSIS_SIGNAL =
  /(趋势|占比|对比|分布|原因|异常|排名|top|最高|最低|增长|下降|相关|平均|总额|汇总|分析)/i;

export interface ReportCandidate {
  question: string;
  answer: string;
  chartCount: number;
}

/**
 * 只把“像一次分析”的回答写进 reports：
 * - 有图表：必写。
 * - 纯文本：排除寒暄与纯字段/行数问答，且答案至少 80 字。
 * 目的：避免“你好/有哪些字段”污染历史与 RAG。
 */
export function shouldPersistReport({ question, answer, chartCount }: ReportCandidate): boolean {
  if (chartCount > 0) return true;

  const q = question.trim();
  const a = answer.trim();
  if (!q || !a) return false;
  if (GREETING.test(q)) return false;
  if (META_QUESTION.test(q) && !ANALYSIS_SIGNAL.test(q)) return false;

  return a.length >= MIN_ANSWER_CHARS;
}
