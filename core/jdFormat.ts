/**
 * C4 JD 排版（纯格式整理，绝不改写原文、不增删信息）。
 * 只处理：换行符统一、行尾空白、连续空行压缩、小节标题独立成段。
 * 原文内容与语序保持原样，不调用任何 AI / 摘要 / 改写能力。
 */

const HEADING_WORDS =
  '职位描述|岗位职责|任职要求|任职资格|岗位要求|工作职责|职位要求|岗位描述|工作内容|公司介绍|福利待遇|薪资福利|岗位亮点';

const HEADING_LINE_RE = new RegExp(`^\\s*(?:${HEADING_WORDS})[：:]?\\s*$`, 'm');
const HEADING_BEFORE_RE = new RegExp(`(\\n)(?=(?:${HEADING_WORDS})[：:]?\\s*\\n)`, 'g');
const HEADING_AFTER_RE = new RegExp(`(\\n(?:${HEADING_WORDS})[：:]?\\s*)(?=\\S)`, 'g');

/** 排版 JD 文本；空输入返回空字符串。 */
export function formatJdText(raw: string): string {
  if (!raw) return '';

  // 1. 统一换行符（CRLF / CR → LF）
  let text = raw.replace(/\r\n?/g, '\n');

  // 2. 去除行尾空白
  text = text.replace(/[ \t]+$/gm, '');

  // 3. 连续 3 个及以上换行 → 1 个空行（段落间空一行）
  text = text.replace(/\n{3,}/g, '\n\n');

  // 4. 小节标题独立成段：标题行前后各补一个空行（已是空行分隔则不重复）
  if (HEADING_LINE_RE.test(text)) {
    text = text.replace(HEADING_BEFORE_RE, '\n\n');
    text = text.replace(HEADING_AFTER_RE, '$1\n');
    text = text.replace(/\n{3,}/g, '\n\n');
  }

  // 5. 去掉首尾空行
  text = text.replace(/^\n+/, '').replace(/\n+$/, '');

  return text;
}
