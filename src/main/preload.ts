import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { ProcessItem, ProcessOptions, AppConfig, FileDetailedInfo } from './types';

type DropListener = (paths: string[]) => void;
const dropListeners = new Set<DropListener>();
const navDropListeners = new Set<DropListener>();

const api = {
  getConfig: () => ipcRenderer.invoke('get-config') as Promise<AppConfig>,
  setConfig: (config: AppConfig) => ipcRenderer.invoke('set-config', config) as Promise<boolean>,
  getFileInfo: (path: string) => ipcRenderer.invoke('get-file-info', path) as Promise<FileDetailedInfo>,
  clearDirectory: (dirPath: string) => ipcRenderer.invoke('clear-directory', dirPath) as Promise<boolean>,
  openDirectory: (dirPath: string) => ipcRenderer.invoke('open-directory', dirPath) as Promise<boolean>,
  selectDirectory: () => ipcRenderer.invoke('select-directory') as Promise<string | null>,
  selectFiles: () => ipcRenderer.invoke('select-files') as Promise<string[]>,
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile') as Promise<string | null>,
  scanPaths: (paths: string[]) =>
    ipcRenderer.invoke('scan-paths', { paths }) as Promise<{ files: string[] }>,
  processFiles: (items: ProcessItem[], options: ProcessOptions) =>
    ipcRenderer.invoke('process-files', { items, options }) as Promise<unknown>,
  getFilePath: (file: File) => webUtils.getPathForFile(file),
  onFileDrop: (listener: DropListener) => {
    dropListeners.add(listener);
    return () => dropListeners.delete(listener);
  },
  onNavFileDrop: (listener: DropListener) => {
    navDropListeners.add(listener);
    return () => navDropListeners.delete(listener);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);

// 监听窗口级别的 drop 以确保获取文件路径
window.addEventListener('drop', (event) => {
  const dt = event.dataTransfer;
  if (!dt) return;
  const files = Array.from(dt.files || []);
  if (files.length === 0) return;
  const paths = files
    .map((f) => webUtils.getPathForFile(f as File))
    .filter((p): p is string => !!p);
  if (paths.length === 0) return;
  dropListeners.forEach((listener) => listener(paths));
});

ipcRenderer.on('file-dropped-from-nav', (_event, paths: string[]) => {
  if (!paths?.length) return;
  navDropListeners.forEach((listener) => listener(paths));
});
