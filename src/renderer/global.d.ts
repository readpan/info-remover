import type { ProcessItem, ProcessOptions, ProcessResult, AppConfig } from '../main/types';

declare global {
  interface Window {
    electronAPI: {
      getConfig: () => Promise<AppConfig>;
      setConfig: (config: AppConfig) => Promise<boolean>;
      getFileInfo: (path: string) => Promise<FileDetailedInfo>;
      clearDirectory: (dirPath: string) => Promise<boolean>;
      selectDirectory: () => Promise<string | null>;
      selectFiles: () => Promise<string[]>;
      openFileDialog: () => Promise<string | null>;
      getFilePath: (file: File) => string | null;
      scanPaths: (paths: string[]) => Promise<{ files: string[] }>;
      processFiles: (
        items: ProcessItem[],
        options: ProcessOptions,
      ) => Promise<ProcessResult[]>;
      onFileDrop: (listener: (paths: string[]) => void) => () => void;
      onNavFileDrop: (listener: (paths: string[]) => void) => () => void;
    };
  }
}

export {};
