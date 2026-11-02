import { AlertTriangle } from 'lucide-react';
import { useI18n } from '../../i18n/index.jsx';
import { PLATFORM_LOOK } from './platformLook';
import ChakraIcon from './ChakraIcon';

// The post, inside a phone, drawn the way the picked platform will show it.
//
// state: 'empty'   nothing generated yet for this story + platform
//        'busy'    generating / regenerating (skeleton + turning chakra + steps)
//        'error'   postFailed — the server's own reason, in its own frame
//        'ready'   the post
//
// text is exactly what "Post to …" will send (the translation when it is on).

const TAG_SPLIT = /(\s#[^\s#]+)/;

export function Tagged({ text, tagColor }) {
  return text.split(TAG_SPLIT).filter(Boolean).map((part, i) => (
    /^\s#/.test(part)
      ? <span key={i} style={{ color: tagColor }}>{part}</span>
      : <span key={i}>{part}</span>
  ));
}

function Avatar({ name, size = 40 }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-[#3f9fff] font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {(name || 'A').trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function BusyBody({ genSeconds }) {
  const { t } = useI18n();
  const step = genSeconds < 2 ? 0 : genSeconds < 5 ? 1 : 2;
  const steps = [t('cmp.st1'), t('cmp.st2'), t('cmp.st3')];
  return (
    <div className="flex flex-1 flex-col gap-3 px-[18px] py-[22px]" aria-live="polite">
      <div className="flex items-center gap-2.5">
        <span className="cmp-shim h-10 w-10 rounded-full" />
        <span className="flex flex-col gap-1.5"><span className="cmp-shim h-[11px] w-[120px]" /><span className="cmp-shim h-[9px] w-20" /></span>
      </div>
      <span className="cmp-shim h-3" /><span className="cmp-shim h-3 w-[92%]" /><span className="cmp-shim h-3 w-[96%]" /><span className="cmp-shim h-3 w-[64%]" />
      <div className="mt-auto flex shrink-0 flex-col items-center gap-3.5 pb-5">
        <ChakraIcon size={64} spokes={24} color="#6aa8ff" spinning />
        <ol className="m-0 flex list-none flex-col gap-1.5 p-0 text-[15px]">
          {steps.map((s, i) => (
            <li key={s} className={i === step ? 'font-semibold text-white' : i < step ? 'text-[#c0cde8]' : 'text-[#5a6e9a]'}>
              {i < step ? '✓' : i === step ? '●' : '○'} {s}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default function PhonePreview({
  platform, state, text = '', authorName, authorHandle, article, lensLabel, translated = false, genSeconds = 0,
}) {
  const { t, lang } = useI18n();
  const look = PLATFORM_LOOK[platform];
  const busy = state === 'busy';
  const bodyFont = lang === 'hi' && !translated ? 'font-hindi' : '';
  const appTitle = look.appTitleKey ? t(look.appTitleKey) : look.appTitle;

  const [first = '', ...rest] = text.trim().split('\n');

  return (
    <div className="flex h-full min-h-0 items-center justify-center">
      <div
        className="relative box-border aspect-[340/620] h-full max-h-[620px] rounded-[46px] bg-[#05070d] p-2.5"
        style={{ boxShadow: `0 0 0 1px #22305c, 0 30px 70px -30px rgba(0,0,0,.9), 0 0 60px -20px rgba(${look.hue},0.45)` }}
      >
        <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[38px]" style={{ background: busy ? '#101937' : look.frame }}>
          {/* status bar */}
          <div className="flex h-[34px] shrink-0 items-center justify-between whitespace-nowrap px-[22px] text-[12px] font-semibold text-[#e5e7eb]">
            <span>10:42</span>
            <span aria-hidden="true" className="h-[22px] w-[90px] rounded-full bg-[#05070d]" />
            <span>5G ▮▮▮</span>
          </div>
          {/* app bar */}
          <div
            className="flex h-11 shrink-0 items-center gap-2.5 border-b px-4"
            style={{ background: busy ? '#101937' : look.bar, borderColor: busy ? '#22305c' : look.barBorder }}
          >
            <span className="text-[15px] font-bold" style={{ color: busy ? '#8b94b8' : look.barFg }}>{appTitle}</span>
            <span className="ml-auto flex h-[22px] w-[22px] items-center justify-center rounded-md text-[11px] font-bold text-white" style={{ background: look.iconBg }}>
              {look.icon}
            </span>
          </div>

          {busy && <BusyBody genSeconds={genSeconds} />}

          {state === 'empty' && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
              <ChakraIcon size={56} spokes={24} color="#2a3566" />
              <p className="text-[15px] leading-relaxed text-[#8b94b8]">{t('cmp.emptyPhone')}</p>
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center" role="alert">
              <AlertTriangle size={28} className="text-amber-400" />
              <p className="text-[15px] leading-relaxed text-[#e6eefb]">{text}</p>
            </div>
          )}

          {state === 'ready' && platform === 'twitter' && (
            <div className="cmp-fadein cmp-phone-scroll flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-4">
              <div className="flex items-center gap-2.5">
                <Avatar name={authorName} />
                <span className="flex flex-col leading-[1.3]">
                  <strong className="text-[15.5px] text-white">{authorName} <span className="text-[#1D9BF0]">✓</span></strong>
                  <span className="text-[14px] text-[#71767B]">@{authorHandle} · {t('cmp.now')}</span>
                </span>
              </div>
              <p className={`m-0 whitespace-pre-line text-[16.5px] leading-[1.6] text-[#E7E9EA] ${bodyFont}`}>
                <Tagged text={text} tagColor="#1D9BF0" />
              </p>
              <div className="overflow-hidden rounded-[14px] border border-[#2F3336]">
                <div
                  className="box-border flex h-[110px] flex-col justify-between px-3.5 py-3"
                  style={{ background: 'radial-gradient(220px 130px at 90% 0%, rgba(106,168,255,.35), transparent 70%), linear-gradient(160deg,#0f2a66,#0c1430)' }}
                >
                  {lensLabel
                    ? <span className="self-start rounded-[7px] bg-[#fbbf24]/15 px-2 py-px text-[13px] font-bold text-[#fcd34d]">§ {lensLabel}</span>
                    : <span />}
                  <span className="font-hindi line-clamp-2 text-[15.5px] font-bold leading-[1.45] text-white">{article?.title}</span>
                </div>
                <div className="px-3 py-[7px] text-[13.5px] text-[#71767B]">ambedkargpt.in</div>
              </div>
              <div className="mt-auto flex shrink-0 items-center gap-5 pb-1.5 text-[14px] text-[#71767B]"><span>💬 0</span><span>🔁 0</span><span>♡ 0</span></div>
            </div>
          )}

          {state === 'ready' && platform === 'reddit' && (
            <div className="cmp-fadein cmp-phone-scroll flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-4">
              <div className="flex items-center gap-2 text-[14px] text-[#818384]">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FF4500] text-[11px] font-bold text-white">r/</span>
                <strong className="text-[#D7DADC]">r/india</strong>
                <span>· u/{authorHandle} · {t('cmp.now')}</span>
              </div>
              <h3 className={`m-0 text-[18px] font-semibold leading-[1.45] text-[#D7DADC] ${bodyFont}`}>{first}</h3>
              <p className={`m-0 whitespace-pre-line text-[15.5px] leading-[1.6] text-[#C9CCCF] ${bodyFont}`}>{rest.join(' ').trim()}</p>
              <div className="mt-auto flex shrink-0 gap-2.5 pb-1.5 text-[14px] font-semibold text-[#818384]">
                <span className="rounded-full bg-[#272729] px-2.5 py-1">⬆ 1 ⬇</span>
                <span className="rounded-full bg-[#272729] px-2.5 py-1">💬 0</span>
              </div>
            </div>
          )}

          {state === 'ready' && platform === 'whatsapp' && (
            <div className="cmp-fadein cmp-phone-scroll flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#0B141A] px-3 py-4">
              <div className={`mt-auto max-w-[92%] self-end whitespace-pre-line rounded-[12px_12px_4px_12px] bg-[#005C4B] px-[11px] pb-[5px] pt-[9px] text-[16px] leading-[1.55] text-[#E9EDEF] ${bodyFont}`}>
                <Tagged text={text} tagColor="#53BDEB" />
                <span className="block text-right text-[12.5px] text-[#A8D5CB]">10:42 ✓✓</span>
              </div>
            </div>
          )}

          {state === 'ready' && platform === 'facebook' && (
            <div className="cmp-fadein cmp-phone-scroll flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3.5">
              <div className="flex items-center gap-2.5">
                <Avatar name={authorName} size={36} />
                <span className="flex flex-col leading-[1.3]">
                  <strong className="text-[15.5px] text-white">{authorName}</strong>
                  <span className="text-[13.5px] text-[#B0B3B8]">{t('cmp.now')} · 🌐</span>
                </span>
              </div>
              <p className={`m-0 whitespace-pre-line text-[15px] leading-[1.6] text-[#E4E6EB] ${bodyFont}`}>
                <Tagged text={text} tagColor="#2D88FF" />
              </p>
              <div className="mt-auto flex shrink-0 justify-around border-t border-[#3E4042] pb-1 pt-2 text-[14.5px] font-semibold text-[#B0B3B8]">
                <span>👍 {t('cmp.like')}</span><span>💬 {t('cmp.comment')}</span><span>↗ {t('cmp.share')}</span>
              </div>
            </div>
          )}

          {translated && state === 'ready' && (
            <span className="absolute right-3 top-[88px] rounded-full bg-[#fbbf24] px-2.5 py-0.5 text-[13px] font-bold text-[#1B1A22]">
              {t('gen.translatedEnglish')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
