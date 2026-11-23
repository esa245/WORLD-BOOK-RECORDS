'use client';

import type {PDFDocumentLoadingTask, PDFDocumentProxy} from 'pdfjs-dist';

type PdfJsModule = typeof import('pdfjs-dist');

let pdfJsPromise: Promise<PdfJsModule> | null = null;

export async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfJsPromise) {
    pdfJsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((mod) => {
      const pdfjs = mod as unknown as PdfJsModule;
      if (pdfjs.GlobalWorkerOptions) {
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
      }
      return pdfjs;
    });
  }
  return pdfJsPromise;
}

export function decodeDataUrlToUint8Array(dataUrl: string): Uint8Array | null {
  if (!dataUrl.startsWith('data:')) return null;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return null;

  const meta = dataUrl.slice(5, commaIdx).toLowerCase();
  const payload = dataUrl.slice(commaIdx + 1);

  try {
    if (meta.includes(';base64')) {
      const cleaned = payload.replace(/\s+/g, '');
      const binary = window.atob(cleaned);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }

    const decoded = decodeURIComponent(payload);
    return new TextEncoder().encode(decoded);
  } catch {
    return null;
  }
}

export async function openPdfDocument(
  sourceUrl: string,
): Promise<{doc: PDFDocumentProxy; loadingTask: PDFDocumentLoadingTask}> {
  const pdfjs = await loadPdfJs();
  const decodedBytes = decodeDataUrlToUint8Array(sourceUrl);

  const commonOptions = {
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    wasmUrl: '/pdfjs/wasm/',
    useSystemFonts: true,
    isEvalSupported: false,
  };

  const loadingTask = decodedBytes
    ? pdfjs.getDocument({
        data: decodedBytes,
        ...commonOptions,
      })
    : pdfjs.getDocument({
        url: sourceUrl,
        ...commonOptions,
      });

  const doc = await loadingTask.promise;
  return {doc, loadingTask};
}

export async function extractPdfCoverAndMeta(
  sourceUrl: string,
): Promise<{coverDataUrl: string; numPages: number} | null> {
  try {
    const {doc, loadingTask} = await openPdfDocument(sourceUrl);
    try {
      const numPages = doc.numPages;
      const page = await doc.getPage(1);
      const baseViewport = page.getViewport({scale: 1});
      const targetWidth = 480;
      const targetHeight = 720;

      const scale = Math.max(
        targetWidth / baseViewport.width,
        targetHeight / baseViewport.height,
      );
      const renderViewport = page.getViewport({scale});

      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = Math.ceil(renderViewport.width);
      pageCanvas.height = Math.ceil(renderViewport.height);
      const pageCtx = pageCanvas.getContext('2d');
      if (!pageCtx) return null;

      pageCtx.fillStyle = '#ffffff';
      pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

      await page.render({
        canvasContext: pageCtx,
        canvas: pageCanvas,
        viewport: renderViewport,
      }).promise;

      const coverCanvas = document.createElement('canvas');
      coverCanvas.width = targetWidth;
      coverCanvas.height = targetHeight;
      const coverCtx = coverCanvas.getContext('2d');
      if (!coverCtx) return null;

      coverCtx.fillStyle = '#ffffff';
      coverCtx.fillRect(0, 0, targetWidth, targetHeight);

      // Fit top of PDF page cleanly inside 2:3 cover frame
      const fitScale = Math.min(
        targetWidth / pageCanvas.width,
        targetHeight / pageCanvas.height,
      );
      const drawW = pageCanvas.width * fitScale;
      const drawH = pageCanvas.height * fitScale;
      const dx = (targetWidth - drawW) / 2;
      const dy = (targetHeight - drawH) / 2;

      coverCtx.drawImage(pageCanvas, dx, dy, drawW, drawH);

      return {
        coverDataUrl: coverCanvas.toDataURL('image/jpeg', 0.84),
        numPages,
      };
    } finally {
      await loadingTask.destroy();
    }
  } catch {
    return null;
  }
}
