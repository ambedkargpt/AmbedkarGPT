import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Quote } from 'lucide-react';
import { useI18n } from '../../i18n/index.jsx';
import { PLATFORM_ICON } from '../generate/platformIcons';

/**
 * "Why AmbedkarGPT", after cerebrium.ai's "Why Cerebrium": a sticky list of
 * four big lines on the left, the current one lit and the others faded, while
 * on the right each reason scrolls past with its own small visual. Below it,
 * a list of links between hairlines. The whole block arrives as a rounded
 * sheet over the section before it (data-sheet, see useScrollAnimations).
 *
 * Every claim here is something the product already does: about 20 seconds
 * per post, the length each platform is written to (backend/pipeline/
 * generator.py), the reader's own party against the opposition, and answers
 * from Babasaheb's writing with the source.
 *
 * Copy lives here in both languages, like the war-room banner's.
 */
const COPY = {
  hi: {
    eyebrow: 'क्यों AmbedkarGPT',
    headA: 'हर कार्यकर्ता के लिए,',
    headB: 'हर ख़बर पर जवाब',
    items: [
      { title: 'लगभग 20 सेकंड में पोस्ट', body: 'ख़बर चुनिए, बाक़ी काम हमारा। ख़बर पढ़ी जाती है, आपकी पार्टी की आवाज़ में ढलती है, और पोस्ट तैयार।' },
      { title: 'हर प्लेटफ़ॉर्म की अपनी पोस्ट', body: 'WhatsApp के लिए लंबा संदेश, X के लिए 280 अक्षर, Facebook और Reddit के लिए अपने ढंग की पोस्ट। एक ही ख़बर, चार सही रूप।' },
      { title: 'आपकी पार्टी, आपकी आवाज़', body: 'आपको अपनी पार्टी और विपक्ष की ख़बरें दिखती हैं, देश, राज्य और शहर के हिसाब से, और हर पोस्ट आपके पद के हिसाब से लिखी जाती है।' },
      { title: 'बाबासाहेब के लेखन से तर्क', body: 'भीमबॉट डॉ. आंबेडकर के लेखन और भाषणों से जवाब देता है, स्रोत के साथ, ताकि हर तर्क टिके।' },
    ],
    steps: ['ख़बर पढ़ी', 'पार्टी की आवाज़', 'पोस्ट तैयार'],
    secs: 'लगभग 20 सेकंड',
    lengths: { whatsapp: '180–280 शब्द', twitter: '280 अक्षर', facebook: '100–180 शब्द', reddit: '150–250 शब्द' },
    own: 'आपकी पार्टी', opp: 'विपक्ष', levels: ['राष्ट्रीय', 'राज्य', 'शहर'],
    quote: 'शिक्षित बनो, संघर्ष करो, संगठित रहो।', withSource: 'स्रोत के साथ',
    linksTitle: 'सब कुछ एक जगह',
    links: [['/generate/social-media', 'पोस्ट बनाएँ'], ['/bhimbot', 'भीमबॉट से पूछें'], ['/bhimradio', 'भीम रेडियो सुनें'], ['/signup', 'मुफ़्त शुरू करें']],
  },
  en: {
    eyebrow: 'Why AmbedkarGPT',
    headA: 'For every worker,',
    headB: 'an answer to every story',
    items: [
      { title: 'A post in about 20 seconds', body: 'Pick a story and the rest is done: it is read, set in your party’s voice, and the post is ready.' },
      { title: 'A post for each platform', body: 'A long message for WhatsApp, 280 characters for X, and posts shaped for Facebook and Reddit. One story, four right forms.' },
      { title: 'Your party, your voice', body: 'You see your party’s and the opposition’s news, by country, state and city, and every post is written for your role.' },
      { title: 'Arguments from Babasaheb', body: 'BhimBot answers from Dr Ambedkar’s writings and speeches, with the source, so every argument holds.' },
    ],
    steps: ['Story read', 'Party voice', 'Post ready'],
    secs: 'about 20 seconds',
    lengths: { whatsapp: '180–280 words', twitter: '280 characters', facebook: '100–180 words', reddit: '150–250 words' },
    own: 'Your party', opp: 'Opposition', levels: ['National', 'State', 'City'],
    quote: 'Educate, agitate, organise.', withSource: 'With the source',
    linksTitle: 'Everything in one place',
    links: [['/generate/social-media', 'Write a post'], ['/bhimbot', 'Ask BhimBot'], ['/bhimradio', 'Listen to Bhim Radio'], ['/signup', 'Start free']],
  },
};

