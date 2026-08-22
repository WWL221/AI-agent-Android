import JSZip from 'jszip';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import * as XLSX from 'xlsx';

const MAX_EXTRACTED_CHARACTERS = 120_000;

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface ParsedFileContent {
  content: string;
  error?: string;
}

function extensionOf(name: string): string {
  const match = /\.([^.]+)$/.exec(name.toLowerCase());
  return match?.[1] || '';
}

function normalizeText(value: string): string {
  return value
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function limitText(value: string): string {
  if (value.length <= MAX_EXTRACTED_CHARACTERS) return value;
  return `${value.slice(0, MAX_EXTRACTED_CHARACTERS)}\n\n[正文已截断，原文件内容超过 ${MAX_EXTRACTED_CHARACTERS} 个字符]`;
}

function extracted(value: string): ParsedFileContent {
  const content = limitText(normalizeText(value));
  return content
    ? { content }
    : { content: '', error: '文件中没有提取到可读文本' };
}

function parserError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return '文件内容解析失败';
}

function xmlDocument(xml: string): Document {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.getElementsByTagName('parsererror').length > 0) {
    throw new Error('文档内部 XML 格式损坏');
  }
  return document;
}

function nodeText(node: Element): string {
  const textNodes = Array.from(node.getElementsByTagName('*'))
    .filter((child) => child.localName === 't' || child.localName === 'span');
  return textNodes.length
    ? textNodes.map((child) => child.textContent || '').join('')
    : node.textContent || '';
}

function xmlBlocks(xml: string, blockNames: Set<string>): string[] {
  const document = xmlDocument(xml);
  return Array.from(document.getElementsByTagName('*'))
    .filter((node) => blockNames.has(node.localName))
    .map(nodeText)
    .map((value) => value.trim())
    .filter(Boolean);
}

async function parsePdf(data: ArrayBuffer): Promise<ParsedFileContent> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data) });
  const document = await loadingTask.promise;
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean)
        .join(' ');
      if (pageText.trim()) pages.push(`第 ${pageNumber} 页\n${pageText}`);
    }
  } finally {
    await loadingTask.destroy();
  }
  return extracted(pages.join('\n\n'));
}

async function parseDocx(data: ArrayBuffer): Promise<ParsedFileContent> {
  const result = await mammoth.extractRawText({ arrayBuffer: data });
  return extracted(result.value);
}

async function parsePptx(data: ArrayBuffer): Promise<ParsedFileContent> {
  const zip = await JSZip.loadAsync(data);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((left, right) => {
      const leftNumber = Number(/slide(\d+)/i.exec(left)?.[1] || 0);
      const rightNumber = Number(/slide(\d+)/i.exec(right)?.[1] || 0);
      return leftNumber - rightNumber;
    });
  const slides: string[] = [];
  for (const [index, name] of slideFiles.entries()) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async('string');
    const text = xmlBlocks(xml, new Set(['p'])).join('\n').trim();
    if (text) slides.push(`第 ${index + 1} 页\n${text}`);
  }
  return extracted(slides.join('\n\n'));
}

async function parseSpreadsheet(data: ArrayBuffer): Promise<ParsedFileContent> {
  const workbook = XLSX.read(data, { type: 'array', cellDates: true });
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet, {
      FS: '\t',
      RS: '\n',
      blankrows: false,
      rawNumbers: false
    });
    return `工作表：${name}\n${csv}`;
  });
  return extracted(sheets.join('\n\n'));
}

async function parseOpenDocument(data: ArrayBuffer): Promise<ParsedFileContent> {
  const zip = await JSZip.loadAsync(data);
  const contentFile = zip.file('content.xml');
  if (!contentFile) throw new Error('OpenDocument 文件缺少 content.xml');
  const xml = await contentFile.async('string');
  return extracted(xmlBlocks(xml, new Set(['h', 'p'])).join('\n'));
}

function decodeRtf(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let decoded: string;
  try {
    decoded = new TextDecoder('windows-1252').decode(bytes);
  } catch {
    decoded = new TextDecoder().decode(bytes);
  }
  return decoded
    .replace(/\\'[0-9a-f]{2}/gi, (match) => String.fromCharCode(Number.parseInt(match.slice(2), 16)))
    .replace(/\\u(-?\d+)\??/g, (_, number: string) => {
      const code = Number(number);
      return String.fromCharCode(code < 0 ? code + 65536 : code);
    })
    .replace(/\\(par|line)\b\s?/gi, '\n')
    .replace(/\\tab\b\s?/gi, '\t')
    .replace(/\\[a-z]+-?\d*\s?/gi, '')
    .replace(/[{}]/g, '');
}

function unsupportedFormat(extension: string): ParsedFileContent {
  return {
    content: '',
    error: extension === 'doc' || extension === 'ppt'
      ? `.${extension} 是旧版二进制格式，当前版本无法在手机端直接提取正文；请另存为 .docx 或 .pptx 后发送`
      : '当前文件格式暂不支持直接提取正文'
  };
}

export async function parseDocumentContent(
  name: string,
  mimeType: string | undefined,
  data: ArrayBuffer
): Promise<ParsedFileContent> {
  const extension = extensionOf(name);
  try {
    switch (extension) {
      case 'pdf':
        return await parsePdf(data);
      case 'docx':
        return await parseDocx(data);
      case 'pptx':
        return await parsePptx(data);
      case 'xls':
      case 'xlsx':
        return await parseSpreadsheet(data);
      case 'odt':
      case 'ods':
      case 'odp':
        return await parseOpenDocument(data);
      case 'rtf':
        return extracted(decodeRtf(data));
      case 'doc':
      case 'ppt':
        return unsupportedFormat(extension);
      default:
        if (mimeType === 'application/pdf') return await parsePdf(data);
        return unsupportedFormat(extension);
    }
  } catch (error) {
    return { content: '', error: `无法读取文件正文：${parserError(error)}` };
  }
}
