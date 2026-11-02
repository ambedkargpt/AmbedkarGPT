import { ChevronDown, RotateCcw, Sparkles } from 'lucide-react';
import { useI18n } from '../../i18n/index.jsx';
import { labelWithSize } from '../../utils/preferenceQuestions';
import { questionLabel } from '../../i18n/preferenceOptions';
import { shortOption, shortQuestion } from '../../data/partyQuestionsShort';

// The same questions the PreferencesPanel shows on this page (the ten party
// questions for the writer's party), laid out as a 2 × 5 grid of cards inside
// the studio instead of a resizable right sidebar.
//
// Data contract is identical to PreferencesPanel:
//   questions     [{ question_id, question_text, options, options_hi }]
//   value         { question_id: englishOption }
//   onChange      (nextValueMap) => void
//   defaultValues saved answers — what reset goes back to, and what "changed" compares with
//
// Each card is a real <select> stretched over the card, so keyboard, screen
// readers and the phone's native picker all work. The value written back is
// always the English option, exactly as the panel does. What is shown is the
// short form (data/partyQuestionsShort.js) where there is one: a card has two
// lines, and the full sentence is in its tooltip.

const PARTY_Q = /^party_[a-z]+_q(\d{1,2})$/;
const POSITION_Q = /^pos_[a-z]+_[a-z_]+_q([1-5])$/;
const META_KEYS = {
  profile_user_role: 'qmeta.userRole',
  profile_tone: 'qmeta.tone',
  profile_target_audience: 'qmeta.audience',
  profile_primary_focus: 'qmeta.focus',
  profile_ambedkarite_perspective: 'qmeta.perspective',
  profile_content_length: 'qmeta.length',
  profile_call_to_action: 'qmeta.cta',
};

function labelFor(q, t, lang) {
  const short = shortQuestion(q.question_id, lang);
  if (short) return short;
  const party = PARTY_Q.exec(q.question_id);
  if (party) return t(`qmeta.partyQ${party[1]}`);
  const pos = POSITION_Q.exec(q.question_id);
  if (pos) return t(`qmeta.posQ${pos[1]}`);
  const key = META_KEYS[q.question_id];
  return key ? t(`${key}.label`) : questionLabel(q.question_text, lang);
}

function optionText(q, opt, i, lang) {
  return shortOption(opt, lang) || (lang === 'hi' && q.options_hi?.[i]) || labelWithSize(opt, lang);
}

export default function PartyPrefsGrid({ questions = [], value = {}, onChange, defaultValues = {}, disabled = false }) {
  const { t, lang } = useI18n();
  const loading = questions.length === 0;

  function set(id, v) { onChange?.({ ...value, [id]: v }); }
  function reset() { onChange?.({ ...defaultValues }); }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-gradient-to-br from-[#3f9fff] to-[#7b5cff] text-white">
          <Sparkles size={11} strokeWidth={2.2} />
        </span>
        <span className="whitespace-nowrap font-display text-[16px] font-semibold text-white">{t('prefcard.title')}</span>
        <span className="hidden whitespace-nowrap text-[14px] text-[#6b78a0] xl:inline">{t('cmp.forThisPost')}</span>
        <span className="flex-1" />
        <span className="flex items-center gap-1.5 whitespace-nowrap text-[13.5px] text-[#8b94b8]">
          {loading
            ? <span className="spinner-ring" style={{ width: 11, height: 11, borderWidth: 1.5 }} />
            : <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#22c55e] shadow-[0_0_8px_rgba(34,197,94,0.8)]" />}
          {loading ? t('prefs.loading') : t('gen.signalsActive', { count: questions.length })}
        </span>
        <button
          type="button"
          onClick={reset}
          disabled={disabled || loading}
          title={t('prefs.resetDefaults')}
          aria-label={t('prefs.resetDefaults')}
          className="cmp-act flex h-7 w-7 items-center justify-center rounded-lg border border-[#22305c] text-[#8b94b8]"
        >
          <RotateCcw size={13} strokeWidth={2} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {loading
          ? Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="h-16 rounded-xl border border-[#22305c] bg-[#0c1430] p-3">
                <div className="cmp-shim h-2.5 w-20" />
                <div className="cmp-shim mt-2.5 h-3 w-36" />
              </div>
            ))
          : questions.map((q, i) => {
              const current = value[q.question_id] ?? q.options[0] ?? '';
              const idx = Math.max(0, q.options.indexOf(current));
              const shown = optionText(q, current, idx, lang);
              const changed = defaultValues[q.question_id] !== undefined && defaultValues[q.question_id] !== current;
              return (
                <div
                  key={q.question_id}
                  className="cmp-vcard relative flex h-[70px] flex-col justify-center gap-[3px] rounded-xl border pl-3 pr-[26px] text-white"
                  style={{
                    background: changed ? '#15224f' : '#0c1430',
                    borderColor: changed ? 'rgba(63,159,255,0.55)' : '#22305c',
                  }}
                  title={`${q.question_text}\n\n${shown}`}
                >
                  <span className="truncate font-count text-[12.5px] font-semibold tracking-[.06em] text-[#6aa8ff]">
                    <span className="text-[#8b94b8]">{i + 1}.</span> {labelFor(q, t, lang)}
                  </span>
                  <span className={`line-clamp-2 font-medium text-[#EDEEF2] ${lang === 'hi' ? 'font-hindi text-[13.5px] leading-[1.45]' : 'text-[14px] leading-[1.35]'}`}>
                    {shown}
                  </span>
                  <ChevronDown aria-hidden="true" size={13} strokeWidth={2} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6b78a0]" />
                  {changed && <span aria-hidden="true" className="absolute right-2 top-[7px] h-1.5 w-1.5 rounded-full bg-[#3f9fff]" />}
                  <select
                    aria-label={labelFor(q, t, lang)}
                    value={current}
                    disabled={disabled}
                    onChange={(e) => set(q.question_id, e.target.value)}
                    className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
                  >
                    {q.options.map((opt, oi) => (
                      <option key={opt} value={opt} className="bg-[#0a1130] text-white">
                        {optionText(q, opt, oi, lang)}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
      </div>
    </div>
  );
}
