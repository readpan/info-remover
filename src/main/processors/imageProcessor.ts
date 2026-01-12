import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export async function processImage(inputPath: string, outputPath: string) {
  const meta = await sharp(inputPath).metadata();
  const iccProfile = typeof meta.icc === 'string' ? meta.icc : undefined;
  const supportedFormats = new Set([
    'jpeg',
    'jpg',
    'png',
    'webp',
    'tiff',
    'gif',
    'avif',
    'heif',
  ]);

  const ext = path.parse(inputPath).ext.replace('.', '').toLowerCase();
  const formatFromMeta = meta.format && supportedFormats.has(meta.format) ? meta.format : null;
  const formatFromExt = supportedFormats.has(ext) ? ext : null;
  const targetFormat = (formatFromMeta || formatFromExt || 'png') as unknown as sharp.AvailableFormatInfo;

  let pipeline = sharp(inputPath);
  if (iccProfile) {
    pipeline = pipeline.withMetadata({ icc: iccProfile });
  }

  pipeline = pipeline.toFormat(targetFormat);
  const buffer = await pipeline.toBuffer();
  await fs.promises.writeFile(outputPath, new Uint8Array(buffer));

  return {
    removed: ['EXIF/IPTC/XMP/MakerNotes', '缩略图/自定义块'],
    type: 'image',
  };
}
