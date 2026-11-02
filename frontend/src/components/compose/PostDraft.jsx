import { AlertTriangle, Smartphone } from 'lucide-react';
import { useI18n } from '../../i18n/index.jsx';
import { PLATFORM_LOOK } from './platformLook';
import ChakraIcon from './ChakraIcon';
import { BusyBody, Tagged } from './PhonePreview';

// The post as plain text, in the stage where the phone used to stand. The
// phone is one click away ("Preview in phone"), so the writing gets the room
// and the mock-up is there when someone wants to see it.
//
// state: the same four as PhonePreview - 'empty' | 'busy' | 'error' | 'ready'.
export default function PostDraft({ platform, state, text = '', translated = false, genSeconds = 0, onPreview }) {
  const { t, lang } = useI18n();
  const look = PLATFORM_LOOK[platform];
  const bodyFont = lang === 'hi' && !translated ? 'font-hindi' : '';

  return (
    <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[18px] border border-[#22305c]/80 bg-[#0c1430]/85">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-[#22305c]/70 px-4 py-3">
        <span
          aria-hidden="true"
          className="flex h-[22px] w-[22px] items-center justify-center rounded-md text-[11px] font-bold text-white"
          style={{ background: look.iconBg }}
        >
          {look.icon}
        </span>
        <span className="text-[15px] font-semibold text-white">{t(`cmp.plat.${platform}`)}</span>
        {translated && state === 'ready' && (
          <span className="rounded-full bg-[#fbbf24] px-2 py-px text-[12px] font-bold text-[#1B1A22]">{t('gen.translatedEnglish')}</span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onPreview}
          disabled={state !== 'ready'}
          className="cmp-act flex h-9 items-center gap-1.5 rounded-[10px] border border-[#3f9fff]/45 bg-[#15224f] px-3 text-[14px] font-semibold text-[#cfe0ff] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Smartphone size={15} strokeWidth={2} />
          {t('cmp.phonePreview')}
        </button>
      </div>

      {state === 'busy' && <BusyBody genSeconds={genSeconds} />}

      {state === 'empty' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <ChakraIcon size={56} spokes={24} color="#2c3d72" />
          <p className="max-w-[300px] text-[15px] leading-relaxed text-[#8b94b8]">{t('cmp.emptyPhone')}</p>
        </div>
      )}

      {state === 'error' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center" role="alert">
          <AlertTriangle size={28} className="text-amber-400" />
          <p className="text-[15px] leading-relaxed text-[#e6eefb]">{text}</p>
        </div>
      )}

      {state === 'ready' && (
        <div className="cmp-fadein min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className={`m-0 whitespace-pre-line text-[17px] leading-[1.75] text-[#EDEEF2] ${bodyFont}`}>
            <Tagged text={text} tagColor="#6aa8ff" />
          </p>
        </div>
      )}
    </div>
  );
}
