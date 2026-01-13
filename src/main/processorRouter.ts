import path from 'path';
import { fileTypeFromFile } from 'file-type';
import { processImage } from './processors/imageProcessor';
import { processOffice } from './processors/officeProcessor';
import { processPdf } from './processors/pdfProcessor';
import { processZip } from './processors/zipProcessor';
import { processVideo } from './processors/videoProcessor';
import { ProcessResult } from './types';

const imageExts = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.tiff',
  '.gif',
  '.avif',
  '.heic',
]);

const officeExts = new Set(['.docx', '.xlsx', '.pptx', '.doc', '.xls', '.ppt']);
const pdfExts = new Set(['.pdf']);
const zipExts = new Set(['.zip']);
const videoExts = new Set(['.mp4', '.mkv', '.mov', '.avi', '.wmv', '.flv', '.webm']);

export async function processByType(
  inputPath: string,
  outputPath: string,
): Promise<ProcessResult> {
  const ext = path.parse(inputPath).ext.toLowerCase();
  const detected = await fileTypeFromFile(inputPath);
  const mime = detected?.mime ?? '';

  try {
    if (imageExts.has(ext) || mime.startsWith('image/')) {
      const res = await processImage(inputPath, outputPath);
      return { inputPath, outputPath, status: 'success', ...res };
    }
    if (pdfExts.has(ext) || mime === 'application/pdf') {
      const res = await processPdf(inputPath, outputPath);
      return { inputPath, outputPath, status: 'success', ...res };
    }
    if (officeExts.has(ext)) {
      const res = await processOffice(inputPath, outputPath);
      return { inputPath, outputPath, status: 'success', ...res };
    }
    if (zipExts.has(ext) || mime === 'application/zip') {
      const res = await processZip(inputPath, outputPath);
      return { inputPath, outputPath, status: 'success', ...res };
    }
    if (videoExts.has(ext) || mime.startsWith('video/')) {
      const res = await processVideo(inputPath, outputPath);
      return { inputPath, outputPath, status: 'success', ...res as any };
    }
    return {
      inputPath,
      status: 'error',
      message: '不支持的文件类型',
    };
  } catch (err) {
    return {
      inputPath,
      outputPath,
      status: 'error',
      message: err instanceof Error ? err.message : '处理失败',
    };
  }
}
