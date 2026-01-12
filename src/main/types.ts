export interface ProcessOptions {
  outputDir: string;
  copySuffix?: string;
  overwriteSource?: boolean;
}

export interface AppConfig {
  outputDir: string;
  copySuffix: string;
  overwriteSource: boolean;
}

export interface ProcessItem {
  path: string;
}

export interface ProcessResult {
  inputPath: string;
  outputPath?: string;
  status: "success" | "skipped" | "error";
  removed?: string[];
  type?: string;
  message?: string;
}

export interface ScanResult {
  files: string[];
}

export interface FileDetailedInfo {
  name: string;
  path: string;
  size: number;
  mtime: number;
  exists: boolean;
  category: "image" | "office" | "pdf" | "zip" | "video" | "other";
  metadata?: {
    // 通用
    mime?: string;
    // 图片
    width?: number;
    height?: number;
    format?: string;
    hasExif?: boolean;
    exifData?: Record<string, any>;
    // Office / PDF / Video
    title?: string;
    author?: string;
    creator?: string;
    lastModifiedBy?: string;
    creationDate?: string;
    // ZIP
    fileCount?: number;
    comment?: string;
    // PDF 特定
    pageCount?: number;
    // 视频特定
    duration?: number;
    bitrate?: number;
    videoCodec?: string;
    audioCodec?: string;
    encoder?: string;
  };
}
