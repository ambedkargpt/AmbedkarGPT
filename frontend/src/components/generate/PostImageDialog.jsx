import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, RefreshCw, X } from 'lucide-react';

import { useI18n } from '../../i18n/index.jsx';
import { parsePost } from '../../utils/parsePost';
import { drawPostImage, partyKey } from '../../utils/postImage';

/**
 * "Make an image": the post on the card template (utils/postImage.js), in a
 * dark or a light look, shown as it will be saved, with one button to download
 * it as a PNG. `card` is the post's image words (kicker, supporting line,
 * chips, coloured phrase) when its generation gave them. Portalled to the body
 * so no transformed ancestor pins it inside the page.
 */
export default function PostImageDialog({ open, onClose, content, politicalParty, card, author, role }) {
  const { t } = useI18n();
  const canvasRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [look, setLook] = useState('dark');

  useEffect(() => {
    if (!open || !canvasRef.current) return undefined;
    let live = true;
    setReady(false);
    const { headline, paragraphs, hashtags } = parsePost(content);
    drawPostImage(canvasRef.current, {
      headline: headline || paragraphs[0] || '',
      body: (headline ? paragraphs : paragraphs.slice(1)).join('\n'),
      hashtags,
      party: partyKey(politicalParty),
      look,
      card: card || {},
      author: author || '',
      role: role || '',
    }).then(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, [open, content, politicalParty, card, look, author, role]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [open, onClose]);

  if (!open) return null;

  function download() {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ambedkargpt-post-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
  }

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-[#030611]/85 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-image-title"
        className="relative flex max-h-[100dvh] w-full max-w-[560px] flex-col gap-4 overflow-y-auto rounded-t-[24px] border border-[#24396b] bg-[#081027] p-5 sm:rounded-[24px] sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="post-image-title" className="font-display text-[22px] font-bold text-white">{t('img.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('img.close')}
            className="grid h-11 w-11 place-items-center rounded-full border border-[#24396b] text-[#cfe0ff] transition hover:bg-white/[0.06] hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div role="radiogroup" aria-label={t('img.look')} className="grid grid-cols-2 gap-1 rounded-2xl border border-[#24396b] bg-[#0a1130] p-1">
          {['dark', 'light'].map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={look === id}
              onClick={() => setLook(id)}
              className={`h-10 rounded-xl text-[15px] font-semibold transition ${look === id ? 'bg-[#1d4ed8] text-white' : 'text-[#9fb0d4] hover:text-white'}`}
            >
              {t(`img.look.${id}`)}
            </button>
          ))}
        </div>

        {/* The whole square, always: as wide as the dialog but never taller
            than the screen leaves room for (the title, the switch and the
            button take about 300px), and never squeezed by the column. */}
        <div
          className="relative mx-auto aspect-square shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[#050a1c]"
          style={{ width: 'min(100%, calc(100dvh - 300px))' }}
        >
          <canvas ref={canvasRef} aria-label={t('img.preview')} className="block h-full w-full" />
          {!ready && (
            <div className="absolute inset-0 grid place-items-center text-[#9aa8cc]">
              <RefreshCw size={22} className="animate-spin" aria-hidden="true" />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={download}
          disabled={!ready}
          className="btn-gradient inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl px-6 text-[17px] font-bold text-white disabled:opacity-50"
        >
          <Download size={18} />
          {t('img.download')}
        </button>
        <p className="text-center text-[13px] text-[#9aa8cc]">{t('img.note')}</p>
      </div>
    </div>,
    document.body,
  );
}
