import { ChevronLeft, ChevronRight } from 'lucide-react';
import { pageNumbers } from '../../data/manusmriti';
import { useI18n } from '../../i18n/index.jsx';

const base =
  'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl border px-3.5 text-[14.5px] font-semibold transition';
const idle = 'border-[#1e3260]/70 bg-[#0a1428]/80 text-[#c7d6ee] hover:border-[#3a6bc4]/70 hover:text-white';
const current = 'border-[#3f6bd4]/70 bg-[#0d1a3a] text-[#3f9fff] shadow-[0_0_12px_rgba(63,159,255,0.18)]';
const off = 'cursor-not-allowed opacity-40 hover:border-[#1e3260]/70 hover:text-[#c7d6ee]';

/**
 * Previous, the page numbers, Next. Drawn only when there is more than one page, so a topic with ten entries or
 * fewer shows no pager at all. The current page is marked for screen readers (aria-current) as well as by colour.
 */
export default function Pager({ page, pages, onPage }) {
  const { t } = useI18n();
  if (pages < 2) return null;

  return (
    <nav aria-label={t('msm.pages')} className="mt-10 flex flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} className={`${base} ${idle} ${page <= 1 ? off : ''}`}>
          <ChevronLeft size={16} aria-hidden="true" />
          {t('msm.prev')}
        </button>

        {pageNumbers(page, pages).map((n, i) =>
          n === 'gap' ? (
            <span key={`gap-${i}`} className="px-1 text-white/45" aria-hidden="true">…</span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => onPage(n)}
              aria-current={n === page ? 'page' : undefined}
              aria-label={t('msm.goToPage', { n })}
              className={`${base} ${n === page ? current : idle}`}
            >
              {n}
            </button>
          ),
        )}

        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages} className={`${base} ${idle} ${page >= pages ? off : ''}`}>
          {t('msm.next')}
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
      <p className="text-[13.5px] text-[#8aa4d6]">{t('msm.pageOf', { page, pages })}</p>
    </nav>
  );
}
