'use client';

import React, {useEffect, useMemo, useRef, useState} from 'react';
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from 'pdfjs-dist';
import {
  ArrowLeft,
  Download,
  FileWarning,
  Loader2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {openPdfDocument} from '@/lib/pdf-client';

interface PdfCanvasReaderProps {
  fileUrl: string;
  title: string;
  theme?: 'dark' | 'sepia' | 'light';
  compact?: boolean;
  fullPage?: boolean;
  onClose?: () => void;
  onScrollProgress?: (pct: number) => void;
  onPageCount?: (count: number) => void;
  onDownload?: () => void;
}

interface PdfPageCanvasProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  targetWidth: number;
  fullPage: boolean;
}

function PdfPageCanvas({
  pdfDoc,
  pageNumber,
  targetWidth,
  fullPage,
}: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const holderRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(pageNumber <= 3);
  const renderKey = `${pageNumber}_${Math.round(targetWidth)}`;
  const [renderedState, setRenderedState] = useState<{
    key: string;
    error: boolean;
  } | null>(null);

  useEffect(() => {
    const el = holderRef.current;
    if (!el || isVisible) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {rootMargin: '700px 0px'},
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;
    let cancelled = false;
    let renderTask: RenderTask | null = null;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const unscaledViewport = page.getViewport({scale: 1});
        const fitWidth = Math.max(240, targetWidth);
        const cssScale = fitWidth / unscaledViewport.width;
        const cssViewport = page.getViewport({scale: cssScale});

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(cssViewport.width * dpr);
        canvas.height = Math.floor(cssViewport.height * dpr);
        canvas.style.width = `${Math.floor(cssViewport.width)}px`;
        canvas.style.height = `${Math.floor(cssViewport.height)}px`;

        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();

        renderTask = page.render({
          canvasContext: ctx,
          canvas,
          viewport: cssViewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });

        await renderTask.promise;
        if (!cancelled) {
          setRenderedState({key: renderKey, error: false});
        }
      } catch (err) {
        if (
          !cancelled &&
          !(err instanceof Error && err.name === 'RenderingCancelledException')
        ) {
          setRenderedState({key: renderKey, error: true});
        }
      }
    };

    renderPage();

    return () => {
      cancelled = true;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [isVisible, pdfDoc, pageNumber, targetWidth, renderKey]);

  const isRendering = renderedState?.key !== renderKey;
  const hasError = renderedState?.key === renderKey && renderedState.error;

  return (
    <div
      ref={holderRef}
      className={`mx-auto overflow-hidden ${
        fullPage
          ? 'shadow-[0_6px_24px_rgba(0,0,0,0.45)]'
          : 'rounded-[8px] shadow-[0_12px_32px_rgba(0,0,0,0.45)]'
      }`}
      style={{maxWidth: fullPage ? 'none' : '100%', width: `${Math.round(targetWidth)}px`}}
    >
      <div className="relative flex justify-center bg-white min-h-[260px]">
        <canvas ref={canvasRef} className="block h-auto" />
        {isRendering && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/5 text-[#66512d]">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}
        {hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center text-[#5b4c32] bg-[#f7f4ed] text-[12px]">
            <FileWarning className="w-5 h-5 mb-1.5 text-[#b38734]" />
            <span>Could not render page {pageNumber}.</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PdfCanvasReader({
  fileUrl,
  title,
  theme = 'dark',
  compact = false,
  fullPage = false,
  onClose,
  onScrollProgress,
  onPageCount,
  onDownload,
}: PdfCanvasReaderProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const onPageCountRef = useRef(onPageCount);
  useEffect(() => {
    onPageCountRef.current = onPageCount;
  }, [onPageCount]);

  const [containerWidth, setContainerWidth] = useState<number>(
    fullPage ? 960 : compact ? 540 : 780,
  );
  const [zoom, setZoom] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [loadState, setLoadState] = useState<{
    sourceUrl: string;
    doc: PDFDocumentProxy | null;
    numPages: number;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const updateWidth = () => {
      const padding = fullPage ? 0 : compact ? 20 : 24;
      const minW = fullPage ? el.clientWidth : Math.min(260, el.clientWidth - padding);
      const available = Math.max(minW, el.clientWidth - padding);
      setContainerWidth(
        fullPage
          ? Math.min(available, 1100)
          : Math.min(available, compact ? 580 : 900),
      );
    };

    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [compact, fullPage]);

  useEffect(() => {
    let active = true;
    let activeTask: PDFDocumentLoadingTask | null = null;

    openPdfDocument(fileUrl)
      .then(({doc, loadingTask}) => {
        if (!active) {
          loadingTask.destroy().catch(() => undefined);
          return;
        }
        activeTask = loadingTask;
        setLoadState({
          sourceUrl: fileUrl,
          doc,
          numPages: doc.numPages,
          error: null,
        });
        setCurrentPage(1);
        onPageCountRef.current?.(doc.numPages);
      })
      .catch(() => {
        if (!active) return;
        setLoadState({
          sourceUrl: fileUrl,
          doc: null,
          numPages: 0,
          error:
            'Could not display this PDF directly in the browser. You can download and open it on your device.',
        });
      });

    return () => {
      active = false;
      if (activeTask) {
        activeTask.destroy().catch(() => undefined);
      }
    };
  }, [fileUrl]);

  const isLoading = loadState?.sourceUrl !== fileUrl;
  const activeDoc = loadState?.sourceUrl === fileUrl ? loadState.doc : null;
  const numPages = loadState?.sourceUrl === fileUrl ? loadState.numPages : 0;
  const loadError = loadState?.sourceUrl === fileUrl ? loadState.error : null;

  const pageNumbers = useMemo(
    () => Array.from({length: numPages}, (_, i) => i + 1),
    [numPages],
  );

  const pageTargetWidth = Math.round(containerWidth * zoom);

  return (
    <div className="relative flex flex-col h-full w-full overflow-hidden">
      {/* Minimal floating corner controls in Full-Page PDF mode; regular toolbar otherwise */}
      {fullPage ? (
        <>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={`Back from ${title}`}
              className="fixed top-3 left-2.5 sm:left-3 z-50 inline-flex items-center gap-1 rounded-full bg-black/75 hover:bg-black/90 text-[#f7f4ed] border border-white/15 backdrop-blur-md px-2.5 py-1.5 text-[11.5px] sm:text-[12px] font-semibold cursor-pointer shadow-lg transition-colors min-h-[36px]"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#d8b35d]" />
              <span>Back</span>
            </button>
          )}

          <div className="fixed top-3 right-2.5 sm:right-3 z-50 inline-flex items-center gap-0.5 sm:gap-1 rounded-full bg-black/75 text-[#f7f4ed] border border-white/15 backdrop-blur-md px-2 py-1 text-[11px] font-semibold shadow-lg min-h-[36px]">
            {numPages > 0 && (
              <span className="px-1.5 tabular-nums text-[#d8b35d]">
                {currentPage}/{numPages}
              </span>
            )}
            <button
              type="button"
              onClick={() =>
                setZoom((z) => Math.max(0.7, Number((z - 0.15).toFixed(2))))
              }
              aria-label="Zoom out PDF"
              className="p-1.5 rounded-full hover:bg-white/10 bg-transparent border-0 text-inherit cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="px-1 bg-transparent border-0 text-inherit cursor-pointer tabular-nums"
              title="Reset zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() =>
                setZoom((z) => Math.min(2, Number((z + 0.15).toFixed(2))))
              }
              aria-label="Zoom in PDF"
              className="p-1.5 rounded-full hover:bg-white/10 bg-transparent border-0 text-inherit cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            {onDownload && (
              <button
                type="button"
                onClick={onDownload}
                aria-label="Download PDF"
                title="Download PDF"
                className="p-1.5 rounded-full hover:bg-white/10 text-[#d8b35d] bg-transparent border-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </>
      ) : (
        <div
          className={`px-3 sm:px-4 py-2 border-b flex items-center justify-between gap-2 flex-wrap shrink-0 ${
            theme === 'dark'
              ? 'bg-[#141417] border-[#2b2720] text-[#d2cec5]'
              : theme === 'sepia'
                ? 'bg-[#ede2c8] border-[#d6c8aa] text-[#3a2d1f]'
                : 'bg-[#f4f2ee] border-[#e4e1db] text-[#222]'
          }`}
        >
          <div className="text-[12px] font-semibold truncate">
            {numPages > 0 ? (
              <span className="tabular-nums">
                Page {currentPage} of {numPages}
              </span>
            ) : (
              <span className="truncate">{title}</span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                setZoom((z) => Math.max(0.7, Number((z - 0.15).toFixed(2))))
              }
              aria-label="Zoom out PDF"
              className={`p-1.5 rounded-[6px] border cursor-pointer transition-colors ${
                theme === 'dark'
                  ? 'border-[#3a3326] hover:border-[#d8b35d] bg-transparent text-inherit'
                  : 'border-[#c8bba0] hover:border-[#9e7d32] bg-transparent text-inherit'
              }`}
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="px-2 py-1 text-[11px] font-bold tabular-nums bg-transparent border-0 text-inherit cursor-pointer"
              title="Reset zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() =>
                setZoom((z) => Math.min(2, Number((z + 0.15).toFixed(2))))
              }
              aria-label="Zoom in PDF"
              className={`p-1.5 rounded-[6px] border cursor-pointer transition-colors ${
                theme === 'dark'
                  ? 'border-[#3a3326] hover:border-[#d8b35d] bg-transparent text-inherit'
                  : 'border-[#c8bba0] hover:border-[#9e7d32] bg-transparent text-inherit'
              }`}
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Scrollable Rendered Pages */}
      <div
        ref={scrollContainerRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const maxScroll = el.scrollHeight - el.clientHeight;
          const pct =
            maxScroll <= 0
              ? 100
              : Math.min(
                  100,
                  Math.max(1, Math.round((el.scrollTop / maxScroll) * 100)),
                );
          onScrollProgress?.(pct);
          if (numPages > 0) {
            const approxPage = Math.min(
              numPages,
              Math.max(
                1,
                Math.ceil(
                  ((el.scrollTop + el.clientHeight * 0.4) /
                    Math.max(1, el.scrollHeight)) *
                    numPages,
                ),
              ),
            );
            setCurrentPage(approxPage);
          }
        }}
        className={`flex-1 overflow-y-auto overflow-x-auto touch-pan-x touch-pan-y touch-pinch-zoom ${
          fullPage ? 'p-0 space-y-2' : 'p-3 sm:p-5 space-y-5'
        } ${compact ? 'max-h-[430px]' : ''} ${
          fullPage
            ? 'bg-[#111114]'
            : theme === 'dark'
              ? 'bg-[#0b0b0d]'
              : theme === 'sepia'
                ? 'bg-[#e7dbc0]'
                : 'bg-[#e8e6e1]'
        }`}
      >
        {isLoading && (
          <div className="min-h-[60vh] flex flex-col items-center justify-center gap-2.5 text-center text-[#d2cec5]">
            <Loader2 className="w-7 h-7 animate-spin text-[#d8b35d]" />
            <div className="text-[13px] font-medium">Loading PDF pages…</div>
          </div>
        )}

        {loadError && (
          <div className="py-16 px-4 max-w-[440px] mx-auto text-center space-y-3 text-[#d2cec5]">
            <FileWarning className="w-8 h-8 text-[#d8b35d] mx-auto" />
            <p className="text-[13px] leading-relaxed m-0 opacity-85">
              {loadError}
            </p>
            {onDownload && (
              <button
                type="button"
                onClick={onDownload}
                className="inline-flex items-center gap-1.5 border border-[#d8b35d] rounded-[8px] px-4 py-2 text-[12.5px] font-bold text-[#16130c] bg-[#d8b35d] hover:bg-[#f2d58b] cursor-pointer transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Download PDF</span>
              </button>
            )}
          </div>
        )}

        {activeDoc &&
          pageNumbers.map((pageNum) => (
            <PdfPageCanvas
              key={pageNum}
              pdfDoc={activeDoc}
              pageNumber={pageNum}
              targetWidth={pageTargetWidth}
              fullPage={fullPage}
            />
          ))}
      </div>
    </div>
  );
}
