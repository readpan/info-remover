import fs from 'fs';
import { PDFDocument, PDFName } from 'pdf-lib';

export async function processPdf(inputPath: string, outputPath: string) {
  const data = await fs.promises.readFile(inputPath);
  const pdfDoc = await PDFDocument.load(data, {
    updateMetadata: false,
    ignoreEncryption: true,
  });

  pdfDoc.setTitle('');
  pdfDoc.setAuthor('');
  pdfDoc.setSubject('');
  pdfDoc.setKeywords([]);
  pdfDoc.setProducer('');
  pdfDoc.setCreator('');
  pdfDoc.setLanguage('');

  const metadataRef = pdfDoc.catalog.get(PDFName.of('Metadata'));
  if (metadataRef) {
    pdfDoc.catalog.delete(PDFName.of('Metadata'));
  }

  const pages = pdfDoc.getPages();
  for (const page of pages) {
    const annotsKey = PDFName.of('Annots');
    if (page.node.has(annotsKey)) {
      page.node.delete(annotsKey);
    }
  }

  const cleaned = await pdfDoc.save({ useObjectStreams: false });
  await fs.promises.writeFile(outputPath, cleaned);

  return { removed: ['Info/XMP', '注释/表单默认值'], type: 'pdf' };
}
