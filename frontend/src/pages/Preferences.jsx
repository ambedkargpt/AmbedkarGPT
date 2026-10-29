import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Save, Home, ArrowUp, Loader2, SlidersHorizontal } from 'lucide-react';
import Topbar from '../components/dashboard/Topbar';
import ConnectedAccounts from '../components/publish/ConnectedAccounts';
import { useAuth } from '../context/AuthContext';
import { saveProfileAnswers, getProfileAnswers } from '../api/profile';
import { getPartyQuestions, getPositionQuestions, getQuestions } from '../api/questions';
import { groupForId } from '../utils/partyRoles';
import { CORE_QUESTION_IDS, labelWithSize } from '../utils/preferenceQuestions';

// The seven core profile questions are hidden here for now.
//
// Six of them describe who the writer is - their role, their audience, their
// perspective - and the party and position sets now cover that ground in the
// writer's own vocabulary. The seventh, content_length, is no longer asked
// anywhere: the platform picked in the generator decides a post's length.
//
// They are still seeded, still active, and still answered by anyone who went
// through the questionnaire; only this page stops showing them. Their stored
// answers keep reaching the prompt, and unanswered ones fall back to the
// profile defaults, so nothing about generation changes by hiding them.
//
// Flip to true to bring the section back.
const SHOW_CORE_QUESTIONS = false;
import { useI18n } from '../i18n/index.jsx';
import { questionLabel } from '../i18n/preferenceOptions';

// ─── Question data ────────────────────────────────────────────────────────────

// Questions come from the API, not from this file.
//
// They used to be written out here as well, which meant the same 25 questions
// were defined twice: once here and once in the database the generator's panel
// reads. They had already drifted, this file offering "Youth / Students" where
// the database holds "Youth/Students", and only the backend's fuzzy matching
// kept that from silently failing to save.
//
// The database is the source. Short labels for the buttons are derived from
// the stored "Label -> Description" options, and is_required decides which
// section a question belongs to.

// The value saved for a question stays exactly what it has always been: the
// English short label, which is what the backend normalises against. The raw
// option is carried alongside it purely so the button can be drawn in the
// site language, and nothing translated is ever written back.
function toUiQuestion(q) {
  return {
    id: q.question_id,
    label: q.question_text,
    options: (q.options ?? []).map((opt) => ({ value: labelWithSize(opt), raw: opt })),
  };
}

// Filled once the questions load. Empty until then, so nothing is written
// against a question this build has not seen.
const DEFAULTS = {};


const STORAGE_KEY = 'ambedkargpt-preferences';

function stripArrow(val) {
  return typeof val === 'string' && val.includes(' -> ') ? val.split(' -> ')[0].trim() : val;
}

function readLocalPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const cleaned = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, stripArrow(v)]));
    return { ...DEFAULTS, ...cleaned };
  } catch {
    return null;
  }
}

// ─── Question card ────────────────────────────────────────────────────────────

