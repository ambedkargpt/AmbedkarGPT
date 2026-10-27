import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurtain } from '../context/CurtainContext';
import { ArrowLeft, ArrowRight, BookmarkCheck, FastForward } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { saveProfileAnswers } from '../api/profile';
import { getPartyQuestions, getPositionQuestions } from '../api/questions';
import usePendingQuestions, { clearPendingQuestions } from '../hooks/usePendingQuestions';
import { partyHasQuestions } from '../utils/partyQuestions';
import { groupForId, roleLabel, rolesInGroup } from '../utils/partyRoles';
import { levelLabel } from '../utils/displayLabel';
import AgMark      from '../components/brand/AgMark';
import ambedkarSrc from '../assets/images/qna-ambedkar.webp';
import { useI18n } from '../i18n/index.jsx';

// This page asks whichever question sets the user has never answered, which
// the backend decides and /questions/pending reports.
//
// For a new sign-up that is the five questions written for their party and the
// level of their position in it. The ten party questions are not asked there:
// a new account starts from their defaults and changes them on the Preferences
// page, which is what keeps sign-up at five questions rather than fifteen.
//
// For an account that predates the party questions it is those ten as well,
// once. Those users were never offered them and would otherwise generate on
// defaults they never saw.
//
// A new storage key on every change to which questions are asked, because the
// old one holds a step index counted against the old list. Restored against a
// shorter list it points past the end and leaves the page on its spinner.
const STORAGE_KEY = 'ambedkargpt_preference_questionnaire';


function useSlideAnim(index, direction) {
  const [display, setDisplay]   = useState(index);
  const [animate, setAnimate]   = useState('idle');
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (index === display) return;
    const exitClass  = direction === 'next' ? 'exit-left'  : 'exit-right';
    const enterClass = direction === 'next' ? 'enter-right' : 'enter-left';
    setAnimating(true);
    setAnimate(exitClass);
    const t1 = setTimeout(() => { setDisplay(index); setAnimate(enterClass); }, 350);
    const t2 = setTimeout(() => { setAnimate('idle'); setAnimating(false); }, 700);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  return { display, animate, animating };
}

const ANIM_STYLES = {
  idle:          { opacity: 1, transform: 'translateX(0)' },
  'exit-left':   { opacity: 0, transform: 'translateX(-52px)' },
  'exit-right':  { opacity: 0, transform: 'translateX(52px)' },
  'enter-right': { opacity: 0, transform: 'translateX(52px)' },
  'enter-left':  { opacity: 0, transform: 'translateX(-52px)' },
};

function readSaved(party, positionId) {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    // Progress only counts for the party and position it was made against.
    // Both decide which questions are asked, so either changing invalidates it.
    return s.party === party && s.positionId === positionId ? s : {};
  } catch {
    return {};
  }
}

function Shell({ children }) {
  const { t } = useI18n();
  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: 'linear-gradient(160deg,#0d1535 0%,#080e22 100%)' }}
    >
      <div className="pointer-events-none fixed -left-48 -top-48 h-[500px] w-[500px] rounded-full bg-[#1e4fb5]/15 blur-[130px]" />
      <div className="pointer-events-none fixed bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-[#3f9fff]/10 blur-[120px]" />

      <header className="relative z-10 flex items-center px-8 pt-7 md:px-14">
        <div className="flex items-center gap-2.5">
          <AgMark size={28} color="#8FA8FF" />
          <span className="font-display text-[20px] font-bold leading-none tracking-tight">
            <span className="text-white">{t('brand.ambedkar')}</span>
            <span className="gradient-text-cyan">GPT</span>
          </span>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center px-6 pb-10 pt-8 md:px-14">
        <div className="relative flex items-center justify-center">
          <div
            className="absolute h-[260px] w-[260px] rounded-full blur-[60px]"
            style={{ background: 'radial-gradient(circle, rgba(63,159,255,0.28) 0%, rgba(123,92,255,0.14) 55%, transparent 75%)' }}
          />
          <img
            src={ambedkarSrc}
            alt="Dr. B.R. Ambedkar"
            className="relative z-10 w-[180px] object-contain drop-shadow-[0_12px_40px_rgba(0,0,0,0.55)] md:w-[210px]"
          />
        </div>
        {children}
      </main>
    </div>
  );
}

