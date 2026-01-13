import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

const EMPTY_WORD_COMMENTS =
  '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:comments>';
const EMPTY_XLSX_COMMENTS =
  '<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"></comments>';
const EMPTY_PPT_COMMENTS =
  '<p:cmLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"></p:cmLst>';

const COMMON_REMOVALS = [
  'docProps/core.xml',
  'docProps/app.xml',
  'docProps/custom.xml',
  'docProps/thumbnail.emf',
  'docProps/thumbnail.jpeg',
];

const CUSTOM_XML_PREFIX = 'customXml/';

async function stripTrackRevisions(zip: JSZip, removed: string[]) {
  const settings = zip.file('word/settings.xml');
  if (!settings) return;
  const xml = await settings.async('string');
  const cleaned = xml
    .replace(/<w:trackRevisions[^>]*\/>/g, '')
    .replace(/<w:trackRevisions[^>]*>[\s\S]*?<\/w:trackRevisions>/g, '');
  if (cleaned !== xml) {
    removed.push('word/settings.xml trackRevisions');
    zip.file('word/settings.xml', cleaned);
  }
}

function removeCommon(zip: JSZip, removed: string[]) {
  for (const entry of COMMON_REMOVALS) {
    if (zip.file(entry)) {
      removed.push(entry);
      zip.remove(entry);
    }
  }
  Object.keys(zip.files)
    .filter((f) => f.startsWith(CUSTOM_XML_PREFIX))
    .forEach((f) => {
      removed.push(CUSTOM_XML_PREFIX);
      zip.remove(f);
    });
}

function clearIfExists(zip: JSZip, fileName: string, content: string, removed: string[]) {
  if (zip.file(fileName)) {
    removed.push(`${fileName} cleared`);
    zip.file(fileName, content);
  }
}

async function processDocx(zip: JSZip, removed: string[]) {
  clearIfExists(zip, 'word/comments.xml', EMPTY_WORD_COMMENTS, removed);
  clearIfExists(zip, 'word/commentsExtended.xml', EMPTY_WORD_COMMENTS, removed);
  await stripTrackRevisions(zip, removed);
}

function processXlsx(zip: JSZip, removed: string[]) {
  Object.keys(zip.files)
    .filter((f) => f.startsWith('xl/comments'))
    .forEach((f) => {
      removed.push(`${f} cleared`);
      zip.file(f, EMPTY_XLSX_COMMENTS);
    });
}

function processPptx(zip: JSZip, removed: string[]) {
  Object.keys(zip.files)
    .filter((f) => f.startsWith('ppt/comments'))
    .forEach((f) => {
      removed.push(`${f} cleared`);
      zip.file(f, EMPTY_PPT_COMMENTS);
    });
}

export async function processOffice(inputPath: string, outputPath: string) {
  const ext = path.parse(inputPath).ext.toLowerCase();
  
  // 检查是否为旧版 Office 格式 (OLE2)
  if (['.doc', '.xls', '.ppt'].includes(ext)) {
    throw new Error(`暂不支持旧版 Office 格式 (${ext})。请先使用 Office 或在线转换工具将其转换为新版格式 (.docx, .xlsx, .pptx) 后再处理。`);
  }

  const buffer = await fs.promises.readFile(inputPath);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (err) {
    throw new Error('无法解析该 Office 文件，可能文件已损坏或为不支持的旧版二进制格式。');
  }
  const removed: string[] = [];

  removeCommon(zip, removed);

  if (ext === '.docx') {
    await processDocx(zip, removed);
  } else if (ext === '.xlsx') {
    processXlsx(zip, removed);
  } else if (ext === '.pptx') {
    processPptx(zip, removed);
  }

  const resultBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await fs.promises.writeFile(outputPath, resultBuffer);

  return { removed, type: 'office' };
}
