import { useState } from 'react';
import { ArrowLeft, Download } from 'lucide-react';

import { useI18n } from '../../i18n/index.jsx';
import { canShareFile, downloadFile, SHARE_PLATFORMS, shareImage } from '../../utils/shareImage';
import { PLATFORM_ICON } from './platformIcons';

const PLATFORM = {
  whatsapp: { label: 'WhatsApp', bg: '#25d366', ink: '#04220f' },
  facebook: { label: 'Facebook', bg: '#1877f2', ink: '#ffffff' },
  twitter:  { label: 'X',        bg: '#0f1419', ink: '#ffffff', ring: true },
  reddit:   { label: 'Reddit',   bg: '#ff4500', ink: '#ffffff' },
};

/**
 * Beside the post while it is shown as an image: the dark / light switch, a
 * share button per platform, Download, and the way back to the text post.
 * `file` is the drawn card as a PNG (hooks/usePostImage), null while drawing.
 */
export default function PostImagePanel({ file, text, look, onLook, onBack }) {
  const { t } = useI18n();
  const [note, setNote] = useState('');
  const sheet = file ? canShareFile(file) : false;

  function share(platform) {
    if (!file) return;
    setNote('');
    shareImage({ file, text, platform }).then((how) => {
      if (how === 'opened') setNote(t('img.share.opened', { platform: PLATFORM[platform].label }));
    });
  }

  return (
    <div
      className="relative overflow-hidden rounded-[20px] border border-white/[0.09] p-5 sm:p-6"
      style={{ background: 'linear-gradient(170deg, #17204b 0%, #0e1435 50%, #0a0e27 100%)', boxShadow: '0 30px 70px rgba(2,6,20,0.5)' }}
    >
      <p className="font-display text-[21px] font-bold text-white">{t('img.title')}</p>
      <p className="mt-1 text-[15px] text-[#9fb0d4]">{t('img.sub')}</p>

      <p className="mb-2 mt-5 text-[14px] font-semibold text-[#9fb0d4]">{t('img.look')}</p>
      <div role="radiogroup" aria-label={t('img.look')} className="grid grid-cols-2 gap-1 rounded-2xl border border-[#24396b] bg-[#0a1130] p-1">
        {['dark', 'light'].map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={look === id}
            onClick={() => onLook(id)}
            className={`h-11 rounded-xl text-[15px] font-semibold transition ${look === id ? 'bg-[#1d4ed8] text-white' : 'text-[#9fb0d4] hover:text-white'}`}
          >
            {t(`img.look.${id}`)}
          </button>
        ))}
      </div>

      <p className="mb-2 mt-5 text-[14px] font-semibold text-[#9fb0d4]">{t('img.shareTo')}</p>
      <div className="grid grid-cols-2 gap-2.5">
        {SHARE_PLATFORMS.map((p) => {
          const Icon = PLATFORM_ICON[p];
          const c = PLATFORM[p];
          return (
            <button
              key={p}
              type="button"
              onClick={() => share(p)}
              disabled={!file}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-[14px] px-3 text-[15px] font-bold transition hover:brightness-110 disabled:opacity-50"
              style={{ background: c.bg, color: c.ink, boxShadow: c.ring ? 'inset 0 0 0 1.5px rgba(255,255,255,0.25)' : undefined }}
            >
              {Icon && <Icon width={18} height={18} />}
              {c.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 text-[13px] leading-relaxed text-[#9aa8cc]">{sheet ? t('img.share.sheet') : t('img.share.how')}</p>
      {note && <p role="status" className="mt-2 text-[14px] font-semibold text-[#fbbf24]">{note}</p>}

      <button
        type="button"
        onClick={() => file && downloadFile(file)}
        disabled={!file}
        className="btn-gradient mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] text-[16px] font-bold text-white disabled:opacity-50"
      >
        <Download size={17} />
        {t('img.download')}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="mt-2.5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-white/10 bg-white/[0.05] text-[15px] font-semibold text-white transition hover:border-white/30"
      >
        <ArrowLeft size={17} />
        {t('img.back')}
      </button>
    </div>
  );
}
