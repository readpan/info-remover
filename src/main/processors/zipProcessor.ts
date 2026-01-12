import fs from 'fs';
import JSZip from 'jszip';

export async function processZip(inputPath: string, outputPath: string) {
  const data = await fs.promises.readFile(inputPath);
  const zip = await JSZip.loadAsync(data);
  const rebuilt = new JSZip();

  const entries = Object.values(zip.files);
  for (const entry of entries) {
    if (entry.dir) {
      rebuilt.folder(entry.name);
      continue;
    }
    const content = await entry.async('nodebuffer');
    rebuilt.file(entry.name, content, { date: entry.date, binary: true });
  }

  const buffer = await rebuilt.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
  await fs.promises.writeFile(outputPath, buffer);

  return { removed: ['ZIP 注释/附加头'], type: 'zip' };
}
