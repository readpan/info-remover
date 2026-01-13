import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "path";
import fs from "fs";
import { scanPaths } from "./fileScanner";
import { processByType } from "./processorRouter";
import { resolvePaths } from "./outputStrategy";
import {
  ProcessItem,
  ProcessOptions,
  ProcessResult,
  AppConfig,
  FileDetailedInfo,
} from "./types";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import sharp from "sharp";
import exifReader from "exif-reader";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import ffprobePath from "ffprobe-static";

// 处理 ASAR 打包后的路径，如果是打包状态，需要指向 app.asar.unpacked 目录
const fixPathForAsar = (p: string | null) => {
  if (!p) return p;
  return p.replace("app.asar", "app.asar.unpacked");
};

const finalFfmpegPath = fixPathForAsar(ffmpegPath);
const finalFfprobePath = fixPathForAsar(ffprobePath ? ffprobePath.path : null);

if (finalFfmpegPath) ffmpeg.setFfmpegPath(finalFfmpegPath);
if (finalFfprobePath) ffmpeg.setFfprobePath(finalFfprobePath);

const isDev = !!process.env.VITE_DEV_SERVER_URL;

const CONFIG_FILE = path.join(app.getPath("userData"), "config.json");

const loadConfig = (): AppConfig => {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Failed to load config:", err);
  }
  return { outputDir: "", copySuffix: "", overwriteSource: false };
};

const saveConfig = (config: AppConfig) => {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error("Failed to save config:", err);
  }
};

const getDetailedMetadata = async (
  filePath: string,
  ext: string
): Promise<FileDetailedInfo["metadata"]> => {
  const metadata: FileDetailedInfo["metadata"] = {};
  try {
    if (ext.match(/\.(jpe?g|png|webp|tiff|gif|avif|heif)$/i)) {
      const sharpMeta = await sharp(filePath).metadata();
      metadata.width = sharpMeta.width;
      metadata.height = sharpMeta.height;
      metadata.format = sharpMeta.format;
      metadata.hasExif = !!sharpMeta.exif;
      if (sharpMeta.exif) {
        try {
          const exif = exifReader(sharpMeta.exif);
          // 提取有意义的 EXIF 数据，过滤掉 Buffer 等不可直接展示的内容
          const cleanExif: Record<string, any> = {};
          const processSection = (section: any) => {
            if (!section) return;
            for (const [key, value] of Object.entries(section)) {
              if (
                typeof value === "string" ||
                typeof value === "number" ||
                typeof value === "boolean"
              ) {
                cleanExif[key] = value;
              } else if (value instanceof Date) {
                cleanExif[key] = value.toLocaleString();
              }
            }
          };
          processSection((exif as any).Image);
          processSection((exif as any).Exif);
          processSection((exif as any).GPS);
          metadata.exifData = cleanExif;
        } catch (e) {
          console.error("EXIF parse error", e);
        }
      }
    } else if (ext.match(/\.(docx|xlsx|pptx)$/i)) {
      const buffer = await fs.promises.readFile(filePath);
      try {
        const zip = await JSZip.loadAsync(buffer);
        metadata.fileCount = Object.keys(zip.files).length;

        const coreXml = zip.file("docProps/core.xml");
        if (coreXml) {
          const text = await coreXml.async("string");
          metadata.title = text.match(/<dc:title>([\s\S]*?)<\/dc:title>/)?.[1];
          metadata.author = text.match(
            /<dc:creator>([\s\S]*?)<\/dc:creator>/
          )?.[1];
          metadata.lastModifiedBy = text.match(
            /<cp:lastModifiedBy>([\s\S]*?)<\/cp:lastModifiedBy>/
          )?.[1];
          metadata.creationDate = text.match(
            /<dcterms:created[^>]*>([\s\S]*?)<\/dcterms:created>/
          )?.[1];
        }
      } catch (e) {
        console.error("Failed to parse OOXML metadata:", e);
      }
    } else if (ext.match(/\.(doc|xls|ppt)$/i)) {
      // 旧版格式暂不支持提取详细元数据，仅标记分类
      metadata.mime = "application/x-ole-storage";
    } else if (ext.toLowerCase() === ".pdf") {
      const data = await fs.promises.readFile(filePath);
      const pdfDoc = await PDFDocument.load(data, {
        updateMetadata: false,
        ignoreEncryption: true,
      });
      metadata.title = pdfDoc.getTitle();
      metadata.author = pdfDoc.getAuthor();
      metadata.creator = pdfDoc.getCreator();
      metadata.pageCount = pdfDoc.getPageCount();
    } else if (ext.toLowerCase() === ".zip") {
      const data = await fs.promises.readFile(filePath);
      const zip = await JSZip.loadAsync(data);
      metadata.fileCount = Object.keys(zip.files).length;
    } else if (ext.match(/\.(mp4|mkv|mov|avi|wmv|flv|webm)$/i)) {
      await new Promise<void>((resolve) => {
        ffmpeg.ffprobe(filePath, (err, data) => {
          if (!err && data) {
            metadata.duration = data.format.duration;
            metadata.bitrate = data.format.bit_rate
              ? Number(data.format.bit_rate)
              : undefined;
            metadata.encoder = data.format.tags?.encoder
              ? String(data.format.tags.encoder)
              : undefined;
            metadata.title = data.format.tags?.title
              ? String(data.format.tags.title)
              : undefined;
            metadata.author =
              data.format.tags?.artist || data.format.tags?.author
                ? String(data.format.tags.artist || data.format.tags.author)
                : undefined;
            metadata.creationDate = data.format.tags?.creation_time
              ? String(data.format.tags.creation_time)
              : undefined;

            const videoStream = data.streams.find(
              (s) => s.codec_type === "video"
            );
            if (videoStream) {
              metadata.videoCodec = videoStream.codec_name;
              metadata.width = videoStream.width;
              metadata.height = videoStream.height;
            }
            const audioStream = data.streams.find(
              (s) => s.codec_type === "audio"
            );
            if (audioStream) {
              metadata.audioCodec = audioStream.codec_name;
            }
          }
          resolve();
        });
      });
    }
  } catch (err) {
    console.error("Error extracting metadata:", err);
  }
  return metadata;
};

