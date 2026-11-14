/**
 * Book page viewer - opened in a new tab from a BheemBot source pill.
 *
 *   /book/:volume/:page?p=<printed page>&t=<work title>
 *
 * `:page` is the page index inside the scanned PDF; `p` is the number printed on that page
 * (the two differ by the front matter), used only for the label. Only the requested page is
 * rendered, with pdf.js, which fetches the parts of the PDF it needs by HTTP range request
 * instead of downloading the whole 11-13 MB volume. A plain `file.pdf#page=N` link was not
 * used because Android Chrome downloads the whole file and ignores the page, and iOS opens
 * page 1.
 *
 * The books are served from VITE_BOOKS_BASE_URL (default `/books`, i.e. frontend/public/books
 * in development and /var/www/ambedkar/books behind nginx in production).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BookOpen, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const BOOKS_BASE = (import.meta.env.VITE_BOOKS_BASE_URL || '/books').replace(/\/$/, '');
const VOLUMES = { 1: 'Volume1.pdf', 2: 'Volume2.pdf', 3: 'Volume3.pdf' };   // whitelist: no arbitrary paths
const SERIES = "Dr. Babasaheb Ambedkar: Writings and Speeches";

export default function BookPage() {
  const { volume, page } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const docRef = useRef(null);
  const [numPages, setNumPages] = useState(null);
  const [status, setStatus] = useState('loading');   // loading | ready | error

  const file = VOLUMES[volume];
  const pdfPage = Math.max(1, parseInt(page, 10) || 1);
  const pdfUrl = file ? `${BOOKS_BASE}/${file}` : null;

  // `p` travels in the URL and Prev/Next move it with the PDF page: App's PageTransition remounts
  // this component on every path change, so it cannot remember the page it was opened at.
  const printed = parseInt(params.get('p'), 10) || null;
  const title = params.get('t');

  useEffect(() => {
    document.title = `${title ? `${title} - ` : ''}Vol. ${volume}${printed ? `, p. ${printed}` : ''} | BheemBot`;
  }, [title, volume, printed]);

  // Open the document once per volume.
  useEffect(() => {
    if (!pdfUrl) {
      setStatus('error');
      return undefined;
    }
    let cancelled = false;
    const task = pdfjsLib.getDocument({ url: pdfUrl, disableAutoFetch: true, disableStream: true });
    task.promise
      .then((doc) => {
        if (cancelled) return;
        docRef.current = doc;
        setNumPages(doc.numPages);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(`Could not open ${pdfUrl}:`, err);   // the reader only sees "could not be opened"
        setStatus('error');
      });
    return () => {
      cancelled = true;
      task.destroy();
      docRef.current = null;
    };
  }, [pdfUrl]);

  // Render the current page, sharp on high-density screens, fitted to the width available.
  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || !numPages) return undefined;
    if (pdfPage > numPages) {
      setStatus('error');
      return undefined;
    }
    let renderTask = null;
    let cancelled = false;
    setStatus('loading');
    doc
      .getPage(pdfPage)
      .then((p) => {
        if (cancelled) return;
        // A width of 0 (the page measured before it was laid out) would scale the page to nothing
        // and leave a blank canvas that reports "ready"; fall back to the window instead.
        const width = Math.min(canvas.parentElement.clientWidth || window.innerWidth - 32 || 600, 900);
        const base = p.getViewport({ scale: 1 });
        const viewport = p.getViewport({ scale: width / base.width });
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const ctx = canvas.getContext('2d');
        renderTask = p.render({
          canvas,
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
        });
        return renderTask.promise.then(() => !cancelled && setStatus('ready'));
      })
      .catch((err) => {
        if (cancelled || err?.name === 'RenderingCancelledException') return;
        console.error(`Could not render page ${pdfPage} of ${pdfUrl}:`, err);
        setStatus('error');
      });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfPage, numPages]);

  const go = (delta) => {
    const next = pdfPage + delta;
    if (next < 1 || (numPages && next > numPages)) return;
    const query = new URLSearchParams(params);
    if (printed) {
      if (printed + delta >= 1) query.set('p', String(printed + delta));
      else query.delete('p');   // into the front matter, which has no printed number
    }
    navigate(`/book/${volume}/${next}?${query.toString()}`, { replace: true });
  };

  const heading = useMemo(
    () => [title, `Vol. ${volume}`, printed ? `p. ${printed}` : null].filter(Boolean).join(' · '),
    [title, volume, printed],
  );

  return (
    <div className="min-h-screen bg-[#030816] text-[#d0dff2]">
      <header className="sticky top-0 z-10 border-b border-[#1e3260]/60 bg-[#050c1f]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[960px] flex-wrap items-center gap-3 px-4 py-3">
          <BookOpen size={18} className="shrink-0 text-[#4d94ff]" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] uppercase tracking-[0.08em] text-[#5a80b8]">{SERIES}</p>
            <h1 className="truncate text-[15px] font-semibold text-white">{heading}</h1>
          </div>
          <nav className="flex items-center gap-1.5" aria-label="Page navigation">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={pdfPage <= 1}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#1e3260] px-2.5 text-[12.5px] hover:border-[#4d94ff] disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft size={15} /> Prev
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={!!numPages && pdfPage >= numPages}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#1e3260] px-2.5 text-[12.5px] hover:border-[#4d94ff] disabled:opacity-40"
              aria-label="Next page"
            >
              Next <ChevronRight size={15} />
            </button>
            {pdfUrl && (
              <a
                href={`${pdfUrl}#page=${pdfPage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12.5px] text-[#4d94ff] hover:text-[#7ab4ff]"
              >
                Full PDF <ExternalLink size={13} />
              </a>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[960px] px-4 py-6">
        <div className="relative flex justify-center">
          {status === 'loading' && (
            <div className="absolute inset-x-0 top-10 text-center text-[13px] text-[#5a80b8]" role="status">
              Opening page…
            </div>
          )}
          {status === 'error' && (
            <div className="mt-10 max-w-md text-center text-[13.5px]" role="alert">
              <p className="text-white">This page could not be opened.</p>
              {pdfUrl && (
                <p className="mt-2 text-[#5a80b8]">
                  You can still{' '}
                  <a className="text-[#4d94ff] underline" href={pdfUrl} target="_blank" rel="noopener noreferrer">
                    open the full volume
                  </a>
                  .
                </p>
              )}
            </div>
          )}
          {/* Always mounted, so Prev/Next can recover from an error; hidden while it has nothing to show. */}
          <canvas
            ref={canvasRef}
            className={`rounded-md bg-white shadow-[0_8px_40px_rgba(0,0,0,0.5)] transition-opacity ${
              status === 'ready' ? 'opacity-100' : 'opacity-0'
            } ${status === 'error' ? 'hidden' : ''}`}
            role="img"
            aria-label={`Scanned page: ${heading}`}
          />
        </div>
      </main>
    </div>
  );
}
