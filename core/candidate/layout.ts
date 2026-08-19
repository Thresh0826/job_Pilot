/**
 * V0.4-A 简历版面结构模型。
 *
 * 解析流程的第一步是「还原简历结构」：不再把 PDF 转成一长串文本，
 * 而是保留文本块的位置关系（上下 / 左右 / 同一行），按视觉顺序重建行，
 * 并在同一行内保留字段间隔（tab），供 Section 识别与结构化解析使用。
 */

/** 一个版面行（视觉上同一行的文本块，已按阅读顺序拼接）。 */
export interface LayoutLine {
  /** 行文本。同一行内字段间隔较大时用 \t 分隔（如「江苏理工学院\t本科\t物联网工程\t2022-2026」）。 */
  text: string;
  page: number;
  /** PDF 页面坐标 y（原点左下，越大越靠上），用于视觉排序。 */
  y: number;
  /** 是否为标题（加粗 / 大字号）——PDF 字体信息不可用时为 false，仅作辅助。 */
  bold: boolean;
}

/** 将版面行按「页 → 视觉从上到下」排序。 */
export function sortLayoutLines(lines: LayoutLine[]): LayoutLine[] {
  return [...lines].sort((a, b) => a.page - b.page || b.y - a.y);
}

/**
 * 从 pdf.js textContent 的原始 items 重建版面行。
 * - 按 y 坐标聚类同一视觉行（容差 tolerance）
 * - 行内按 x 排序
 * - 行内字段间隔 > gapThreshold 时用 \t 分隔（表格 / 制表符版式）
 * - 普通间隔用空格连接
 *
 * 该函数为纯函数，便于单测；PDF 提取见 electron 侧 resumeLayoutExtractor。
 */
export interface PdfTextItemLike {
  str: string;
  transform: number[];
  width: number;
  fontName?: string;
}

export function buildLayoutLinesFromItems(
  items: PdfTextItemLike[],
  pageNo: number,
  options?: { yTolerance?: number; gapThreshold?: number; boldFonts?: Set<string> },
): LayoutLine[] {
  const yTolerance = options?.yTolerance ?? 4;
  const gapThreshold = options?.gapThreshold ?? 10;
  const boldFonts = options?.boldFonts;

  // 去掉空白占位 item（PDF 制表符常渲染成空格 item，宽度即字段间距），
  // 字段间隔改由「下一个 item 的 x0 - 当前 item 的 x1」计算。
  const meaningful = items.filter((it) => it.str.trim().length > 0);
  const rows: { y: number; items: PdfTextItemLike[] }[] = [];
  for (const it of meaningful) {
    const y = it.transform[5];
    const row = rows.find((r) => Math.abs(r.y - y) <= yTolerance);
    if (row) {
      row.items.push(it);
    } else {
      rows.push({ y, items: [it] });
    }
  }

  const lines: LayoutLine[] = [];
  for (const row of rows) {
    const sorted = row.items.sort((a, b) => a.transform[4] - b.transform[4]);
    let text = '';
    let prevEnd = 0;
    let first = true;
    let bold = false;
    for (const it of sorted) {
      const x0 = it.transform[4];
      if (!first) {
        const gap = x0 - prevEnd;
        text += gap > gapThreshold ? '\t' : ' ';
      }
      text += it.str;
      prevEnd = x0 + it.width;
      first = false;
      if (boldFonts && it.fontName && boldFonts.has(it.fontName)) bold = true;
    }
    lines.push({ text: text.replace(/\s+$/g, ''), page: pageNo, y: row.y, bold });
  }
  return lines;
}
