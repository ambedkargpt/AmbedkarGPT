import {
  ArrowBigDown, ArrowBigUp, BarChart2, CheckCheck, Globe2, Heart, MessageCircle, MessageSquare,
  Repeat2, Share2, ThumbsUp,
} from 'lucide-react';
import { useI18n } from '../../i18n/index.jsx';
import { PLATFORM_ICON } from './platformIcons';

/**
 * The post drawn the way its platform shows it, so a WhatsApp message looks
 * like a WhatsApp message (a green bubble with ticks) and not like a tweet.
 * The words themselves come in as children.
 */
export default function PostFrame({ platform, authorName, subtitle, handle, children }) {
  const { t, lang } = useI18n();
  const Icon = PLATFORM_ICON[platform];
  const initial = (authorName?.[0] || 'A').toUpperCase();
  const now = new Date().toLocaleTimeString(lang === 'hi' ? 'hi-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit' });
  const avatar = (size = 'h-11 w-11 text-[17px]') => (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3f9fff] to-[#5b7cff] font-display font-bold text-white ${size}`}>
      {initial}
    </span>
  );

  if (platform === 'whatsapp') {
    return (
      <article className="overflow-hidden rounded-[20px] border border-[#25d366]/30 shadow-[0_30px_70px_rgba(2,6,20,0.5)]">
        <header className="flex items-center gap-3 bg-[#1f2c33] px-5 py-3.5">
          {avatar('h-10 w-10 text-[17px]')}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-semibold text-[#e9edef]">{authorName}</p>
            <p className="truncate text-[13px] text-[#8696a0]">{subtitle || t('gen.frame.online')}</p>
          </div>
          {Icon && <span className="text-[#25d366]"><Icon width={22} height={22} /></span>}
        </header>
        <div
          className="px-4 py-6 sm:px-8"
          style={{
            backgroundColor: '#0b141a',
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)',
            backgroundSize: '18px 18px',
          }}
        >
          <div className="relative ml-auto max-w-[680px] rounded-[14px] rounded-tr-md bg-[#005c4b] px-4 pb-2 pt-3.5 text-[#e9edef] shadow-[0_2px_8px_rgba(0,0,0,0.35)] sm:px-5">
            {children}
            <p className="mt-1 flex items-center justify-end gap-1 text-[13px] text-[#a6c4bd]">
              {now}
              <CheckCheck size={16} className="text-[#53bdeb]" />
            </p>
          </div>
        </div>
      </article>
    );
  }

  if (platform === 'facebook') {
    return (
      <article className="overflow-hidden rounded-[20px] border border-[#1877f2]/30 bg-[#18191a] shadow-[0_30px_70px_rgba(2,6,20,0.5)]">
        <header className="flex items-center gap-3 px-5 pb-3 pt-5 sm:px-6">
          {avatar()}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-semibold text-[#e4e6eb]">{authorName}</p>
            <p className="flex items-center gap-1 text-[13px] text-[#b0b3b8]">{t('gen.frame.now')} · <Globe2 size={12} /></p>
          </div>
          {Icon && <span className="text-[#1877f2]"><Icon width={22} height={22} /></span>}
        </header>
        <div className="px-5 pb-4 sm:px-6">{children}</div>
        <footer className="mx-5 grid grid-cols-3 border-t border-[#3e4042] py-1.5 text-[15px] font-semibold text-[#b0b3b8] sm:mx-6">
          <span className="flex items-center justify-center gap-2 py-2"><ThumbsUp size={17} />{t('gen.frame.like')}</span>
          <span className="flex items-center justify-center gap-2 py-2"><MessageSquare size={17} />{t('gen.frame.comment')}</span>
          <span className="flex items-center justify-center gap-2 py-2"><Share2 size={17} />{t('gen.frame.share')}</span>
        </footer>
      </article>
    );
  }

  if (platform === 'reddit') {
    return (
      <article className="flex overflow-hidden rounded-[20px] border border-[#ff4500]/30 bg-[#1a1a1b] shadow-[0_30px_70px_rgba(2,6,20,0.5)]">
        <div className="flex w-12 shrink-0 flex-col items-center gap-1 bg-[#161617] pt-5 text-[#818384]">
          <ArrowBigUp size={22} className="text-[#ff4500]" />
          <span className="font-count text-[13px] font-bold text-[#d7dadc]">1</span>
          <ArrowBigDown size={22} />
        </div>
        <div className="min-w-0 flex-1 px-4 pb-4 pt-4 sm:px-5">
          <p className="mb-3 flex items-center gap-2 text-[13px] text-[#818384]">
            {Icon && <span className="text-[#ff4500]"><Icon width={18} height={18} /></span>}
            <span className="font-semibold text-[#d7dadc]">r/AmbedkarGPT</span>
            · u/{handle} · {t('gen.frame.now')}
          </p>
          {children}
          <p className="mt-4 flex items-center gap-5 text-[13px] font-semibold text-[#818384]">
            <span className="flex items-center gap-1.5"><MessageSquare size={16} />{t('gen.frame.comments')}</span>
            <span className="flex items-center gap-1.5"><Share2 size={16} />{t('gen.frame.share')}</span>
          </p>
        </div>
      </article>
    );
  }

  // X
  return (
    <article className="rounded-[20px] border border-white/[0.12] bg-black px-5 py-5 shadow-[0_30px_70px_rgba(2,6,20,0.5)] sm:px-6">
      <div className="flex gap-3">
        {avatar()}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-1.5 text-[15px]">
            <span className="font-bold text-[#e7e9ea]">{authorName}</span>
            <span className="text-[#71767b]">@{handle} · {t('gen.frame.now')}</span>
            {Icon && <span className="ml-auto text-[#e7e9ea]"><Icon width={18} height={18} /></span>}
          </p>
          <div className="mt-2">{children}</div>
          <p className="mt-4 flex max-w-[420px] items-center justify-between text-[13px] text-[#71767b]">
            <span className="flex items-center gap-1.5"><MessageCircle size={17} /></span>
            <span className="flex items-center gap-1.5"><Repeat2 size={18} /></span>
            <span className="flex items-center gap-1.5"><Heart size={17} /></span>
            <span className="flex items-center gap-1.5"><BarChart2 size={17} /></span>
          </p>
        </div>
      </div>
    </article>
  );
}