function Spinner() {
  const { t } = useI18n();
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4"
      style={{ background: 'linear-gradient(160deg,#0d1535 0%,#080e22 100%)' }}
    >
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#1e3260] border-t-[#3f9fff]" />
      <p className="font-count text-[13px] text-[#5a6e9a]">{t('quest.loading')}</p>
    </div>
  );
}

export default function Questionnaire() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { go: curtainGo } = useCurtain();
  const { currentUser } = useAuth();

  const party = currentUser?.political_party || '';
  const positionId = currentUser?.party_position || '';
  const group = groupForId(positionId);
  const partyHasSet = partyHasQuestions(party);
  const role = rolesInGroup(group).find((r) => r.id === positionId);

  const leftRef = useRef(false);
  function leave() {
    if (leftRef.current) return;
    leftRef.current = true;
    const redirect = sessionStorage.getItem('auth_redirect') || '/dashboard';
    sessionStorage.removeItem('auth_redirect');
    curtainGo(redirect, { replace: true });
  }

  // What is outstanding for this account. Shared with ProtectedRoute, which
  // is what sends an older account here in the first place, so this costs no
  // extra request.
  const { pending, checked } = usePendingQuestions(currentUser?.id);

  // Nothing outstanding: no questions are written for this party, or they have
  // all been answered already. Party and position are both asked for at
  // sign-up, so this page does not ask for a role a second time; someone who
  // skipped it sets it on the profile screen, and the Preferences page points
  // them there.
  useEffect(() => {
    if (currentUser && checked && !pending.party && !pending.position) {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      leave();
    }
  }, [currentUser, checked, pending.party, pending.position]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── The questions: the party set, then the position set ──
  const [questions, setQuestions] = useState([]);
  const [loadingQ,  setLoadingQ]  = useState(false);
  const [fetchErr,  setFetchErr]  = useState(false);

  useEffect(() => {
    if (!checked || !partyHasSet || (!pending.party && !pending.position)) {
      setQuestions([]);
      return undefined;
    }
    let cancelled = false;
    setLoadingQ(true);
    setFetchErr(false);
    // Only the outstanding sets are requested. Resolving the other to an empty
    // list keeps the two calls one shape.
    Promise.all([
      pending.party ? getPartyQuestions(party) : Promise.resolve([]),
      pending.position && group ? getPositionQuestions(party, group) : Promise.resolve([]),
    ])
      .then(([partyRows, positionRows]) => {
        if (cancelled) return;
        // The English option is what gets saved and validated; the Hindi at the
        // same index is only what gets drawn.
        const toQuestion = (kind) => (q) => ({
          id: q.question_id,
          kind,
          compulsory: Boolean(q.is_compulsory),
          text: q.question_text,
          textHi: q.question_text_hi,
          defaultOption: q.default_option || '',
          options: (q.options ?? []).map((opt, i) => ({ value: opt, hi: q.options_hi?.[i] || '' })),
        });
        // The party set first: what someone wants said about their party holds
        // whatever office they hold, so it is the wider question of the two.
        const all = [
          ...partyRows.map(toQuestion('party')),
          ...positionRows.map(toQuestion('position')),
        ];
        if (!all.length) { leave(); return; }
        setQuestions(all);
      })
      .catch(() => { if (!cancelled) setFetchErr(true); })
      .finally(() => { if (!cancelled) setLoadingQ(false); });
    return () => { cancelled = true; };
  }, [party, group, partyHasSet, checked, pending.party, pending.position]); // eslint-disable-line react-hooks/exhaustive-deps

  const saved = useMemo(() => readSaved(party, positionId), [party, positionId]);
  const [step, setStep]       = useState(saved.step ?? 0);
  const [answers, setAnswers] = useState(saved.answers ?? {});
  const [direction, setDir]   = useState('next');

  const total    = questions.length;
  const safeStep = total ? Math.min(step, total - 1) : 0;
  const { display, animate, animating } = useSlideAnim(safeStep, direction);
  const question = questions[Math.min(display, Math.max(total - 1, 0))];
  const progress = total ? Math.round((safeStep / total) * 100) : 0;
  const selected = question ? answers[question.id] : undefined;
  const isLast   = total > 0 && safeStep === total - 1;
  // The one question nobody may skip past. Question 10 of the party set: two
  // supporters of the same party can want opposite posts, and this is the
  // answer that separates them.
  const mustAnswer = Boolean(question?.compulsory) && !selected;

  useEffect(() => {
    if (!party) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ party, positionId, step: safeStep, answers }));
    } catch { /* ignore */ }
  }, [party, positionId, safeStep, answers]);

  function select(value) {
    setAnswers((prev) => ({ ...prev, [question.id]: value }));
  }

  function goNext() {
    if (!selected || animating) return;
    if (isLast) { finish(); return; }
    setDir('next');
    setStep(safeStep + 1);
  }

  function goBack() {
    if (safeStep === 0 || animating) return;
    setDir('back');
    setStep(safeStep - 1);
  }

  // Only the questions on screen are ever sent.
  function answersToSave() {
    const shown = new Set(questions.map((q) => q.id));
    return Object.fromEntries(Object.entries(answers).filter(([id, v]) => shown.has(id) && v));
  }

  function saveAndContinue() {
    // Leaving early used to send nothing, so someone who answered eight of ten
    // and stepped away lost all eight and was asked the whole set again. What
    // has been answered is saved; the rest stay outstanding.
    const toSave = answersToSave();
    if (currentUser?.id && Object.keys(toSave).length) {
      saveProfileAnswers(currentUser.id, toSave).catch(() => {});
      clearPendingQuestions();
    }
    const redirect = sessionStorage.getItem('auth_redirect') || '/dashboard';
    sessionStorage.removeItem('auth_redirect');
    navigate(redirect);
  }

  function finish() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    const toSave = answersToSave();
    if (currentUser?.id && Object.keys(toSave).length) {
      saveProfileAnswers(currentUser.id, toSave).catch(() => {});
    }
    // Otherwise the next protected route reads a stale "still outstanding" and
    // sends them straight back into the questionnaire they just completed.
    clearPendingQuestions();
    leave();
  }

  // Skip the rest: every question still unanswered takes its recommended
  // answer (the party set's default, the first option where a set has none),
  // and the whole set is saved, so the account can post straight away and the
  // answers can be changed later on the Preferences page.
  const [skipping, setSkipping] = useState(false);
  async function skipWithDefaults() {
    if (skipping || !currentUser?.id) return;
    setSkipping(true);
    const filled = Object.fromEntries(questions.map((q) => [
      q.id, answers[q.id] || q.defaultOption || q.options[0]?.value || '',
    ]).filter(([, v]) => v));
    try {
      await saveProfileAnswers(currentUser.id, filled);
    } catch {
      setSkipping(false);
      return;
    }
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    clearPendingQuestions();
    leave();
  }

  // ── Render ──
  if (!currentUser || !partyHasSet) return <Spinner />;

  if (fetchErr) {
    return (
      <Shell>
        <div className="mt-8 flex w-full max-w-[600px] flex-col items-center gap-5 text-center">
          <p className="font-count text-[14px] text-[#e55555]">{t('questionnaire.loadFailed')}</p>
          <button
            type="button"
            onClick={leave}
            className="inline-flex h-10 items-center rounded-full border border-[#1e3260]/60 px-5 text-[13px] font-medium text-[#6b80a8] transition-all hover:border-[#3a6bc4]/50 hover:text-[#a0bade]"
          >
            {t('quest.skipForNow')}
          </button>
        </div>
      </Shell>
    );
  }

  if (loadingQ || !question) return <Spinner />;

  const roleName = role ? roleLabel(role, party, lang) : '';

  return (
    <Shell>
      {/* Progress bar */}
      <div className="mt-8 w-full max-w-[760px]">
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-[#1a2c55]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#3f9fff] to-[#7b5cff]"
            style={{
              width: `${Math.max(progress, 3)}%`,
              transition: 'width 500ms cubic-bezier(0.4,0,0.2,1)',
              boxShadow: '0 0 10px rgba(63,159,255,0.55)',
            }}
          />
        </div>
        <div className="mt-2.5 flex items-center justify-between font-count text-[12px] text-[#5a6e9a]">
          <span>{t('quest.progress', { n: safeStep + 1, total })}</span>
          <span>{t('quest.percent', { pct: progress })}</span>
        </div>
      </div>

      {/* Animated question + options */}
      <div
        className="w-full max-w-[760px]"
        style={{
          ...ANIM_STYLES[animate],
          transition: 'opacity 350ms ease, transform 350ms cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <p className="mt-7 flex flex-wrap items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-[#5f8fd8]">
          <span>
            {question.kind === 'party'
              ? t('quest.sectionParty')
              : `${levelLabel(group, lang)}${roleName ? ` · ${roleName}` : ''}`}
          </span>
          {question.compulsory && (
            <span className="rounded-full border border-[#f0a04b]/45 bg-[#f0a04b]/10 px-2 py-[3px] text-[10px] tracking-[0.08em] text-[#f0b877]">
              {t('quest.compulsory')}
            </span>
          )}
        </p>
        <h2 className="font-display mt-2 text-[24px] font-semibold leading-snug text-white md:text-[28px]">
          {lang === 'hi' && question.textHi ? question.textHi : question.text}
        </h2>
        {question.compulsory && (
          <p className="mt-2 text-[12.5px] leading-relaxed text-[#7c8fb5]">{t('quest.compulsoryNote')}</p>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {question.options.map((opt) => {
            const isSelected = selected === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => select(opt.value)}
                aria-pressed={isSelected}
                className="font-count rounded-xl border px-5 py-4 text-left text-[13.5px] font-medium leading-snug transition-all duration-200"
                style={{
                  backgroundColor: isSelected ? 'rgba(20,50,110,0.6)'   : 'rgba(255,255,255,0.03)',
                  borderColor:     isSelected ? 'rgba(63,159,255,0.65)' : 'rgba(40,65,120,0.55)',
                  color:           isSelected ? '#d6eaff'               : '#8fa5cc',
                  boxShadow:       isSelected ? '0 0 14px rgba(63,159,255,0.18)' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = 'rgba(63,159,255,0.35)';
                    e.currentTarget.style.color = '#b0c5e8';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = 'rgba(40,65,120,0.55)';
                    e.currentTarget.style.color = '#8fa5cc';
                  }
                }}
              >
                {lang === 'hi' && opt.hi ? opt.hi : opt.value}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom navigation */}
      <div className="mt-10 flex w-full max-w-[760px] flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={goBack}
          disabled={safeStep === 0 || animating}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-[#1e3260]/70 px-5 text-[13px] font-medium text-[#6b80a8] transition-all hover:border-[#3a6bc4]/60 hover:text-white disabled:pointer-events-none disabled:opacity-25"
        >
          <ArrowLeft size={14} strokeWidth={2} />
          {t('common.back')}
        </button>

        {/* Next already refuses to advance without an answer, so this button is
            the only way past a question. On the compulsory one it is not
            offered until the answer is given. Nor while the preference
            questions are outstanding: they are required before any post, and
            a partial save would count them as done. */}
        <button
          type="button"
          onClick={skipWithDefaults}
          disabled={skipping}
          title={t('quest.skipDefaultsHint')}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-[#1e3260]/60 px-5 text-[13px] font-medium text-[#6b80a8] transition-all hover:border-[#3a6bc4]/50 hover:text-[#a0bade] disabled:opacity-50"
        >
          <FastForward size={14} strokeWidth={1.8} />
          {skipping ? t('quest.skipping') : t('quest.skipDefaults')}
        </button>

        {!mustAnswer && !pending.position && (
          <button
            type="button"
            onClick={saveAndContinue}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[#1e3260]/60 px-5 text-[13px] font-medium text-[#6b80a8] transition-all hover:border-[#3a6bc4]/50 hover:text-[#a0bade]"
          >
            <BookmarkCheck size={14} strokeWidth={1.8} />
            {t('quest.saveLater')}
          </button>
        )}

        <button
          type="button"
          onClick={goNext}
          disabled={!selected || animating}
          className="inline-flex h-10 items-center gap-2 rounded-full px-6 text-[13px] font-semibold text-white transition-all duration-200 hover:brightness-110 disabled:pointer-events-none disabled:opacity-35"
          style={{
            background: selected ? 'linear-gradient(90deg,#0a7dff,#3a9fff)' : 'rgba(30,50,100,0.4)',
            boxShadow:  selected ? '0 4px 20px rgba(17,122,255,0.35)'       : 'none',
          }}
        >
          {isLast ? t('quest.finish') : t('common.next')}
          <ArrowRight size={14} strokeWidth={2} />
        </button>
      </div>
    </Shell>
  );
}
