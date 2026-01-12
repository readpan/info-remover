import fs from 'fs';
import path from 'path';

const isDirectory = async (p: string) => {
  try {
    const stat = await fs.promises.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
};

async function walk(dir: string, acc: Set<string>) {
  const entries = await fs.promises.readdir(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = await fs.promises.stat(full);
    if (stat.isDirectory()) {
      await walk(full, acc);
    } else if (stat.isFile()) {
      acc.add(full);
    }
  }
}

export async function scanPaths(paths: string[]): Promise<string[]> {
  const files = new Set<string>();
  for (const p of paths) {
    if (await isDirectory(p)) {
      await walk(p, files);
    } else {
      files.add(p);
    }
  }
  return Array.from(files);
}
