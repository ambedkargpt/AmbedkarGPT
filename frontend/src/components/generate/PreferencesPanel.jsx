import { useState } from 'react';
import { Sparkles, ChevronDown, RotateCcw } from 'lucide-react';
import { labelWithSize } from '../../utils/preferenceQuestions';
import { questionLabel } from '../../i18n/preferenceOptions';
import { useI18n } from '../../i18n/index.jsx';

// UI-only display metadata per question_id — labels and hints are not stored
// in the DB, so the ids map to i18n keys here. Falls back gracefully for
// unknown ids, which then show the question's own text from the DB.
const META_KEYS = {
  profile_user_role:               'qmeta.userRole',
  profile_tone:                    'qmeta.tone',
  profile_target_audience:         'qmeta.audience',
  profile_primary_focus:           'qmeta.focus',
  profile_ambedkarite_perspective: 'qmeta.perspective',
  profile_content_length:          'qmeta.length',
  profile_call_to_action:          'qmeta.cta',
};

// Party questions are party_<party>_q<n>, and the label comes from the number
// alone: the ten are worded identically for every party, only the options
// differ. Their own question text is a full sentence, too long for a label in
// a sidebar this narrow, so it becomes the hint underneath instead.
//
// The party is matched loosely rather than listed. Naming inc and bsp was
// already wrong once: Samajwadi was added later, party_sp_q1 matched nothing,
// and those questions silently fell through to the generic branch that draws
// the whole sentence as the label.
const PARTY_Q = /^party_[a-z]+_q(\d{1,2})$/;

// Position questions are pos_<party>_<group>_q<n>, five per level.
//
// Unlike the party ten, these are not worded identically across levels — a
// district question asks about local detail where the national one asks how to
// present a position — so the short label names what the question is *for*
// rather than restating it, and the question's own sentence sits underneath as
// the hint. Same treatment as the party set, for the same reason: the full
// text is too long to be a label in a sidebar this narrow.
const POSITION_Q = /^pos_[a-z]+_[a-z_]+_q([1-5])$/;

function getMeta(questionId, questionText, t, lang) {
  const party = PARTY_Q.exec(questionId);
  if (party) return { label: t(`qmeta.partyQ${party[1]}`), hint: questionText };

  const position = POSITION_Q.exec(questionId);
  if (position) return { label: t(`qmeta.posQ${position[1]}`), hint: questionText };

  const key = META_KEYS[questionId];
  if (!key) return { label: questionLabel(questionText, lang), hint: '' };
  return { label: t(`${key}.label`), hint: t(`${key}.hint`) };
}

// Build a defaults map from questions (first option of each)
function buildDefaults(questions) {
  return Object.fromEntries(
    questions.map((q) => [q.question_id, q.options[0] ?? ''])
  );
}

function Dropdown({ value, options, optionsHi, onChange, lang }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-[#1e3260]/70 bg-[#0a1130]/80 py-2.5 pl-3 pr-9 text-[12.5px] font-medium text-white outline-none transition focus:border-[#3f9fff]/70 focus:shadow-[0_0_0_3px_rgba(63,159,255,0.15)] hover:border-[#3f9fff]/50"
      >
        {options.map((opt, i) => {
          // The value is always the English option, because that is the string
          // the backend matches on and the one written back as the answer.
          // Only what is drawn changes with the language.
          //
          // Two kinds of option arrive here. The preference bank stores
          // "Label -> Description", which is too long for a narrow sidebar, so
          // it shows the label alone plus the word count where the option names
          // one - "Short" and "Medium" say nothing about the size being chosen.
          // Position options are short sentences with a translation carried
          // alongside them, and those are shown whole. Full text on hover.
          const hi = lang === 'hi' ? optionsHi?.[i] : '';
          return (
            <option key={opt} value={opt} title={opt} className="bg-[#0a1130] text-white">
              {hi || labelWithSize(opt, lang)}
            </option>
          );
        })}
      </select>
      <ChevronDown
        size={13}
        strokeWidth={2}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#8b94b8]"
      />
    </div>
  );
}

// questions  — array of { question_id, question_text, options } from the DB
// value      — controlled: { question_id: selectedOption, ... }
// onChange   — controlled setter
// defaultValues — what "reset" snaps back to (user's saved profile answers)
export default function PreferencesPanel({ questions = [], value, onChange, defaultValues }) {
  const { t, lang } = useI18n();
  const fallbackDefaults = buildDefaults(questions);
  const resetTarget = defaultValues ?? fallbackDefaults;

  const [local, setLocal] = useState(() => resetTarget);
  const current = value ?? local;

  function setField(id, v) {
    const next = { ...current, [id]: v };
    if (onChange) onChange(next); else setLocal(next);
  }

  function reset() {
    if (onChange) onChange({ ...resetTarget }); else setLocal({ ...resetTarget });
  }

  const isLoading = questions.length === 0;

  return (
    <aside className="relative flex h-full w-full flex-col border-l border-[#1a2130]/70 bg-gradient-to-b from-[#0a0e18] to-[#080b13]">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[#1a2130]/70 bg-[#080b13]/90 px-5 py-5 backdrop-blur">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-[#3f9fff] to-[#7b5cff] text-white shadow-[0_4px_14px_rgba(63,159,255,0.4)]">
              <Sparkles size={11} strokeWidth={2.2} />
            </span>
            <h3 className="font-display text-[15px] font-semibold text-white tracking-tight">
              {t('prefcard.title')}
            </h3>
          </div>
          <p className="mt-1 text-[11px] text-[#8b94b8]">
            {t('gen.tuneVoice')}
          </p>
        </div>

        <button
          type="button"
          onClick={reset}
          title={t('prefs.resetDefaults')}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#1e3260]/70 text-[#8b94b8] transition hover:border-[#3f9fff]/60 hover:text-white"
        >
          <RotateCcw size={11} strokeWidth={2} />
        </button>
      </header>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {isLoading ? (
          Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-24 animate-pulse rounded bg-[#1e3260]/60" />
              <div className="h-9 w-full animate-pulse rounded-lg bg-[#1e3260]/40" />
            </div>
          ))
        ) : (
          questions.map((q, i) => {
            const { label, hint } = getMeta(q.question_id, q.question_text, t, lang);
            return (
              <div key={q.question_id}>
                <div className="flex items-baseline justify-between gap-2">
                  <label className="text-[11.5px] font-semibold uppercase tracking-wider text-[#6aa8ff]">
                    <span className="font-count text-[#8b94b8] mr-1">{i + 1}.</span>
                    {label}
                  </label>
                </div>
                {hint && (
                  <p className="mt-0.5 text-[10.5px] text-[#6b78a0] leading-snug">{hint}</p>
                )}
                <div className="mt-2">
                  <Dropdown
                    value={current[q.question_id] ?? q.options[0]}
                    options={q.options}
                    optionsHi={q.options_hi}
                    lang={lang}
                    onChange={(v) => setField(q.question_id, v)}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-[#1a2130]/70 bg-[#080b13]/85 px-5 py-4 text-[10.5px] text-[#6b78a0] leading-snug">
        <span className="flex items-center gap-1.5">
          {/* While loading, the green "live" dot is a lie — it says the panel
              is ready when it has nothing yet. Swap it for the spinner. */}
          {isLoading ? (
            <span className="spinner-ring" style={{ width: 11, height: 11, borderWidth: 1.5 }} />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e] shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
          )}
          {isLoading ? t('prefs.loading') : t('gen.signalsActive', { count: questions.length })}
        </span>
      </footer>
    </aside>
  );
}