function QuestionCard({ q, num, value, onSelect, compulsoryLabel }) {
  const { lang } = useI18n();
  const unanswered = q.compulsory && !value;
  return (
    <div
      className={`rounded-2xl border bg-[#0e1628] p-6 ${
        unanswered ? 'border-[#f0a04b]/45' : 'border-[#1a2d50]/60'
      }`}
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 shrink-0 font-count text-[13px] font-bold text-[#3f6bd4]">
          {String(num).padStart(2, '0')}
        </span>
        <p className="text-[13.5px] font-medium leading-snug text-[#c0cde8]">
          {lang === 'hi' && q.labelHi ? q.labelHi : questionLabel(q.label, lang)}
          {q.compulsory && compulsoryLabel && (
            <span className="ml-2 inline-block rounded-full border border-[#f0a04b]/45 bg-[#f0a04b]/10 px-2 py-[2px] align-middle text-[10px] font-semibold text-[#f0b877]">
              {compulsoryLabel}
            </span>
          )}
        </p>
      </div>
      <div className={q.wide ? 'grid gap-2.5 sm:grid-cols-2' : 'grid grid-cols-2 gap-2.5 sm:grid-cols-3'}>
        {q.options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              className={[
                q.wide
                  ? 'relative flex items-center justify-start gap-2 rounded-xl px-3.5 py-3 text-left text-[12.5px] font-medium leading-snug transition-all duration-200'
                  : 'relative flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-[12.5px] font-medium transition-all duration-200',
                active
                  ? 'bg-gradient-to-r from-[#2563eb] to-[#3f9fff] text-white shadow-[0_4px_18px_rgba(37,99,235,0.45)]'
                  : 'border border-[#1e3260]/70 bg-[#0a1428]/80 text-[#7a90b8] hover:border-[#3f6bd4]/50 hover:bg-[#0f1d3a] hover:text-white',
              ].join(' ')}
            >
              {active && <Check size={11} strokeWidth={3} className="shrink-0" />}
              {q.wide ? (lang === 'hi' && opt.hi ? opt.hi : opt.raw) : labelWithSize(opt.raw, lang)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A card's shape while its question is still loading.
 *
 * Three sections load from three separate requests, and a section that renders
 * nothing until its own request lands makes the page arrive in pieces: the
 * heading sits alone, then questions appear underneath it and push everything
 * below them down the page. Holding the shape means the page settles once.
 *
 * `rows` is how many option buttons the real card will have, so the placeholder
 * is the height of what replaces it rather than a guess.
 */
function QuestionCardSkeleton({ rows = 3 }) {
  return (
    <div className="animate-pulse rounded-2xl border border-[#1a2d50]/60 bg-[#0e1628] p-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 h-3.5 w-5 shrink-0 rounded bg-[#1e3260]/70" />
        <div className="h-3.5 w-3/5 rounded bg-[#1e3260]/70" />
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-[42px] rounded-xl border border-[#1e3260]/40 bg-[#0a1428]/70" />
        ))}
      </div>
    </div>
  );
}

// How many cards to hold space for, per section. The real counts, so the page
// does not jump when they arrive.
function Skeletons({ count, rows }) {
  return Array.from({ length: count }, (_, i) => <QuestionCardSkeleton key={i} rows={rows} />);
}

function SectionHeader({ label, badge, description }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[18px] font-semibold text-white">{label}</h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${
              badge === 'Required'
                ? 'bg-[#2563eb]/20 text-[#6aa8ff] border border-[#2563eb]/30'
                : 'bg-[#7b5cff]/15 text-[#a78bfa] border border-[#7b5cff]/30'
            }`}
          >
            {badge}
          </span>
        </div>
        {description && (
          <p className="mt-0.5 text-[12px] text-[#6b78a0]">{description}</p>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Preferences() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  // Initialise from localStorage immediately so nothing flashes to defaults on revisit
  const [compulsory, setCompulsory] = useState([]);
  const [optional, setOptional]     = useState([]);
  const [prefs, setPrefs]       = useState(() => readLocalPrefs() ?? DEFAULTS);

  // Five questions written for this user's party and the level of their
  // position in it, so a national leader and a block worker are asked
  // different things. Party and position are chosen on the profile screen and
  // read back here from the saved user, which is also what the post generator
  // reads to find the set: answers given against anything else never reach a post.
  const [reloadKey, setReloadKey] = useState(0);
  const userParty = currentUser?.political_party || '';
  const positionGroup = groupForId(currentUser?.party_position || '');
  // Mirrors question_party() in backend/pipeline/position_questions.py, and
  // has to be kept in step with it by hand — a party added there and not here
  // gets its questions but never the prompt telling the writer to set a
  // position first, so the set stays invisible to anyone who has not.
  const partyHasPositionSet =
    /indian national congress|\(inc\)|bahujan samaj|\(bsp\)|samajwadi|\(sp\)/i.test(userParty);
  const [positionQuestions, setPositionQuestions] = useState([]);

  // Ten questions about the party itself: what the writer wants said about it,
  // rather than how someone at their level says it. They depend on the party
  // alone, so they show for a party member who has not chosen a position yet.
  const [partyQuestions, setPartyQuestions] = useState([]);
  // A failed fetch used to be indistinguishable from "this party has no
  // questions": both left the array empty and the whole section simply was not
  // drawn, with nothing on screen to say why. Ten questions can go missing
  // without a trace that way.
  const [loadError, setLoadError] = useState('');
  // One flag per request rather than one for the page: the three land at
  // different times, and a section that has its questions should not wait on
  // the two that do not.
  const [loadingCore, setLoadingCore] = useState(true);
  const [loadingParty, setLoadingParty] = useState(false);
  const [loadingPosition, setLoadingPosition] = useState(false);

  useEffect(() => {
    if (!userParty) {
      setPartyQuestions([]);
      return undefined;
    }
    let cancelled = false;
    setLoadingParty(true);
    getPartyQuestions(userParty)
      .then((rows) => {
        if (cancelled) return;
        setPartyQuestions(rows.map((q) => ({
          id: q.question_id,
          label: q.question_text,
          labelHi: q.question_text_hi,
          wide: true,
          compulsory: Boolean(q.is_compulsory),
          defaultOption: q.default_option || '',
          options: (q.options ?? []).map((opt, i) => ({ value: opt, raw: opt, hi: q.options_hi?.[i] || '' })),
        })));
        // These ten are not asked at sign-up, so they arrive on this page
        // already answered. The same option the backend falls back to is
        // pre-selected here, so the buttons and the generated post agree
        // before the user has touched anything.
        //
        // Existing values win: the merge is defaults first, then whatever is
        // already in state. That holds whichever way the race runs, because
        // the saved answers load in their own effect.
        const seeded = Object.fromEntries(
          rows.filter((q) => q.default_option).map((q) => [q.question_id, q.default_option]),
        );
        setPrefs((p) => ({ ...seeded, ...p }));
      })
      .catch(() => { if (!cancelled) { setPartyQuestions([]); setLoadError('party'); } })
      .finally(() => { if (!cancelled) setLoadingParty(false); });
    return () => { cancelled = true; };
  }, [userParty, reloadKey]);

  useEffect(() => {
    if (!userParty || !positionGroup) {
      setPositionQuestions([]);
      return undefined;
    }
    let cancelled = false;
    setLoadingPosition(true);
    getPositionQuestions(userParty, positionGroup)
      .then((rows) => {
        if (cancelled) return;
        // The English option is the value saved and validated; the Hindi at the
        // same index is only what gets drawn.
        setPositionQuestions(rows.map((q) => ({
          id: q.question_id,
          label: q.question_text,
          labelHi: q.question_text_hi,
          wide: true,
          options: (q.options ?? []).map((opt, i) => ({ value: opt, raw: opt, hi: q.options_hi?.[i] || '' })),
        })));
      })
      .catch(() => { if (!cancelled) { setPositionQuestions([]); setLoadError('position'); } })
      .finally(() => { if (!cancelled) setLoadingPosition(false); });
    return () => { cancelled = true; };
  }, [userParty, positionGroup, reloadKey]);

  // Load the question set first: the answer map is keyed on it, and rendering
  // buttons for a question the database no longer has would let someone save
  // an answer nothing reads.
  useEffect(() => {
    getQuestions(200)
      .then((rows) => {
        // is_active is checked here, not only the id prefix. The listing
        // returns retired questions too, and the eighteen fine-tuning ones were
        // retired rather than deleted so that answers already given against
        // them stay valid rows. Without this they would still be drawn.
        const active = (rows ?? []).filter(
          (q) => q.question_id?.startsWith('profile_') && q.is_active !== false,
        );
        const byId = Object.fromEntries(active.map((q) => [q.question_id, q]));
        // Core is the seven the generator's panel shows, in that order, rather
        // than is_required: the database marks fourteen questions required,
        // which would move seven of them into this page's Core section.
        setCompulsory(
          SHOW_CORE_QUESTIONS
            ? CORE_QUESTION_IDS.map((id) => byId[id]).filter(Boolean).map(toUiQuestion)
            // Empty rather than merely unrendered, so the page's answered count
            // describes what is on it instead of counting invisible questions.
            : []
        );
        setOptional(active.filter((q) => !CORE_QUESTION_IDS.includes(q.question_id)).map(toUiQuestion));
      })
      .catch(() => setLoadError('core'))
      .finally(() => setLoadingCore(false));
  }, [reloadKey]);
  const [saved, setSaved]       = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState('');

  // Load from DB and sync to localStorage
  useEffect(() => {
    if (!currentUser?.id) return;
    getProfileAnswers(currentUser.id)
      .then((rows) => {
        if (!rows?.length) return;
        // Functional, not `{ ...prefs }`: this effect runs once and would hold
        // a stale copy of prefs. The party defaults are seeded from a separate
        // effect, and with a stale copy whichever landed second would erase the
        // other's values.
        setPrefs((p) => {
          const merged = { ...p };
          for (const row of rows) {
            // Backend normalises short labels to "Label -> Description" on save.
            // Strip the description so the short label matches the UI option buttons.
            const raw = row.answer;
            merged[row.question_id] =
              typeof raw === 'string' && raw.includes(' -> ')
                ? raw.split(' -> ')[0].trim()
                : raw;
          }
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch { /* ignore */ }
          return merged;
        });
      })
      .catch(() => {}); // silently fall back to localStorage values already in state
  }, [currentUser?.id]);

  function select(id, val) {
    setPrefs((p) => ({ ...p, [id]: val }));
  }

  // Compulsory is enforced on this screen because it cannot be enforced in the
  // API: both parties' sets are active at once, so a required flag there would
  // hold a BSP user to the INC question they are never shown.
  const unansweredCompulsory = partyQuestions.filter((q) => q.compulsory && !prefs[q.id]);

  async function handleSave() {
    if (!currentUser?.id) return;
    if (unansweredCompulsory.length) {
      setSaveError(t('prefs.answerCompulsory'));
      const el = document.getElementById(`q-${unansweredCompulsory[0].id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      await saveProfileAnswers(currentUser.id, prefs);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
      setSaved(true);
    } catch {
      // Save locally even if remote fails so next visit still shows the right values
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
      setSaveError(t('prefs.savedLocally'));
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    // The party questions go back to their defaults rather than to nothing.
    // Blank is not a state they have: every user starts from a full set, and
    // an empty one would leave the compulsory question unanswerable-looking
    // and the prompt quietly falling back to the same defaults anyway.
    setPrefs(Object.fromEntries(
      partyQuestions.filter((q) => q.defaultOption).map((q) => [q.id, q.defaultOption]),
    ));
    setSaved(false);
  }

  // Counted over the questions on screen. Saved answers for a position the user
  // has since left are still in prefs and would otherwise push this past the total.
  const shownIds      = [...compulsory, ...partyQuestions, ...positionQuestions, ...optional].map((q) => q.id);
  const answeredCount = shownIds.filter((id) => prefs[id]).length;
  const totalCount    = shownIds.length || 1;
  const stillLoading  = loadingCore || loadingParty || loadingPosition;

  return (
    <>
      {/* The brand and the back-to-dashboard button that used to head this page
          are both in the sidebar now, which is always on screen. The answered
          count stays: it belongs to this page. */}
      <div className="relative px-4 sm:px-6 md:px-10">
        <Topbar
          title={t('prefs.pageTitle')}
          icon={<SlidersHorizontal size={15} strokeWidth={2} className="hidden shrink-0 text-[#4f7fd4] lg:block" />}
          right={
            <div className="mr-1 hidden items-center gap-3 sm:flex">
              {/* "0 / 1 answered" while the questions are still in flight is
                  not a smaller number, it is a wrong one. */}
              <span className="text-[12.5px] text-[#6b78a0]">
                {stillLoading ? (
                  <span className="inline-block h-3 w-16 animate-pulse rounded bg-[#1e3260]/70 align-middle" />
                ) : (
                  <>
                    <span className="font-count font-bold text-white">{answeredCount}</span>
                    <span> / {totalCount} {t('prefs.answeredWord')}</span>
                  </>
                )}
              </span>
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#0f1a3a]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#2563eb] to-[#3f9fff] transition-all duration-500"
                  style={{ width: `${(answeredCount / totalCount) * 100}%` }}
                />
              </div>
            </div>
          }
        />

        <div className="relative mx-auto max-w-[780px] pb-28 pt-2">

        {/* ── Page hero ── The logo that used to sit beside this heading is in
            the sidebar now, so the heading stands on its own. */}
        <div className="mb-9">
          <h1 className="font-display text-[30px] font-bold leading-tight text-white md:text-[40px]">
            {t('prefs.pageTitle')}
          </h1>
          <p className="mt-2 text-[14px] text-[#7a90b8]">
            {t('prefs.helpUs')}
          </p>
        </div>

        <ConnectedAccounts />

        {/* ── Compulsory questions ── */}
        {SHOW_CORE_QUESTIONS && (
          <>
            <SectionHeader
              label={t('prefs.coreProfile')}
              badge={t('prefs.required')}
              description={t('prefs.coreDesc')}
            />
            <div className="space-y-4">
              {loadingCore && !compulsory.length
                ? <Skeletons count={CORE_QUESTION_IDS.length} rows={6} />
                : compulsory.map((q, i) => (
                  <QuestionCard
                    key={q.id}
                    q={q}
                    num={i + 1}
                    value={prefs[q.id]}
                    onSelect={(v) => select(q.id, v)}
                  />
                ))}
            </div>
          </>
        )}

        {loadError && (
          <div className="mt-12 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e55555]/35 bg-[#1a0f18] px-5 py-4">
            <p className="text-[13px] text-[#e59a9a]">{t('questionnaire.loadFailed')}</p>
            <button
              type="button"
              onClick={() => { setLoadError(''); setReloadKey((k) => k + 1); }}
              className="rounded-full border border-[#e55555]/40 px-4 py-2 text-[12.5px] font-medium text-[#e5b5b5] transition hover:border-[#e55555]/70 hover:text-white"
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        {/* ── Party questions ── */}
        {(loadingParty || partyQuestions.length > 0) && (
          <div className="mt-12">
            <SectionHeader
              label={t('prefs.partyTitle')}
              badge={t('prefs.optionalBadge')}
              description={t('prefs.partyDesc')}
            />
            <div className="space-y-4">
              {loadingParty && !partyQuestions.length && <Skeletons count={10} rows={5} />}
              {partyQuestions.map((q, i) => (
                <div key={q.id} id={`q-${q.id}`}>
                  <QuestionCard
                    q={q}
                    num={compulsory.length + i + 1}
                    value={prefs[q.id]}
                    onSelect={(v) => select(q.id, v)}
                    compulsoryLabel={t('prefs.compulsory')}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        {!userParty && !loadingCore && (
          <div className="mt-12 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#1a2d50]/60 bg-[#0e1628] px-5 py-4">
            <p className="text-[13px] text-[#8b94b8]">{t('prefs.partyNeedParty')}</p>
            <button
              type="button"
              onClick={() => navigate('/profile-setup')}
              className="rounded-full border border-[#1e3260]/70 px-4 py-2 text-[12.5px] font-medium text-[#a3b0d4] transition hover:border-[#3a6bc4]/60 hover:text-white"
            >
              {t('prefs.partySetParty')}
            </button>
          </div>
        )}

        {/* ── Position questions ── */}
        {(loadingPosition || positionQuestions.length > 0) && (
          <div className="mt-12">
            <SectionHeader
              label={t('prefs.positionTitle')}
              badge={t('prefs.optionalBadge')}
              description={t('prefs.positionDesc')}
            />
            <div className="space-y-4">
              {loadingPosition && !positionQuestions.length && <Skeletons count={5} rows={5} />}
              {positionQuestions.map((q, i) => (
                <QuestionCard
                  key={q.id}
                  q={q}
                  num={compulsory.length + partyQuestions.length + i + 1}
                  value={prefs[q.id]}
                  onSelect={(v) => select(q.id, v)}
                />
              ))}
            </div>
          </div>
        )}
        {partyHasPositionSet && !positionGroup && (
          <div className="mt-12 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#1a2d50]/60 bg-[#0e1628] px-5 py-4">
            <p className="text-[13px] text-[#8b94b8]">{t('prefs.positionNeedRole')}</p>
            <button
              type="button"
              onClick={() => navigate('/profile-setup')}
              className="rounded-full border border-[#1e3260]/70 px-4 py-2 text-[12.5px] font-medium text-[#a3b0d4] transition hover:border-[#3a6bc4]/60 hover:text-white"
            >
              {t('prefs.positionSetRole')}
            </button>
          </div>
        )}

        {/* ── Optional questions ── The eighteen fine-tuning questions were
            retired when the party set arrived, so this list is empty on a
            current database and the section does not draw at all. It stays
            because getQuestions returns whatever is active: bring one back and
            it appears here again without a code change. */}
        {optional.length > 0 && (
          <div className="mt-12">
            <SectionHeader
              label={t('prefs.fineTuning')}
              badge={t('prefs.optionalBadge')}
              description={t('prefs.optionalDesc')}
            />
            <div className="space-y-4">
              {optional.map((q, i) => (
                <QuestionCard
                  key={q.id}
                  q={q}
                  num={compulsory.length + partyQuestions.length + positionQuestions.length + i + 1}
                  value={prefs[q.id]}
                  onSelect={(v) => select(q.id, v)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Footer actions ── */}
        <div className="mt-10 flex items-center justify-between">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex min-h-9 items-center text-[12.5px] text-[#6b78a0] underline underline-offset-2 transition hover:text-white"
          >
            {t('prefs.reset')}
          </button>

          <div className="flex flex-col items-end gap-2">
            {saveError && (
              <p className="text-[12px] text-red-400">{saveError}</p>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl btn-gradient px-8 py-3.5 text-[14px] font-semibold text-white shadow-[0_10px_32px_rgba(37,99,235,0.4)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving
                ? <Loader2 size={15} strokeWidth={2} className="animate-spin" />
                : saved
                  ? <Check size={15} strokeWidth={2.5} />
                  : <Save size={15} strokeWidth={2} />}
              {saving ? t('common.saving') : saved ? t('prefs.savedShort') : t('prefs.savePrefs')}
            </button>
          </div>
        </div>
        </div>
      </div>

      {/* ── Post-save floating toast ── */}
      {saved && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div
            className="flex items-center gap-3 rounded-2xl border border-[#22c55e]/25 px-5 py-3.5 shadow-2xl backdrop-blur-md"
            style={{ background: 'rgba(5,12,26,0.92)', boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(34,197,94,0.15)' }}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#22c55e]/15">
              <Check size={12} strokeWidth={3} className="text-[#22c55e]" />
            </span>
            <span className="text-[13px] font-medium text-white">{t('prefs.savedBang')}</span>
            <div className="ml-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#1e3260]/70 px-3 py-1.5 text-[12px] font-medium text-[#6b78a0] transition hover:border-[#3a6bc4]/60 hover:text-white"
              >
                <Home size={11} strokeWidth={2} />
                {t('nav.dashboard')}
              </button>
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#1e3260]/70 px-3 py-1.5 text-[12px] font-medium text-[#6b78a0] transition hover:border-[#3a6bc4]/60 hover:text-white"
              >
                <ArrowUp size={11} strokeWidth={2} />
                Top
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
