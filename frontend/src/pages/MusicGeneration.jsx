import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Music2, Headphones } from 'lucide-react';

const TYPES = [
  {
    id: 'lyrics',
    title: 'Lyrics',
    description: 'Generate creative lyrics based on your musical preferences and style',
    Icon: FileText,
    route: '/generate/music/lyrics',
    gradient: 'from-[#00c6ff] to-[#0072ff]',
    glow: 'rgba(0,198,255,0.35)',
    border: 'rgba(0,198,255,0.3)',
    accent: '#00c6ff',
    tag: 'Text Only',
  },
  {
    id: 'beat-lyrics',
    title: 'Beat & Lyrics',
    description: 'Create a complete track with instrumental beats and matching lyrics',
    Icon: Music2,
    route: '/generate/music/beat-lyrics',
    gradient: 'from-[#a855f7] to-[#7b3fd4]',
    glow: 'rgba(168,85,247,0.35)',
    border: 'rgba(168,85,247,0.3)',
    accent: '#a855f7',
    tag: 'Most Popular',
    featured: true,
  },
  {
    id: 'song-only',
    title: 'Song Only',
    description: 'Generate a full instrumental track tailored to your music taste',
    Icon: Headphones,
    route: '/generate/music/song-only',
    gradient: 'from-[#ffb056] to-[#ff7a2d]',
    glow: 'rgba(255,176,86,0.35)',
    border: 'rgba(255,176,86,0.3)',
    accent: '#ffb056',
    tag: 'Instrumental',
  },
];

export default function MusicGeneration() {
  const navigate = useNavigate();

  return (
    <div
      className="relative min-h-screen overflow-hidden text-[#e5e7eb]"
      style={{ background: 'radial-gradient(1200px 900px at 50% -5%, #0d1636 0%, #070b1c 55%, #05081a 100%)' }}
    >
      {/* Ambient glows */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-[#00c6ff]/8 blur-[160px]" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-[400px] w-[400px] rounded-full bg-[#a855f7]/8 blur-[130px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-[#ffb056]/8 blur-[130px]" />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-8 pt-6 md:px-12">
        <button
          type="button"
          onClick={() => navigate('/generate')}
          className="inline-flex items-center gap-2 rounded-full border border-[#1e3260]/70 bg-[#0d1531]/60 px-4 py-2 text-[12.5px] font-medium text-[#8b94b8] transition hover:border-[#3a6bc4]/60 hover:text-white"
        >
          <ArrowLeft size={13} strokeWidth={2} />
          Back to Services
        </button>

        <span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-[#ffb056]/25 bg-[#ffb056]/8 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ffb056]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#ffb056] shadow-[0_0_10px_rgba(255,176,86,0.8)]" />
          Music Studio
        </span>

        <div className="hidden md:block w-[160px]" />
      </header>

      {/* Main */}
      <main className="relative z-10 flex min-h-[calc(100vh-80px)] flex-col items-center justify-center px-6 pb-16 pt-8">

        {/* Hero */}
        <div className="mb-12 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ffb056] to-[#ff7a2d] shadow-[0_0_32px_rgba(255,176,86,0.4)]">
            <Music2 size={26} strokeWidth={1.8} className="text-white" />
          </div>
          <h1 className="font-display text-[40px] md:text-[52px] font-bold leading-[1.05] tracking-tight text-white">
            Choose Your{' '}
            <span
              style={{
                background: 'linear-gradient(90deg, #00c6ff 0%, #a855f7 50%, #ffb056 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Generation Type
            </span>
          </h1>
          <p className="mt-3 text-[14.5px] text-[#8b94b8]">
            Select how you want to create your music
          </p>
        </div>

        {/* Cards */}
        <div className="grid w-full max-w-[960px] gap-5 grid-cols-1 md:grid-cols-3">
          {TYPES.map((type) => {
            const { Icon } = type;
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => navigate(type.route)}
                className="group relative flex flex-col items-center rounded-2xl border p-7 text-center transition-all duration-300 hover:-translate-y-1"
                style={{
                  backgroundColor: type.featured ? 'rgba(168,85,247,0.07)' : 'rgba(8,15,38,0.7)',
                  borderColor: type.featured ? type.border : 'rgba(30,50,100,0.5)',
                  boxShadow: type.featured ? `0 0 40px ${type.glow}` : 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = type.border;
                  e.currentTarget.style.boxShadow = `0 8px 40px ${type.glow}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = type.featured ? type.border : 'rgba(30,50,100,0.5)';
                  e.currentTarget.style.boxShadow = type.featured ? `0 0 40px ${type.glow}` : 'none';
                }}
              >
                {/* Badge */}
                <span
                  className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 font-count text-[10px] font-semibold uppercase tracking-widest"
                  style={{
                    backgroundColor: `${type.accent}22`,
                    border: `1px solid ${type.accent}55`,
                    color: type.accent,
                  }}
                >
                  {type.tag}
                </span>

                {/* Icon */}
                <div
                  className={`mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${type.gradient}`}
                  style={{ boxShadow: `0 8px 24px ${type.glow}` }}
                >
                  <Icon size={24} strokeWidth={1.8} className="text-white" />
                </div>

                {/* Text */}
                <h2 className="font-display text-[20px] font-bold text-white">{type.title}</h2>
                <p className="mt-2.5 text-[13px] leading-[1.7] text-[#7a8ab0]">{type.description}</p>

                {/* CTA */}
                <div
                  className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-semibold transition-all duration-200 group-hover:gap-3"
                  style={{ color: type.accent }}
                >
                  Get Started
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            );
          })}
        </div>

        {/* Bottom hint */}
        <p className="mt-10 text-[12px] text-[#7f8db3]">
          All generations are powered by AI · Results may vary
        </p>
      </main>
    </div>
  );
}
