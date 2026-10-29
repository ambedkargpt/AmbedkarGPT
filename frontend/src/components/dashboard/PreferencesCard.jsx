import Card, { CardTitle } from './Card';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n/index.jsx';
import { optionLabel } from '../../i18n/preferenceOptions';

// Map backend question IDs → the i18n key for their friendly display label
const DISPLAY_MAP = {
  profile_user_role:               'prefrow.role',
  profile_tone:                    'prefrow.tone',
  profile_target_audience:         'prefrow.audience',
  profile_language:                'prefrow.language',
  profile_target_platform:         'prefrow.platform',
  profile_ambedkarite_perspective: 'prefrow.lens',
  profile_formality_level:         'prefrow.style',
};

const DISPLAY_ORDER = Object.keys(DISPLAY_MAP);

// Three tints, not six. These are metadata — what the generator was told —
// so they should read as one set. Six saturated colours made a row of chips
// that looked like categories the product does not actually have.
const TINTS = [
  'bg-[#12224d]/70 text-[#8fbcff] border-[#2a4a8a]/50',
  'bg-[#1b2447]/70 text-[#a6b4dc] border-[#334268]/50',
  'bg-[#1d1b3d]/70 text-[#b0a6e8] border-[#3a3468]/50',
];

export default function PreferencesCard({ answers = [] }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();

  // Build a lookup map from answers array
  const answerMap = {};
  for (const a of answers) answerMap[a.question_id] = a.answer;

  // Rows: only keys we have answers for, in display order
  // The answer stays the stored English; only the drawn label is translated.
  const rows = DISPLAY_ORDER
    .filter((k) => answerMap[k])
    .map((k) => [t(DISPLAY_MAP[k]), optionLabel(answerMap[k], lang)]);

  // Tags: all answered values
  const tags = answers
    .map((a) => a.answer)
    .filter(Boolean)
    .slice(0, 10)
    .map((a) => optionLabel(a, lang));

  if (!answers.length) {
    return (
      <Card className="h-full flex flex-col justify-between">
        <CardTitle>{t('prefcard.title')}</CardTitle>
        <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
          <p className="text-[13px] text-[#6b78a0]">{t('prefcard.none')}</p>
          <button
            type="button"
            onClick={() => navigate('/preferences')}
            className="mt-4 rounded-xl btn-gradient px-6 py-2.5 text-[13px] font-semibold text-white"
          >
            {t('prefcard.setUp')}
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardTitle>{t('prefcard.title')}</CardTitle>

      {/* Label and value in two columns from sm up, stacked below it. Right
          aligning the value used to leave a long Hindi answer wrapping into a
          narrow ragged block on a phone. */}
      <dl className="mt-4 divide-y divide-[#1a254a]/45">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="grid gap-x-4 gap-y-0.5 py-2.5 sm:grid-cols-[minmax(108px,0.36fr)_1fr] sm:items-baseline"
          >
            <dt className="text-[12px] text-[#7a86a8] sm:text-[12.5px]">{k}</dt>
            <dd className="text-[13px] font-medium leading-snug text-white">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 h-px w-full bg-gradient-to-r from-transparent via-[#2a3566]/60 to-transparent" />

      <div className="mt-4">
        <div className="dash-eyebrow">{t('prefcard.allValues')}</div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {tags.map((tag, i) => (
            <span
              key={tag + i}
              className={`rounded-lg border px-2.5 py-1 text-[11.5px] font-medium ${TINTS[i % TINTS.length]}`}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}
