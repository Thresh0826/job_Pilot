import fs from 'node:fs';
import path from 'node:path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import {
  buildLayoutLinesFromItems,
  sortLayoutLines,
  type LayoutLine,
} from '../../../core/candidate/layout';

/**
 * V0.4-A 简历版面提取（Electron Main）。
 *
 * PDF：直接读取 pdf.js 的 textContent items（含 str / x / y / width / fontName），
 * 按视觉位置重建行：同一行合并、行内大间隔用 \t 保留字段边界，
 * 最后按「页 → 视觉从上到下」排序 —— 解决内容流顺序与视觉顺序不一致的问题
 * （例如公司行出现在「实习经历」标题之前）。
 *
 * DOCX：mammoth 提取段落，按文档顺序作为行序列（无版面坐标）。
 */
export async function extractResumeLayout(filePath: string): Promise<LayoutLine[]> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return extractPdfLayout(filePath);
  if (ext === '.docx') return extractDocxLayout(filePath);
  throw new Error('不支持的简历格式。');
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  fontName?: string;
}

async function extractPdfLayout(filePath: string): Promise<LayoutLine[]> {
  const data = fs.readFileSync(filePath);
  const parser = new PDFParse({ data });
  try {
    await parser.getText(); // 触发 pdfjs doc 加载
    // pdf-parse v2 将 doc 声明为 private，但运行时可用；此处按需读取其底层 pdfjs 文档对象。
    const doc = (parser as unknown as { doc: PdfDocumentLike }).doc;
    if (!doc) throw new Error('PDF 解析失败。');

    const lines: LayoutLine[] = [];
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const tc = await page.getTextContent();
      lines.push(...buildLayoutLinesFromItems(tc.items as PdfTextItem[], pageNo));
      page.cleanup();
    }
    return sortLayoutLines(lines);
  } finally {
    await parser.destroy();
  }
}

interface PdfPageLike {
  getTextContent: () => Promise<{ items: PdfTextItem[] }>;
  cleanup: () => void;
}

interface PdfDocumentLike {
  numPages: number;
  getPage: (n: number) => Promise<PdfPageLike>;
}

async function extractDocxLayout(filePath: string): Promise<LayoutLine[]> {
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value ?? '';
  // 段落顺序即文档顺序；用递减 y 保持顺序（无真实坐标）。
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((line, i) => ({ text: line.trim(), page: 1, y: 100000 - i, bold: false }));
}
