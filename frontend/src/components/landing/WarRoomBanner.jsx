import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bot, Megaphone, Radar, Zap } from 'lucide-react';

import { useI18n } from '../../i18n/index.jsx';
import { PLATFORM_ICON } from '../generate/platformIcons';

/**
 * The war room, on the landing page.
 *
 * Every campaign runs one: a room where the news is watched, the other side's
 * moves are answered, and the message goes out to every worker the same hour.
 * The banner says AmbedkarGPT is that room, with AI doing the watching and the
 * writing. Everything it promises is something the product does today: news
 * by level for the party and the opposition, a post in the party's voice in a
 * minute, four platforms, and BhimBot's arguments from the corpus.
 *
 * Its strings live here rather than in en.js / hi.js: one self-contained
 * section, dropped onto one page.
 */

const COPY = {
  hi: {
    eyebrow: 'AI वॉर रूम',
    live: 'लाइव',
    title1: 'आपका चुनावी वॉर रूम,',
    title2: 'अब AI के साथ।',
    sub: 'ख़बरों पर 24×7 नज़र, विपक्ष को तुरंत जवाब, और हर कार्यकर्ता तक एक ही संदेश। जो काम पूरी टीम करती थी, अब एक स्क्रीन से।',
    features: [
      ['watch', 'हर ख़बर पर नज़र', 'आपकी पार्टी और विपक्ष की ख़बरें, देश से राज्य तक, एक जगह।'],
      ['reply', 'मिनटों में जवाब', 'विपक्ष के बयान पर पार्टी की आवाज़ में तैयार पोस्ट।'],
      ['reach', 'हर प्लेटफ़ॉर्म तक', 'WhatsApp, X, Facebook और Reddit के लिए अलग-अलग लिखी हुई।'],
      ['argue', 'तर्क जो टिके', 'बाबासाहेब के लेखन से जवाब, स्रोत के साथ।'],
    ],
    cta: 'अपना वॉर रूम शुरू करें',
    cta2: 'भीमबॉट से पूछें',
    note: 'मुफ़्त शुरू करें · हिंदी और अंग्रेज़ी में',
    console: 'वॉर रूम · आज',
    radar: 'ख़बरों की निगरानी',
    party: 'कांग्रेस',
    opp: 'भाजपा',
    feed: [
      ['opp', 'आरक्षण पर भाजपा नेता का बयान', '2 मिनट पहले'],
      ['party', 'संसद में कृषि मूल्य विधेयक पर मतदान की माँग', '9 मिनट पहले'],
      ['opp', 'केंद्र ने MSP पर अपना रुख़ दोहराया', '14 मिनट पहले'],
    ],
    replyReady: 'जवाब तैयार',
    replyText: 'आरक्षण संविधान का वादा है, किसी की मेहरबानी नहीं। बाबासाहेब ने…',
    seconds: '42 सेकंड में',
    sample: 'नमूना',
  },
  en: {
    eyebrow: 'AI war room',
    live: 'Live',
    title1: 'Your campaign war room,',
    title2: 'now run with AI.',
    sub: 'Watch the news around the clock, answer the other side at once, and send one message to every worker. What took a whole team now runs from one screen.',
    features: [
      ['watch', 'Every story, watched', 'Your party’s and the opposition’s news, national to state, in one place.'],
      ['reply', 'Answers in minutes', 'A post in your party’s voice, ready the moment the other side speaks.'],
      ['reach', 'On every platform', 'Written separately for WhatsApp, X, Facebook and Reddit.'],
      ['argue', 'Arguments that hold', 'Answers from Babasaheb’s own writing, with sources.'],
    ],
    cta: 'Start your war room',
    cta2: 'Ask BhimBot',
    note: 'Free to start · Hindi and English',
    console: 'War room · today',
    radar: 'News watch',
    party: 'Congress',
    opp: 'BJP',
    feed: [
      ['opp', 'BJP leader’s remark on reservation', '2 min ago'],
      ['party', 'Opposition demands a vote on the farm-price bill', '9 min ago'],
      ['opp', 'Centre repeats its stand on MSP', '14 min ago'],
    ],
    replyReady: 'Reply ready',
    replyText: 'Reservation is the Constitution’s promise, not anyone’s favour. Babasaheb…',
    seconds: 'in 42 seconds',
    sample: 'Sample',
  },
};

