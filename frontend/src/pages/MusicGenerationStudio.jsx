import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Sparkles, RefreshCw, Copy, Check, Music2, FileText, Headphones, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// ── Type config ──────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  lyrics: {
    title: 'Lyrics Generator',
    subtitle: 'Generate expressive lyrics from your ideas',
    Icon: FileText,
    gradient: 'from-[#00c6ff] to-[#0072ff]',
    glow: 'rgba(0,198,255,0.4)',
    accent: '#00c6ff',
    accentDim: 'rgba(0,198,255,0.12)',
    fields: [
      { id: 'theme',    label: 'Theme / Topic',    placeholder: 'e.g. Social justice, caste equality, revolution…', type: 'text' },
      { id: 'genre',    label: 'Music Genre',      placeholder: 'Hip-hop, Folk, Rap, Classical…',                   type: 'select',
        options: ['Hip-hop', 'Folk', 'Rap', 'R&B', 'Classical', 'Pop', 'Ghazal', 'Rock', 'Jazz'] },
      { id: 'mood',     label: 'Mood',             placeholder: 'Angry, Hopeful, Melancholic, Fierce…',             type: 'select',
        options: ['Angry & Fierce', 'Hopeful', 'Melancholic', 'Motivational', 'Reflective', 'Joyful', 'Defiant'] },
      { id: 'language', label: 'Language',         placeholder: 'Hindi, English, Marathi…',                        type: 'select',
        options: ['Hindi', 'English', 'Hinglish', 'Marathi', 'Tamil', 'Telugu', 'Punjabi'] },
      { id: 'verses',   label: 'Number of Verses', placeholder: '',                                                 type: 'select',
        options: ['1 Verse', '2 Verses', '3 Verses', '4 Verses', 'Full Song (Verse + Chorus + Bridge)'] },
    ],
  },
  'beat-lyrics': {
    title: 'Beat & Lyrics',
    subtitle: 'Complete track — instrumental structure + matching lyrics',
    Icon: Music2,
    gradient: 'from-[#a855f7] to-[#7b3fd4]',
    glow: 'rgba(168,85,247,0.4)',
    accent: '#a855f7',
    accentDim: 'rgba(168,85,247,0.12)',
    fields: [
      { id: 'theme',    label: 'Theme / Topic',    placeholder: 'e.g. Anti-caste struggle, constitutional rights…',  type: 'text' },
      { id: 'genre',    label: 'Genre',            placeholder: '',                                                   type: 'select',
        options: ['Hip-hop', 'Trap', 'Folk-Fusion', 'R&B', 'Drill', 'Afrobeat', 'Electronic', 'Lo-fi', 'Reggae'] },
      { id: 'bpm',      label: 'Tempo / BPM',      placeholder: '',                                                   type: 'select',
        options: ['Slow (60–80 BPM)', 'Mid (80–100 BPM)', 'Upbeat (100–130 BPM)', 'Fast (130–160 BPM)'] },
      { id: 'mood',     label: 'Mood',             placeholder: '',                                                   type: 'select',
        options: ['Aggressive & Defiant', 'Hopeful & Rising', 'Melancholic', 'Energetic', 'Spiritual', 'Cinematic'] },
      { id: 'language', label: 'Language',         placeholder: '',                                                   type: 'select',
        options: ['Hindi', 'English', 'Hinglish', 'Marathi', 'Tamil', 'Punjabi'] },
    ],
  },
  'song-only': {
    title: 'Song Generator',
    subtitle: 'Full instrumental track tailored to your taste',
    Icon: Headphones,
    gradient: 'from-[#ffb056] to-[#ff7a2d]',
    glow: 'rgba(255,176,86,0.4)',
    accent: '#ffb056',
    accentDim: 'rgba(255,176,86,0.12)',
    fields: [
      { id: 'genre',       label: 'Genre',             placeholder: '', type: 'select',
        options: ['Classical Indian', 'Hip-hop', 'Electronic', 'Jazz', 'Folk', 'Ambient', 'Orchestral', 'Lo-fi'] },
      { id: 'mood',        label: 'Mood',              placeholder: '', type: 'select',
        options: ['Intense & Powerful', 'Calm & Meditative', 'Uplifting', 'Dark & Brooding', 'Joyful', 'Melancholic'] },
      { id: 'instruments', label: 'Key Instruments',   placeholder: 'e.g. Sitar, Tabla, Piano, Guitar…',             type: 'text' },
      { id: 'duration',    label: 'Duration',          placeholder: '', type: 'select',
        options: ['30 seconds', '1 minute', '2 minutes', '3 minutes', '4–5 minutes'] },
      { id: 'tempo',       label: 'Tempo',             placeholder: '', type: 'select',
        options: ['Very slow (meditative)', 'Slow', 'Moderate', 'Fast', 'Very fast (energetic)'] },
    ],
  },
};