const NAMES = { whatsapp: 'WhatsApp', reddit: 'Reddit', facebook: 'Facebook', twitter: 'X' };

// The share of the longest post each platform is written to, for the bars.
const PLATFORMS = [
  ['whatsapp', '#25d366', 1], ['reddit', '#ff4500', 0.9], ['facebook', '#1877f2', 0.65], ['twitter', '#e7e9ea', 0.18],
];

function Visual({ index, c, seen }) {
  const bar = (v, color, delay = 0) => (
    <span className="block h-2 w-full overflow-hidden rounded-full bg-white/10">
      <span
        className="why-bar block h-full rounded-full"
        style={{ background: color, '--v': v, transitionDelay: `${delay}ms`, transform: seen ? `scaleX(${v})` : 'scaleX(0)' }}
      />
    </span>
  );
  if (index === 0) {
    return (
      <div className="space-y-5">
        {c.steps.map((s, i) => (
          <div key={s}>
            <p className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#3f9fff] text-white"><Check size={14} strokeWidth={3} /></span>
              {s}
            </p>
            {bar(1, 'linear-gradient(90deg,#0a7dff,#3a9fff)', i * 350)}
          </div>
        ))}
        <p className="pt-1 text-right font-count text-[28px] font-bold text-white tabular-nums">~20s <span className="text-[15px] font-medium text-[#9fb3d6]">{c.secs}</span></p>
      </div>
    );
  }
  if (index === 1) {
    return (
      <div className="space-y-4">
        {PLATFORMS.map(([p, color, v], i) => {
          const Icon = PLATFORM_ICON[p];
          return (
            <div key={p}>
              <p className="mb-2 flex items-center justify-between gap-3 text-[15px] font-semibold text-white">
                <span className="flex items-center gap-2"><span style={{ color }}><Icon width={18} height={18} /></span>{NAMES[p]}</span>
                <span className="font-count text-[14px] font-medium text-[#9fb3d6]">{c.lengths[p]}</span>
              </p>
              {bar(v, color, i * 120)}
            </div>
          );
        })}
      </div>
    );
  }
  if (index === 2) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          {[[c.own, '#3f9fff'], [c.opp, '#e5484d']].map(([label, color]) => (
            <div key={label} className="rounded-[14px] border p-4" style={{ borderColor: `${color}55`, background: `${color}14` }}>
              <span className="block h-1 w-8 rounded-full" style={{ background: color }} />
              <p className="mt-3 text-[16px] font-bold text-white">{label}</p>
              <div className="mt-3 space-y-1.5" aria-hidden="true">
                <span className="block h-2 w-full rounded-full bg-white/15" />
                <span className="block h-2 w-3/4 rounded-full bg-white/10" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {c.levels.map((l) => (
            <span key={l} className="rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-[14px] font-semibold text-[#dbe4fb]">{l}</span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <figure className="rounded-[14px] border border-white/12 bg-white/[0.05] p-5">
      <Quote size={24} className="text-[#8fb0ff]" aria-hidden="true" />
      <blockquote className="mt-2 font-display text-[24px] font-bold leading-snug text-white">{c.quote}</blockquote>
      <figcaption className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#3f9fff]/15 px-3 py-1 text-[13.5px] font-semibold text-[#9cc3ff]">
        <Check size={13} strokeWidth={3} /> {c.withSource}
      </figcaption>
    </figure>
  );
}

export default function WhySection() {
  const { lang } = useI18n();
  const c = COPY[lang] ?? COPY.en;
  const [active, setActive] = useState(0);
  const [seen, setSeen] = useState(() => new Set());
  const blocks = useRef([]);

  // The reason in the middle of the screen is the current one; a reason's
  // bars fill the first time it comes into view.
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const i = Number(e.target.dataset.i);
        setActive(i);
        setSeen((s) => (s.has(i) ? s : new Set(s).add(i)));
      });
    }, { rootMargin: '-40% 0px -40% 0px' });
    blocks.current.forEach((b) => b && io.observe(b));
    return () => io.disconnect();
  }, []);

  return (
    <section className="relative px-3 py-6 sm:px-5" aria-labelledby="why-title">
      <div
        data-sheet
        className="relative mx-auto max-w-[1400px] overflow-clip rounded-[32px] border border-white/[0.08] md:rounded-[48px]"
        style={{ background: 'radial-gradient(70% 50% at 0% 0%, rgba(26,95,255,0.18) 0%, transparent 60%), radial-gradient(60% 40% at 100% 100%, rgba(58,159,255,0.12) 0%, transparent 60%), linear-gradient(180deg, #0e1638 0%, #0a1030 100%)' }}
      >
        <div className="mx-auto max-w-7xl px-6 py-14 md:px-10 md:py-24">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-[#8fb0ff]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#3f9fff]" />
            <span className={lang === 'hi' ? '' : 'font-count uppercase tracking-[0.18em]'}>{c.eyebrow}</span>
          </p>
          <h2 id="why-title" className="mt-4 max-w-[860px] font-display text-[clamp(30px,6vw,56px)] font-bold leading-[1.1] text-white">
            {c.headA}{' '}
            <span className="bg-gradient-to-r from-[#0a7dff] to-[#7cc4ff] bg-clip-text text-transparent">{c.headB}</span>
          </h2>

          <div className="mt-12 grid gap-10 lg:mt-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
            {/* The four lines, held in view while the reasons scroll past. */}
            <ol className="hidden self-start lg:sticky lg:top-[200px] lg:block">
              {c.items.map((it, i) => (
                <li key={it.title}>
                  <button
                    type="button"
                    onClick={() => blocks.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                    className={`block py-1.5 text-left font-display text-[clamp(28px,2.6vw,40px)] font-bold leading-tight transition-opacity duration-300 ${i === active ? 'opacity-100 text-white' : 'opacity-30 text-[#9fb3d6] hover:opacity-60'}`}
                  >
                    {it.title}
                  </button>
                </li>
              ))}
            </ol>

            <div className="space-y-16 lg:space-y-[30vh] lg:pb-[10vh]">
              {c.items.map((it, i) => (
                <article key={it.title} ref={(el) => { blocks.current[i] = el; }} data-i={i}>
                  <div
                    className="rounded-[20px] border border-white/10 p-6 sm:p-8"
                    style={{ background: 'radial-gradient(90% 80% at 100% 0%, rgba(58,159,255,0.16) 0%, transparent 60%), linear-gradient(165deg, #131d48 0%, #0b1130 100%)' }}
                  >
                    <Visual index={i} c={c} seen={seen.has(i)} />
                  </div>
                  <h3 className="mt-6 font-display text-[24px] font-bold text-white md:text-[28px]">{it.title}</h3>
                  <p className="mt-2 max-w-[560px] text-[17px] leading-relaxed text-[#b4c6e4]">{it.body}</p>
                </article>
              ))}
            </div>
          </div>

          {/* Links between hairlines, the arrow stepping on as you point. */}
          <div className="mt-20 grid gap-x-10 border-t border-white/10 pt-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <p className="mb-6 font-display text-[24px] font-bold text-white md:mb-0">{c.linksTitle}</p>
            <ul className="grid gap-x-8 sm:grid-cols-2">
              {c.links.map(([to, label]) => (
                <li key={to}>
                  <Link to={to} className="group flex items-center justify-between border-b border-white/10 py-4 text-[19px] font-semibold text-[#dbe4fb] transition-colors hover:text-white">
                    {label}
                    <ArrowRight size={20} className="text-[#3f9fff] transition-transform duration-300 group-hover:translate-x-1.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <style>{`
        .why-bar { transform-origin: left center; transition: transform .9s cubic-bezier(.2,.8,.2,1); }
        @media (prefers-reduced-motion: reduce) { .why-bar { transition: none; transform: scaleX(var(--v)) !important; } }
      `}</style>
    </section>
  );
}
