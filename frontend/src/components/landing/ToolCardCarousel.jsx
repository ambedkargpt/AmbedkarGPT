import { useNavigate } from 'react-router-dom';
import { Edit3, Bot, Radio, Music, Headphones, Mic2, Video, ArrowRight, Check } from 'lucide-react';
import PeekCarousel from './PeekCarousel';
import { useAuth } from '../../context/AuthContext';
import { RADIO_REQUIRES_LOGIN } from '../../data/radioAccess';
import { useI18n } from '../../i18n/index.jsx';

/*
 * "Our Services" on a phone: the tools as compact cards, one at a time with
 * the next peeking in. Same products, colours and icons as the
 * services carousel and the generator's picker, live ones first. Text keys are
 * the services section's where it has them (svc.*) and hero.tool.* for the
 * three it does not cover.
 *
 * `auth` marks a route behind ProtectedRoute. That guard sends a signed-out
 * visitor to the home page, not to login, so the card does what the hero's
 * old buttons did: remember the target and go to login itself.
 */
const TOOLS = [
  {
    id: 'social', icon: Edit3, color: '#ff4f8a', gradient: 'from-[#ff4f8a] to-[#d43a68]',
    live: true, route: '/generate/social-media', auth: true,
    title: 'svc.social.title', sub: 'svc.social.sub', f: 'svc.social.f',
  },
  {
    id: 'bhimbot', icon: Bot, color: '#3f9fff', gradient: 'from-[#3f9fff] to-[#2664d6]',
    live: true, route: '/bhimbot', auth: false,
    title: 'bot.title', sub: 'hero.tool.bhimbot.sub', f: 'hero.tool.bhimbot.f',
  },
  {
    id: 'radio', icon: Radio, color: '#ff6b5a', gradient: 'from-[#ff6b5a] to-[#d9443a]',
    live: true, route: '/bhimradio', auth: RADIO_REQUIRES_LOGIN,
    title: 'radio.title', sub: 'hero.tool.radio.sub', f: 'hero.tool.radio.f',
  },
  {
    id: 'music', icon: Music, color: '#ffb056', gradient: 'from-[#ffb056] to-[#ff7a2d]',
    live: true, route: '/generate/music', auth: true,
    title: 'sel.music.title', sub: 'sel.music.desc', f: 'hero.tool.music.f',
  },
  {
    id: 'podcast', icon: Headphones, color: '#06b6d4', gradient: 'from-[#06b6d4] to-[#0891b2]',
    live: false, title: 'svc.podcast.title', sub: 'svc.podcast.sub', f: 'svc.podcast.f',
  },
  {
    id: 'speech', icon: Mic2, color: '#22c55e', gradient: 'from-[#22c55e] to-[#16a34a]',
    live: false, title: 'svc.speech.title', sub: 'svc.speech.sub', f: 'svc.speech.f',
  },
  {
    id: 'video', icon: Video, color: '#a855f7', gradient: 'from-[#a855f7] to-[#7b3fd4]',
    live: false, title: 'svc.video.title', sub: 'svc.video.sub', f: 'svc.video.f',
  },
];

function ToolCard({ tool, index, onTry }) {
  const { t } = useI18n();
  const { icon: Icon, color, gradient, live } = tool;
  return (
    <div className="liquid-glass relative flex h-full w-full flex-col overflow-hidden rounded-2xl px-4 pb-3.5 pt-4">
      <div className="flex items-start justify-between">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} shadow-[0_4px_18px_rgba(0,0,0,0.35)]`}>
          <Icon size={18} strokeWidth={1.9} className="text-white" />
        </span>
        {live ? (
          <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 font-count text-[10px] font-semibold uppercase tracking-widest text-green-400">
            {t('landing.live')}
          </span>
        ) : (
          <span className="rounded-full border border-[#2a4375]/50 bg-[#0c1735]/60 px-2.5 py-1 font-count text-[10px] font-semibold uppercase tracking-widest text-[#5a7aaa]">
            {t('landing.soon')}
          </span>
        )}
      </div>

      <p className="card-index mt-2 font-count text-[11px] font-semibold">
        {String(index + 1).padStart(2, '0')}
      </p>
      <p className="text-[19px] font-semibold leading-tight text-white">{t(tool.title)}</p>
      <p className="mt-1 line-clamp-2 text-[13.5px] leading-snug text-[#8aabcc]">{t(tool.sub)}</p>

      <ul className="mt-2.5 flex-1 space-y-1">
        {[1, 2, 3].map((n) => (
          <li key={n} className="flex items-center gap-2">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ background: `${color}22` }}>
              <Check size={10} strokeWidth={2.6} style={{ color }} />
            </span>
            <span className="text-[13.5px] text-[#a8c0dc]">{t(`${tool.f}${n}`)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-2.5 border-t border-[#1e3260]/50 pt-2.5">
        {live ? (
          <button
            type="button"
            onClick={() => onTry(tool)}
            className="inline-flex items-center gap-1.5 text-[15px] font-semibold transition-all duration-200 hover:gap-2.5"
            style={{ color }}
          >
            {t('landing.tryNow')}
            <ArrowRight size={14} strokeWidth={2.2} />
          </button>
        ) : (
          <p className="text-[14px] leading-[22px] text-[#3d5a80]">{t('landing.comingSoon')}</p>
        )}
      </div>
    </div>
  );
}

export default function ToolCardCarousel() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  function handleTry(tool) {
    if (tool.auth && !currentUser) {
      sessionStorage.setItem('auth_redirect', tool.route);
      navigate('/login');
    } else {
      navigate(tool.route);
    }
  }

  return (
    <PeekCarousel
      count={TOOLS.length}
      interval={5000}
      labelFor={(i) => `Go to ${t(TOOLS[i].title)}`}
      renderItem={(i) => <ToolCard tool={TOOLS[i]} index={i} onTry={handleTry} />}
    />
  );
}