// ── Field components ──────────────────────────────────────────────────────────
function SelectField({ field, value, onChange, accent }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-xl border bg-[#080f26]/80 py-3 pl-4 pr-10 text-[13px] font-medium text-white outline-none transition"
        style={{ borderColor: 'rgba(30,50,100,0.6)' }}
        onFocus={(e) => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${accent}22`; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(30,50,100,0.6)'; e.currentTarget.style.boxShadow = 'none'; }}
      >
        <option value="" style={{ color: '#5a6e9a', background: '#080f26' }}>Select…</option>
        {field.options.map((o) => (
          <option key={o} value={o} style={{ background: '#080f26' }}>{o}</option>
        ))}
      </select>
      <ChevronDown size={13} strokeWidth={2} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5a6e9a]" />
    </div>
  );
}

function TextField({ field, value, onChange, accent }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      className="w-full rounded-xl border bg-[#080f26]/80 py-3 pl-4 pr-4 text-[13px] font-medium text-white placeholder-[#3a4e70] outline-none transition"
      style={{ borderColor: 'rgba(30,50,100,0.6)' }}
      onFocus={(e) => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${accent}22`; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(30,50,100,0.6)'; e.currentTarget.style.boxShadow = 'none'; }}
    />
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MusicGenerationStudio() {
  const { type } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const config = TYPE_CONFIG[type] ?? TYPE_CONFIG.lyrics;
  const { Icon, accent, glow, accentDim } = config;

  const [formValues, setFormValues] = useState(() =>
    Object.fromEntries(config.fields.map((f) => [f.id, '']))
  );
  const [generating, setGenerating] = useState(false);
  const [genSeconds, setGenSeconds] = useState(0);
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);

  function setField(id, val) {
    setFormValues((prev) => ({ ...prev, [id]: val }));
  }

  const isReady = config.fields.some((f) => formValues[f.id]?.trim());

  async function handleGenerate() {
    if (!isReady || generating) return;
    setGenerating(true);
    setGenSeconds(0);
    setOutput('');
    const timer = setInterval(() => setGenSeconds((s) => s + 1), 1000);

    // Placeholder — backend not connected yet
    await new Promise((r) => setTimeout(r, 2000));
    clearInterval(timer);

    const theme = formValues.theme || formValues.genre || 'social justice';
    const lang  = formValues.language || 'Hindi';
    setOutput(
      `[Coming Soon]\n\nThe Music Generation backend is not connected yet.\n\nYour request has been noted:\n• Type: ${config.title}\n• Theme: ${theme}\n• Language: ${lang}\n\nOnce the music API is integrated, your ${type === 'song-only' ? 'instrumental track' : type === 'lyrics' ? 'lyrics' : 'full track with lyrics'} will appear here.`
    );
    setGenerating(false);
  }

  async function handleCopy() {
    if (!output) return;
    try { await navigator.clipboard.writeText(output); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden text-[#e5e7eb]"
      style={{ background: 'radial-gradient(1200px 900px at 50% -10%, #0d1636 0%, #070b1c 55%, #05081a 100%)' }}
    >
      {/* Ambient glow behind the form */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full blur-[150px]"
        style={{ backgroundColor: `${accent}0a` }}
      />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-8 pt-6 md:px-12">
        <button
          type="button"
          onClick={() => navigate('/generate/music')}
          className="inline-flex items-center gap-2 rounded-full border border-[#1e3260]/70 bg-[#0d1531]/60 px-4 py-2 text-[12.5px] font-medium text-[#8b94b8] transition hover:border-[#3a6bc4]/60 hover:text-white"
        >
          <ArrowLeft size={13} strokeWidth={2} />
          Change Type
        </button>

        <span
          className="hidden sm:inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{ borderColor: `${accent}40`, backgroundColor: accentDim, color: accent }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent, boxShadow: `0 0 10px ${accent}` }} />
          {config.title}
        </span>

        <div className="hidden md:block w-[160px]" />
      </header>

      {/* Main two-column layout */}
      <main className="relative z-10 mx-auto grid max-w-[1060px] gap-6 px-6 pb-16 pt-8 md:grid-cols-[1fr_1.1fr] md:px-10">

        {/* Left — Form */}
        <section>
          {/* Section header */}
          <div className="mb-7 flex items-center gap-3">
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${config.gradient}`}
              style={{ boxShadow: `0 6px 20px ${glow}` }}
            >
              <Icon size={20} strokeWidth={1.8} className="text-white" />
            </div>
            <div>
              <h1 className="font-display text-[20px] font-bold text-white">{config.title}</h1>
              <p className="text-[12px] text-[#5a6e9a]">{config.subtitle}</p>
            </div>
          </div>

          {/* Fields */}
          <div className="space-y-4">
            {config.fields.map((field) => (
              <div key={field.id}>
                <label className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-wider" style={{ color: accent }}>
                  {field.label}
                </label>
                {field.type === 'select' ? (
                  <SelectField field={field} value={formValues[field.id]} onChange={(v) => setField(field.id, v)} accent={accent} />
                ) : (
                  <TextField field={field} value={formValues[field.id]} onChange={(v) => setField(field.id, v)} accent={accent} />
                )}
              </div>
            ))}
          </div>

          {/* Generate button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!isReady || generating}
            className="mt-7 inline-flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 text-[14px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: isReady && !generating
                ? `linear-gradient(90deg, ${accent}, ${config.gradient.includes('00c6ff') ? '#0072ff' : config.gradient.includes('a855f7') ? '#7b3fd4' : '#ff7a2d'})`
                : 'rgba(30,50,100,0.4)',
              boxShadow: isReady && !generating ? `0 6px 24px ${glow}` : 'none',
            }}
          >
            {generating ? (
              <><RefreshCw size={15} strokeWidth={2} className="animate-spin" /> Generating… {genSeconds}s</>
            ) : (
              <><Sparkles size={15} strokeWidth={2} /> Generate {type === 'song-only' ? 'Track' : type === 'lyrics' ? 'Lyrics' : 'Beat & Lyrics'}</>
            )}
          </button>
        </section>

        {/* Right — Output */}
        <section className="flex flex-col">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-[16px] font-semibold text-white">Output</h2>
            {output && (
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#1e3260]/70 bg-[#0d1531]/60 px-3 py-1.5 text-[12px] font-medium text-[#8b94b8] transition hover:border-[#3f9fff]/60 hover:text-white"
              >
                {copied ? <><Check size={12} strokeWidth={2.5} className="text-[#22c55e]" /> Copied</> : <><Copy size={12} strokeWidth={2} /> Copy</>}
              </button>
            )}
          </div>

          {generating ? (
            <div
              className="flex flex-1 min-h-[400px] flex-col items-center justify-center gap-4 rounded-2xl border"
              style={{ borderColor: `${accent}30`, backgroundColor: accentDim }}
            >
              <div
                className="h-10 w-10 animate-spin rounded-full border-2"
                style={{ borderColor: `${accent}30`, borderTopColor: accent }}
              />
              <div className="text-center">
                <p className="text-[14px] font-medium" style={{ color: accent }}>
                  {type === 'song-only' ? 'Composing your track…' : type === 'lyrics' ? 'Writing your lyrics…' : 'Building beat & lyrics…'}
                </p>
                <p className="mt-1 font-count text-[11px] text-[#7f8db3]">{genSeconds}s elapsed</p>
              </div>
            </div>
          ) : output ? (
            <div
              className="flex-1 rounded-2xl border p-6 text-[13.5px] leading-[1.85] whitespace-pre-wrap"
              style={{ borderColor: `${accent}30`, backgroundColor: 'rgba(8,15,38,0.7)', color: '#c7d1eb' }}
            >
              {output}
            </div>
          ) : (
            <div
              className="flex flex-1 min-h-[400px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed"
              style={{ borderColor: 'rgba(30,50,100,0.5)' }}
            >
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${config.gradient} opacity-25`}
              >
                <Icon size={28} strokeWidth={1.5} className="text-white" />
              </div>
              <div className="text-center">
                <p className="text-[14px] font-medium text-[#5a6e9a]">Your output will appear here</p>
                <p className="mt-1 text-[12px] text-[#7f8db3]">Fill in the form and click Generate</p>
              </div>
            </div>
          )}

          {/* Tags */}
          {!generating && !output && (
            <div className="mt-5 flex flex-wrap gap-2">
              {['AI-Powered', 'Ambedkarite Themes', 'Multi-language', 'Customisable'].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full px-3 py-1 font-count text-[11px]"
                  style={{ backgroundColor: accentDim, border: `1px solid ${accent}30`, color: `${accent}cc` }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
