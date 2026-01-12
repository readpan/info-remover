import fs from 'fs';
import path from 'path';
import { ProcessOptions } from './types';

export interface ResolvedPath {
  outputPath: string;
  backupPath?: string;
}

const ensureDir = async (dir: string) => {
  await fs.promises.mkdir(dir, { recursive: true });
};

export async function resolvePaths(
  inputPath: string,
  options: ProcessOptions
): Promise<ResolvedPath> {
  const parsed = path.parse(inputPath);
  const suffix = options.copySuffix ?? "-clean";

  if (options.overwriteSource) {
    // 如果覆盖源文件，先输出到一个临时文件
    const outputPath = path.join(
      parsed.dir,
      `.${parsed.name}${suffix}_tmp${parsed.ext}`
    );
    return { outputPath };
  }

  if (!options.outputDir) {
    throw new Error("未提供输出目录");
  }
  await ensureDir(options.outputDir);
  const outputPath = path.join(
    options.outputDir,
    `${parsed.name}${suffix}${parsed.ext}`
  );
  return { outputPath };
}