const getCategory = (ext: string): FileDetailedInfo["category"] => {
  if (ext.match(/\.(jpe?g|png|webp|tiff|gif|avif|heif)$/i)) return "image";
  if (ext.match(/\.(docx|xlsx|pptx|doc|xls|ppt)$/i)) return "office";
  if (ext.toLowerCase() === ".pdf") return "pdf";
  if (ext.toLowerCase() === ".zip") return "zip";
  if (ext.match(/\.(mp4|mkv|mov|avi|wmv|flv|webm)$/i)) return "video";
  return "other";
};

// 允许从 file:// 来源访问，便于拖拽时拿到路径
app.commandLine.appendSwitch("allow-file-access-from-files");
app.commandLine.appendSwitch("disable-site-isolation-trials");
app.commandLine.appendSwitch("disable-features", "OutOfBlinkCors");

const createWindow = async () => {
  const preloadPath = path.join(__dirname, "preload.js");

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      experimentalFeatures: true,
      sandbox: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    const indexHtml = path.join(__dirname, "../renderer/index.html");
    await win.loadFile(indexHtml);
  }

  win.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription, validatedURL) => {
      console.error(
        `Failed to load URL: ${validatedURL}, Error: ${errorDescription} (${errorCode})`
      );
    }
  );

  win.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file://")) {
      event.preventDefault();
      const filePath = decodeURI(url.replace("file://", ""));
      win.webContents.send("file-dropped-from-nav", [filePath]);
    }
  });
};

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("select-directory", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle("select-files", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile", "multiSelections"],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return [];
  }
  return result.filePaths;
});

ipcMain.handle("dialog:openFile", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("scan-paths", async (_event, payload: { paths: string[] }) => {
  const files = await scanPaths(payload.paths);
  return { files };
});

ipcMain.handle("get-config", async () => {
  return loadConfig();
});

ipcMain.handle("set-config", async (_event, config: AppConfig) => {
  saveConfig(config);
  return true;
});

ipcMain.handle("clear-directory", async (_event, dirPath: string) => {
  try {
    if (!dirPath || !fs.existsSync(dirPath)) return false;
    const files = await fs.promises.readdir(dirPath);
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      await fs.promises.rm(fullPath, { recursive: true, force: true });
    }
    return true;
  } catch (err) {
    console.error("Failed to clear directory:", err);
    return false;
  }
});

ipcMain.handle("get-file-info", async (_event, filePath: string) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { path: filePath, exists: false, category: "other" };
    }
    const stat = await fs.promises.stat(filePath);
    const ext = path.extname(filePath);
    const metadata = await getDetailedMetadata(filePath, ext);

    return {
      name: path.basename(filePath),
      path: filePath,
      size: stat.size,
      mtime: stat.mtimeMs,
      exists: true,
      category: getCategory(ext),
      metadata,
    };
  } catch (err) {
    console.error("Failed to get file info:", err);
    return { path: filePath, exists: false, category: "other" };
  }
});

ipcMain.handle("open-directory", async (_event, dirPath: string) => {
  try {
    if (!dirPath || !fs.existsSync(dirPath)) return false;
    await shell.openPath(dirPath);
    return true;
  } catch (err) {
    console.error("Failed to open directory:", err);
    return false;
  }
});

ipcMain.handle("process-files",
  async (
    _event,
    payload: { items: ProcessItem[]; options: ProcessOptions }
  ) => {
    const { items, options } = payload;
    const results: ProcessResult[] = [];

    for (const item of items) {
      if (!item?.path) {
        results.push({
          inputPath: "",
          status: "error",
          message: "无效的文件路径",
        });
        continue;
      }
      try {
        const { outputPath, backupPath } = await resolvePaths(
          item.path,
          options
        );
        const stat = await fs.promises.stat(item.path);

        if (backupPath) {
          await fs.promises.copyFile(item.path, backupPath);
        }

        const result = await processByType(item.path, outputPath);
        if (result.status === "success") {
          // 保持文件系统时间戳
          await fs.promises.utimes(outputPath, stat.atime, stat.mtime);

          if (options.overwriteSource) {
            // 如果是覆盖模式，将临时文件重命名回原文件
            await fs.promises.rename(outputPath, item.path);
            result.outputPath = item.path; // 更新输出路径为原路径
          }
        }
        results.push(result);
      } catch (err) {
        // 如果出错且在覆盖模式下，尝试清理临时文件
        try {
          const { outputPath } = await resolvePaths(item.path, options);
          if (options.overwriteSource && fs.existsSync(outputPath)) {
            await fs.promises.unlink(outputPath);
          }
        } catch (e) {
          // ignore
        }
        results.push({
          inputPath: item.path,
          status: "error",
          message: err instanceof Error ? err.message : "处理失败",
        });
      }
    }

    return results;
  }
);