const FEATURE_ICON = { watch: Radar, reply: Zap, reach: Megaphone, argue: Bot };
const SIDE = {
  party: { color: '#3f9fff', tint: 'rgba(63,159,255,0.14)' },
  opp:   { color: '#ff6b70', tint: 'rgba(229,72,77,0.14)' },
};
const BLIPS = [
  { x: 28, y: 34, side: 'party', d: 0 },
  { x: 70, y: 26, side: 'opp', d: 0.6 },
  { x: 62, y: 68, side: 'party', d: 1.2 },
  { x: 34, y: 72, side: 'opp', d: 1.8 },
  { x: 80, y: 52, side: 'party', d: 2.4 },
];

/** The console's feed lights one row after another, as if stories were arriving. */
function useTicker(length, ms = 2200) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const id = setInterval(() => setI((n) => (n + 1) % length), ms);
    return () => clearInterval(id);
  }, [length, ms]);
  return i;
}

export default function WarRoomBanner() {
  const { lang } = useI18n();
  const c = COPY[lang] ?? COPY.hi;
  const active = useTicker(c.feed.length);

  return (
    <section id="war-room" aria-labelledby="war-room-title" className="relative py-14 md:py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="wr-frame relative overflow-hidden rounded-[28px] border border-[#1e3260] bg-[#070c22] md:rounded-[36px]">
          {/* Ground: a war-room grid, a red and a blue pool for the two sides,
              and a slow scan line. Decorative only. */}
          <div aria-hidden="true" className="wr-grid absolute inset-0 opacity-60" />
          <div aria-hidden="true" className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-[#1a5fff]/20 blur-[120px]" />
          <div aria-hidden="true" className="absolute -bottom-48 -right-32 h-[520px] w-[520px] rounded-full bg-[#e5484d]/14 blur-[130px]" />
          <div aria-hidden="true" className="wr-scan absolute inset-x-0 top-0 h-24" />

          <div className="relative grid gap-10 p-6 sm:p-10 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:p-14">
            {/* ── Message ── */}
            <div className="flex flex-col">
              <span className="inline-flex w-fit items-center gap-2.5 rounded-full border border-[#e5484d]/40 bg-[#e5484d]/10 py-1.5 pl-2.5 pr-4 text-[14px] font-bold tracking-wide text-[#ffb3b5]">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="wr-ping absolute inline-flex h-full w-full rounded-full bg-[#ff5a5f]" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#ff5a5f]" />
                </span>
                {c.live} · {c.eyebrow}
              </span>

              <h2 id="war-room-title" className="mt-5 font-display text-[34px] font-bold leading-[1.08] tracking-tight text-white sm:text-[44px] lg:text-[54px]">
                {c.title1}{' '}
                <span className="bg-gradient-to-r from-[#6aa8ff] via-[#9b8cff] to-[#ff8a8a] bg-clip-text text-transparent">{c.title2}</span>
              </h2>
              <p className="mt-5 max-w-[560px] text-[17px] leading-relaxed text-[#b4c3e2] md:text-[19px]">{c.sub}</p>

              <ul className="mt-7 grid grid-cols-2 gap-2.5 sm:gap-3">
                {c.features.map(([id, title, body], i) => {
                  const Icon = FEATURE_ICON[id];
                  return (
                    <li
                      key={id}
                      className="wr-feat group flex flex-col gap-2.5 rounded-2xl border border-[#1e3260]/80 bg-[#0a1130]/70 p-3.5 transition duration-300 hover:-translate-y-0.5 hover:border-[#2f4a7a] sm:flex-row sm:gap-3 sm:p-4"
                      style={{ animationDelay: `${i * 80}ms` }}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#2d6fff] to-[#7b5cff] text-white shadow-[0_8px_20px_rgba(63,110,255,0.35)]">
                        <Icon size={19} strokeWidth={2} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[15.5px] font-bold leading-snug text-white sm:text-[16px]">{title}</span>
                        <span className="mt-0.5 hidden text-[14px] leading-snug text-[#93a6cc] sm:block">{body}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to="/signup"
                  className="btn-gradient group inline-flex min-h-[54px] w-full items-center justify-center gap-2.5 sm:w-auto rounded-2xl px-7 text-[17px] font-semibold text-white shadow-[0_14px_36px_rgba(37,99,235,0.45)]"
                >
                  {c.cta}
                  <ArrowRight size={18} strokeWidth={2.4} className="transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
                <Link
                  to="/bhimbot"
                  className="inline-flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl border border-[#2a4a85] sm:w-auto bg-[#0a1130]/70 px-6 text-[17px] font-semibold text-[#cfe0ff] transition hover:border-[#3f9fff] hover:text-white"
                >
                  <Bot size={18} strokeWidth={2.1} /> {c.cta2}
                </Link>
              </div>
              <p className="mt-3 text-[14px] text-[#7d89ad]">{c.note}</p>
            </div>

            {/* ── Console ── a sample of the screen, not live data */}
            <div className="relative" aria-hidden="true">
              <div data-wr-console className="wr-console relative overflow-hidden rounded-3xl border border-[#24396b] bg-[#081027]/95 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.9)]">
                <div className="flex items-center gap-2 border-b border-[#1a2c55] px-5 py-3.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ff5a5f]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#f0a63a]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
                  <span className="ml-2 text-[13.5px] font-semibold text-[#9fb0d4]">{c.console}</span>
                  <span className="ml-auto rounded-full border border-[#1e3260] px-2.5 py-0.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#6b7a9e]">{c.sample}</span>
                </div>

                <div className="grid gap-4 p-5 sm:grid-cols-[170px_1fr]">
                  {/* Radar */}
                  <div className="hidden flex-col items-center gap-3 sm:flex">
                    <div className="relative aspect-square w-[150px] rounded-full border border-[#1e3260] bg-[radial-gradient(circle,rgba(63,159,255,0.10)_0%,transparent_70%)]">
                      <span className="absolute inset-[18%] rounded-full border border-[#1e3260]/80" />
                      <span className="absolute inset-[36%] rounded-full border border-[#1e3260]/80" />
                      <span className="absolute left-1/2 top-0 h-full w-px bg-[#1e3260]/70" />
                      <span className="absolute left-0 top-1/2 h-px w-full bg-[#1e3260]/70" />
                      <span className="wr-sweep absolute inset-0 rounded-full" />
                      {BLIPS.map((b, i) => (
                        <span
                          key={i}
                          className="wr-blip absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                          style={{ left: `${b.x}%`, top: `${b.y}%`, background: SIDE[b.side].color, boxShadow: `0 0 12px ${SIDE[b.side].color}`, animationDelay: `${b.d}s` }}
                        />
                      ))}
                    </div>
                    <span className="text-[13px] font-semibold text-[#9fb0d4]">{c.radar}</span>
                    <span className="flex gap-3 text-[12.5px] text-[#93a6cc]">
                      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#3f9fff]" />{c.party}</span>
                      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#ff6b70]" />{c.opp}</span>
                    </span>
                  </div>

                  {/* Feed */}
                  <div className="flex min-w-0 flex-col gap-2">
                    {c.feed.map(([side, title, when], i) => {
                      const on = i === active;
                      return (
                        <div
                          key={title}
                          data-wr-row
                          className="flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-500"
                          style={{
                            borderColor: on ? `${SIDE[side].color}66` : '#1a2c55',
                            background: on ? SIDE[side].tint : 'rgba(10,17,48,0.6)',
                            transform: on ? 'translateX(4px)' : 'none',
                          }}
                        >
                          <span className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: SIDE[side].color }} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] font-semibold text-white">{title}</span>
                            <span className="block text-[12px] text-[#7d89ad]">{side === 'party' ? c.party : c.opp} · {when}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Reply ready */}
                <div className="mx-5 mb-5 rounded-2xl border border-[#22c55e]/30 bg-[#22c55e]/[0.07] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span data-wr-check className="flex h-6 w-6 items-center justify-center rounded-full bg-[#22c55e] text-[13px] font-bold text-[#04130a]">✓</span>
                    <span className="text-[14.5px] font-bold text-[#7ff0a8]">{c.replyReady}</span>
                    <span className="hidden text-[12.5px] text-[#7d89ad] sm:inline">· {c.seconds}</span>
                    <span className="ml-auto flex gap-1.5">
                      {[['whatsapp', '#25d366'], ['twitter', '#e7e9ea'], ['facebook', '#1877f2'], ['reddit', '#ff4500']].map(([p, color]) => {
                        const Icon = PLATFORM_ICON[p];
                        return (
                          <span key={p} data-wr-platform className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0a1130] ring-1 ring-[#1e3260]" style={{ color }}>
                            <Icon width={14} height={14} />
                          </span>
                        );
                      })}
                    </span>
                  </div>
                  {/* Word by word (never by letter: that splits Devanagari conjuncts), so
                      the reply can write itself in when the console arrives. */}
                  <p className="mt-2.5 text-[14.5px] leading-relaxed text-[#d5def0]">
                    {c.replyText.split(' ').map((w, wi) => <span key={wi} data-wr-word>{w}{' '}</span>)}
                  </p>
                </div>
              </div>

              {/* A second screen peeking behind: the room has more than one. */}
              <div className="absolute -right-3 -top-3 -z-10 hidden h-full w-full rounded-3xl border border-[#1e3260]/60 bg-[#0a1130]/50 lg:block" />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .wr-grid {
          background-image:
            linear-gradient(rgba(63,110,200,0.10) 1px, transparent 1px),
            linear-gradient(90deg, rgba(63,110,200,0.10) 1px, transparent 1px);
          background-size: 44px 44px;
          mask-image: radial-gradient(ellipse at 60% 40%, #000 30%, transparent 80%);
          -webkit-mask-image: radial-gradient(ellipse at 60% 40%, #000 30%, transparent 80%);
        }
        .wr-scan { background: linear-gradient(180deg, transparent, rgba(106,168,255,0.08), transparent); animation: wr-scan 7s linear infinite; }
        @keyframes wr-scan { from { transform: translateY(-100%); } to { transform: translateY(900%); } }
        .wr-sweep { background: conic-gradient(from 0deg, rgba(63,159,255,0.45), rgba(63,159,255,0) 70deg, transparent 360deg); animation: wr-spin 4s linear infinite; }
        @keyframes wr-spin { to { transform: rotate(360deg); } }
        .wr-blip { animation: wr-blip 2.8s ease-in-out infinite; }
        @keyframes wr-blip { 0%, 100% { opacity: .25; } 40% { opacity: 1; } }
        .wr-ping { animation: wr-ping 1.6s cubic-bezier(0,0,.2,1) infinite; }
        @keyframes wr-ping { 75%, 100% { transform: scale(2.2); opacity: 0; } }
        .wr-feat { animation: wr-rise .5s cubic-bezier(.2,.8,.2,1) backwards; }
        @keyframes wr-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .wr-console { animation: wr-float 7s ease-in-out infinite; }
        @keyframes wr-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @media (prefers-reduced-motion: reduce) {
          .wr-scan, .wr-sweep, .wr-blip, .wr-ping, .wr-feat, .wr-console { animation: none; }
        }
      `}</style>
    </section>
  );
}
