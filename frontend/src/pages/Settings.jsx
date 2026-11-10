import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AtSign, Check, ChevronDown, Languages, Loader2, Lock, Settings as SettingsIcon, UserRound, Mic2,
} from 'lucide-react';

import Topbar from '../components/dashboard/Topbar';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/index.jsx';
import { clearPendingQuestions } from '../hooks/usePendingQuestions';
import { partyHasQuestions } from '../utils/partyQuestions';
import { ALL_POLITICAL_PARTIES, POLITICAL_PARTIES } from '../utils/politicalParties';
import { ROLE_GROUPS, groupForId, labelForId, roleLabel, rolesInGroup } from '../utils/partyRoles';
import { INDIAN_STATES, CITIES_BY_STATE } from '../utils/indianStatesCities';
import { partyLabel, levelLabel } from '../utils/displayLabel';
import { safeNext } from '../utils/onboardingTarget';
import Preferences from './Preferences';

// Only an account that signed up by email lacks a phone; the phone field and
// its number library are loaded for that case alone.
const PhoneField = lazy(() => import('../components/PhoneField'));

/**
 * Settings: one page with four tabs, in the order people look for things.
 *
 *   Profile    - who you are, where you are, your party and role
 *   Your voice - the party and style questions every post is written from
 *   Accounts   - Reddit and anything that publishes for you
 *   Language   - the site's language, which is also the posts'
 *
 * Replaces the separate profile and preferences pages, which were two screens
 * for what people think of as one. /preferences and the sidebar's profile link
 * both arrive here, and so does an account that tried to write a post without
 * a party: /profile-setup (the old onboarding form) is not used any more and
 * redirects to the Profile tab. `?next=/path` says where to go once the profile
 * is complete, so that person lands back on the news.
 */

const TABS = [
  { id: 'profile',  Icon: UserRound },
  { id: 'voice',    Icon: Mic2 },
  { id: 'language', Icon: Languages },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Small pieces ─────────────────────────────────────────────────────────────

const inputBase =
  'w-full min-h-[52px] rounded-2xl border bg-[#0a1128]/90 px-4 text-[16px] text-white outline-none transition ' +
  'placeholder:text-[#4a5e8a] focus:border-[#3f9fff] focus:shadow-[0_0_0_3px_rgba(63,159,255,0.18)] ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

function Field({ id, label, optional, hint, error, children }) {
  const { t } = useI18n();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="text-[14px] font-semibold text-[#c5cde8]">
        {label}
        {optional && <span className="ml-1.5 font-normal text-[#7d89ad]">· {t('set.optional')}</span>}
      </label>
      {children}
      {error
        ? <p className="text-[13px] text-[#ff7b7b]" role="alert">{error}</p>
        : hint && <p className="text-[13px] text-[#7d89ad]">{hint}</p>}
    </div>
  );
}

function Select({ id, value, onChange, disabled, error, children }) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`${inputBase} appearance-none pr-11 ${error ? 'border-[#ef4444]' : 'border-[#1e3260]'} ${value ? '' : 'text-[#8b94b8]'}`}
      >
        {children}
      </select>
      <ChevronDown size={17} strokeWidth={2.2} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#8b94b8]" />
    </div>
  );
}

/** A heading column on the left, the content on the right; stacked on phones. */
function Section({ id, title, sub, first, children }) {
  return (
    <section
      aria-labelledby={id}
      className={`grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-12 ${first ? '' : 'border-t border-[#1e3260]/60 pt-8'}`}
    >
      <div className="flex flex-col gap-1.5">
        <h2 id={id} className="font-display text-[24px] font-bold leading-tight text-white md:text-[28px]">{title}</h2>
        {sub && <p className="text-[15px] leading-relaxed text-[#8ea3c7]">{sub}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function partyLogo(name) {
  return ALL_POLITICAL_PARTIES.find((p) => p.name === name)?.logo || null;
}

// ── Profile tab ──────────────────────────────────────────────────────────────

function initialProfile(u) {
  const savedCity = u?.city || '';
  const known = !!savedCity && (CITIES_BY_STATE[u?.state] || []).includes(savedCity);
  return {
    fullName: u?.full_name || '',
    username: u?.username || '',
    email: '',
    phone: '',
    state: u?.state || '',
    city: savedCity ? (known ? savedCity : 'Other') : '',
    customCity: savedCity && !known ? savedCity : '',
    dob: u?.date_of_birth || '',
    party: u?.political_party || '',
    level: groupForId(u?.party_position || ''),
    position: u?.party_position || '',
  };
}

function ProfileTab() {
  const { t, lang } = useI18n();
  const { currentUser, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [base, setBase] = useState(() => initialProfile(currentUser));
  const [form, setForm] = useState(base);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [saveError, setSaveError] = useState('');
  const [editParty, setEditParty] = useState(false);

  const needsEmail = !currentUser?.email;
  const needsPhone = !currentUser?.phone;

  // The success tick fades on its own.
  useEffect(() => {
    if (!savedAt) return undefined;
    const id = setTimeout(() => setSavedAt(0), 2600);
    return () => clearTimeout(id);
  }, [savedAt]);

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: '' }));
    setSaveError('');
  };

  const dirty = useMemo(
    () => Object.keys(form).filter((k) => form[k] !== base[k]),
    [form, base],
  );
  // Level is how a position is picked, not a value of its own.
  const changeCount = dirty.filter((k) => k !== 'level').length;

  function validate() {
    const e = {};
    const name = form.fullName.trim();
    const user = form.username.trim();
    if (name.length < 2) e.fullName = t('set.err.name');
    if (user.length < 3) e.username = t('set.err.username');
    else if (!/^[a-zA-Z0-9_]+$/.test(user)) e.username = t('set.err.usernameChars');
    if (needsEmail && form.email.trim() && !EMAIL_RE.test(form.email.trim())) e.email = t('set.err.email');
    if (!form.party) e.party = t('set.err.party');
    else if (partyHasQuestions(form.party) && !form.position) e.position = t('set.err.role');
    if ((form.city && !form.state) || (form.city === 'Other' && !form.customCity.trim())) e.city = t('set.err.city');
    return e;
  }

  async function save() {
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      if (errs.party || errs.position) setEditParty(true);
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      await updateProfile({
        full_name: form.fullName.trim(),
        username: form.username.trim(),
        political_party: form.party || undefined,
        // Sent even when blank: clearing a position is a real choice.
        party_position: form.position,
        ...(needsEmail && form.email.trim() ? { email: form.email.trim() } : {}),
        ...(needsPhone && form.phone ? { phone: form.phone } : {}),
        ...(form.state ? { state: form.state } : {}),
        ...(form.city ? { city: form.city === 'Other' ? form.customCity.trim() : form.city } : {}),
        ...(form.dob ? { date_of_birth: form.dob } : {}),
      });
      if (form.party !== base.party || form.position !== base.position) clearPendingQuestions();
      setBase(form);
      setEditParty(false);
      setSavedAt(Date.now());
      // Sent here to finish the profile before writing a post: once it can be
      // written as somebody, go back to where they were.
      const next = safeNext(searchParams.get('next'));
      if (next && form.party && (form.position || !partyHasQuestions(form.party))) {
        navigate(next, { replace: true });
      }
    } catch (err) {
      const detail = String(err?.response?.data?.detail || err?.message || '').toLowerCase();
      if (detail.includes('username') && detail.includes('taken')) setErrors({ username: t('set.err.taken') });
      else if (detail.includes('email') && detail.includes('exists')) setErrors({ email: t('set.err.emailTaken') });
      else setSaveError(t('set.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setForm(base);
    setErrors({});
    setSaveError('');
    setEditParty(false);
  }

  const logo = partyLogo(form.party);
  const roleText = labelForId(form.position, form.party, lang) || t('set.noRole');

  return (
    <div className="flex flex-col gap-8">
      <Section id="set-about" title={t('set.about')} sub={t('set.aboutSub')} first>
        <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2">
          <Field id="set-name" label={t('set.fullName')} error={errors.fullName}>
            <input
              id="set-name"
              value={form.fullName}
              onChange={(e) => set('fullName', e.target.value)}
              maxLength={60}
              autoComplete="name"
              className={`${inputBase} ${errors.fullName ? 'border-[#ef4444]' : 'border-[#1e3260]'}`}
            />
          </Field>
          <Field id="set-user" label={t('set.username')} hint={t('set.usernameHint')} error={errors.username}>
            <div className={`flex min-h-[52px] items-center rounded-2xl border bg-[#0a1128]/90 transition focus-within:border-[#3f9fff] focus-within:shadow-[0_0_0_3px_rgba(63,159,255,0.18)] ${errors.username ? 'border-[#ef4444]' : 'border-[#1e3260]'}`}>
              <AtSign size={17} strokeWidth={2.2} className="ml-4 shrink-0 text-[#7d89ad]" aria-hidden="true" />
              <input
                id="set-user"
                value={form.username}
                onChange={(e) => set('username', e.target.value)}
                maxLength={30}
                autoComplete="username"
                className="min-w-0 flex-1 bg-transparent px-2.5 text-[16px] text-white outline-none"
              />
            </div>
          </Field>

          {currentUser?.email ? (
            <Field id="set-email" label={t('set.email')} hint={t('set.contactFixed')}>
              <div className="relative">
                <input id="set-email" value={currentUser.email} readOnly className={`${inputBase} border-[#1e3260] pr-11 text-[#c5cde8]`} />
                <Lock size={15} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#7d89ad]" aria-hidden="true" />
              </div>
            </Field>
          ) : (
            <Field id="set-email" label={t('set.email')} optional hint={t('set.addEmail')} error={errors.email}>
              <input
                id="set-email"
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className={`${inputBase} ${errors.email ? 'border-[#ef4444]' : 'border-[#1e3260]'}`}
              />
            </Field>
          )}

          {currentUser?.phone ? (
            <Field id="set-phone" label={t('set.phone')} hint={t('set.contactFixed')}>
              <div className="relative">
                <input id="set-phone" value={currentUser.phone} readOnly className={`${inputBase} border-[#1e3260] pr-11 text-[#c5cde8]`} />
                <Lock size={15} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#7d89ad]" aria-hidden="true" />
              </div>
            </Field>
          ) : (
            <Suspense fallback={<div className="h-[80px] animate-pulse rounded-2xl bg-[#0a1128]/60" />}>
              <PhoneField value={form.phone} onChange={(v) => set('phone', v ?? '')} optional />
            </Suspense>
          )}

          <Field id="set-state" label={t('set.state')} optional>
            <Select
              id="set-state"
              value={form.state}
              onChange={(v) => setForm((f) => ({ ...f, state: v, city: '', customCity: '' }))}
            >
              <option value="">{t('auth.selectState')}</option>
              {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field id="set-city" label={t('set.city')} optional error={errors.city}>
            <Select id="set-city" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v, customCity: '' }))} disabled={!form.state} error={errors.city}>
              <option value="">{form.state ? t('auth.selectCity') : t('auth.chooseStateFirst')}</option>
              {(CITIES_BY_STATE[form.state] || []).map((c) => (
                <option key={c} value={c}>{c === 'Other' ? t('auth.otherCity') : c}</option>
              ))}
            </Select>
            {form.city === 'Other' && (
              <input
                value={form.customCity}
                onChange={(e) => set('customCity', e.target.value)}
                placeholder={t('auth.customCityPlaceholder')}
                maxLength={100}
                aria-label={t('auth.customCityPlaceholder')}
                className={`${inputBase} border-[#1e3260]`}
              />
            )}
          </Field>

          <Field id="set-dob" label={t('set.dob')} optional>
            <input
              id="set-dob"
              type="date"
              value={form.dob}
              onChange={(e) => set('dob', e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className={`${inputBase} border-[#1e3260] [color-scheme:dark]`}
            />
          </Field>
        </div>
      </Section>

      <Section id="set-party" title={t('set.party')} sub={t('set.partySub')}>
        <div className="overflow-hidden rounded-2xl border border-[#1e3260]/70 bg-[#0a1130]/70">
          <div className="grid sm:grid-cols-2">
            <div className="flex flex-col gap-2 border-b border-[#1e3260]/60 px-5 py-5 sm:border-r">
              <span className="text-[13.5px] font-semibold text-[#8ea3c7]">{t('set.partyLabel')}</span>
              <span className="flex items-center gap-3 font-display text-[21px] font-bold leading-tight text-white">
                {logo
                  ? <img src={logo} alt="" className="h-10 w-10 shrink-0 rounded-full bg-white object-contain p-0.5" />
                  : <span className="h-10 w-10 shrink-0 rounded-full bg-[#1e3260]" />}
                <span className="min-w-0">{form.party ? partyLabel(form.party, lang) : '—'}</span>
              </span>
            </div>
            <div className="flex flex-col gap-2 border-b border-[#1e3260]/60 px-5 py-5">
              <span className="text-[13.5px] font-semibold text-[#8ea3c7]">{t('set.roleLabel')}</span>
              <span className="font-display text-[21px] font-bold leading-tight text-white">{roleText}</span>
            </div>
          </div>

          {editParty ? (
            <div className="flex flex-col gap-5 px-5 py-5">
              <Field id="set-party-pick" label={t('set.partyLabel')} error={errors.party}>
                <Select
                  id="set-party-pick"
                  value={form.party}
                  onChange={(v) => setForm((f) => ({ ...f, party: v, level: '', position: '' }))}
                  error={errors.party}
                >
                  <option value="">{t('profile.selectParty')}</option>
                  {POLITICAL_PARTIES.map((p) => <option key={p.name} value={p.name}>{partyLabel(p.name, lang)}</option>)}
                </Select>
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="set-level" label={t('set.level')}>
                  <Select
                    id="set-level"
                    value={form.level}
                    onChange={(v) => setForm((f) => ({ ...f, level: v, position: '' }))}
                    disabled={!form.party}
                  >
                    <option value="">{form.party ? t('profile.levelLabel') : t('profile.chooseParty')}</option>
                    {ROLE_GROUPS.map((g) => <option key={g.group} value={g.group}>{levelLabel(g.group, lang)}</option>)}
                  </Select>
                </Field>
                <Field id="set-role" label={t('set.roleLabel')} error={errors.position}>
                  <Select id="set-role" value={form.position} onChange={(v) => set('position', v)} disabled={!form.level} error={errors.position}>
                    <option value="">{form.level ? t('profile.positionLabel') : t('profile.pickLevelFirst')}</option>
                    {rolesInGroup(form.level).map((r) => <option key={r.id} value={r.id}>{roleLabel(r, form.party, lang)}</option>)}
                  </Select>
                </Field>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <p className="min-w-[240px] flex-1 text-[14.5px] leading-relaxed text-[#b9c6e2]">{t('set.partyNote')}</p>
            <button
              type="button"
              onClick={() => (editParty ? (setForm((f) => ({ ...f, party: base.party, level: base.level, position: base.position })), setEditParty(false)) : setEditParty(true))}
              className="inline-flex min-h-11 items-center rounded-xl border border-[#2a4a85] px-4 text-[15px] font-semibold text-[#9cc3ff] transition hover:border-[#3f9fff] hover:text-white"
            >
              {editParty ? t('set.keep') : `${t('set.change')} →`}
            </button>
          </div>
        </div>
      </Section>

      {/* Save bar: only while there is something to save (or it has just
          saved, or failed). A floating card the width of the form, in the
          app's own style; an always-on strip saying "Everything is saved"
          with a greyed button was noise, and its negative margins left it
          hanging short of the content's edges. */}
      {(changeCount > 0 || savedAt || saveError) && (
        <div className="sticky bottom-4 z-20 mt-6">
          <div
            className="ag-rise flex flex-wrap items-center justify-end gap-3 rounded-[20px] border px-5 py-3.5 backdrop-blur-md"
            style={{
              borderColor: saveError ? 'rgba(229,72,77,0.5)' : 'rgba(110,140,255,0.35)',
              background: 'linear-gradient(120deg, rgba(23,32,75,0.95) 0%, rgba(13,19,53,0.95) 100%)',
              boxShadow: '0 18px 44px rgba(2,6,20,0.6)',
            }}
          >
            <span className={`basis-full text-[15px] font-medium sm:mr-auto sm:basis-auto ${saveError ? 'text-[#ff8a8a]' : savedAt ? 'text-[#4ade80]' : 'text-[#dbe4fb]'}`} aria-live="polite">
              {saveError || (savedAt
                ? <span className="inline-flex items-center gap-1.5"><Check size={17} strokeWidth={2.6} />{t('set.saved')}</span>
                : changeCount === 1 ? t('set.unsavedOne') : t('set.unsaved', { n: changeCount }))}
            </span>
            {changeCount > 0 && (
              <>
                <button
                  type="button"
                  onClick={discard}
                  disabled={saving}
                  className="h-11 flex-1 rounded-[14px] border border-white/12 px-4 text-[15px] font-semibold text-[#cfd8f0] transition hover:border-white/30 hover:text-white disabled:opacity-50 sm:flex-none"
                >
                  {t('set.discard')}
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="inline-flex h-11 flex-[1.4] items-center justify-center gap-2 rounded-[14px] px-6 text-[15px] font-bold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70 sm:flex-none"
                  style={{ background: 'linear-gradient(120deg, #1a5fff 0%, #3f7bff 50%, #5b7cff 100%)', boxShadow: '0 10px 26px rgba(60,90,255,0.4)' }}
                >
                  {saving ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} strokeWidth={2.6} />}
                  {saving ? t('set.saving') : t('set.save')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Language tab ─────────────────────────────────────────────────────────────

function LanguageTab() {
  const { t, lang, changeLanguage } = useI18n();
  const options = [
    { id: 'hi', name: 'हिंदी', desc: t('set.hindiDesc'), sample: 'अ' },
    { id: 'en', name: 'English', desc: t('set.englishDesc'), sample: 'A' },
  ];
  return (
    <Section id="set-lang" title={t('set.tab.language')} sub={t('set.langSub')} first>
      <div role="radiogroup" aria-label={t('set.tab.language')} className="grid gap-4 sm:grid-cols-2">
        {options.map((o) => {
          const on = lang === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => changeLanguage(o.id)}
              className={`group flex items-center gap-4 rounded-2xl border p-5 text-left transition duration-200 hover:-translate-y-0.5 ${
                on ? 'border-[#3f9fff] bg-[#3f9fff]/10 shadow-[0_0_0_1px_rgba(63,159,255,0.35),0_18px_40px_-20px_rgba(63,159,255,0.6)]' : 'border-[#1e3260]/70 bg-[#0a1130]/60 hover:border-[#2f4a7a]'
              }`}
            >
              <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-[26px] font-bold ${on ? 'btn-gradient text-white' : 'bg-[#13204a] text-[#9cc3ff]'}`} lang={o.id}>
                {o.sample}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[19px] font-bold text-white" lang={o.id}>{o.name}</span>
                <span className="mt-0.5 block text-[14.5px] text-[#8ea3c7]" lang={o.id}>{o.desc}</span>
              </span>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-[#3f9fff] bg-[#3f9fff]' : 'border-[#3a4766]'}`} aria-hidden="true">
                {on && <Check size={14} strokeWidth={3} className="text-white" />}
              </span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Settings() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab');
  // Held in state rather than read from the URL on every render: the accounts
  // panel clears the address bar's query after Reddit's round trip, and that
  // must not throw the reader back to the first tab.
  const [tab, setTab] = useState(TABS.some((x) => x.id === asked) ? asked : 'profile');
  // A link inside the page (e.g. "choose your role" under Your voice) changes
  // ?tab= while this screen stays mounted; follow it.
  const [seenAsked, setSeenAsked] = useState(asked);
  if (asked !== seenAsked) {
    setSeenAsked(asked);
    if (asked && TABS.some((x) => x.id === asked)) setTab(asked);
  }

  function choose(id) {
    setTab(id);
    setParams((p) => { const n = new URLSearchParams(p); n.set('tab', id); return n; }, { replace: true });
  }

  function onTabKey(e) {
    const i = TABS.findIndex((x) => x.id === tab);
    if (e.key === 'ArrowRight') choose(TABS[(i + 1) % TABS.length].id);
    if (e.key === 'ArrowLeft') choose(TABS[(i - 1 + TABS.length) % TABS.length].id);
  }

  return (
    <div className="relative px-4 sm:px-6 md:px-10">
      {/* Phones and tablets only: it carries the drawer button. On a desktop
          the rail is on screen and the page's own heading names it. */}
      <div className="lg:hidden">
        <Topbar title={t('set.title')} icon={<SettingsIcon size={17} strokeWidth={2} />} />
      </div>

      <main className="relative z-10 mx-auto flex max-w-[1100px] flex-col gap-8 pb-0 lg:pt-10">
        <header className="flex flex-wrap items-end justify-between gap-5 border-b border-[#1e3260]/60 pb-6">
          <div className="flex flex-col gap-2">
            <h1 className="hidden font-display text-[48px] font-bold leading-[1.05] text-white lg:block">{t('set.title')}</h1>
            <p className="text-[16px] text-[#8ea3c7]">{t('set.sub')}</p>
          </div>
          <div
            role="tablist"
            aria-label={t('set.tabs')}
            onKeyDown={onTabKey}
            className="grid w-full grid-cols-3 gap-1 rounded-2xl border border-[#1e3260]/70 bg-[#0a1130]/70 p-1.5 sm:flex sm:w-auto"
          >
            {/* eslint-disable-next-line no-unused-vars -- used as a JSX tag */}
            {TABS.map(({ id, Icon }) => {
              const on = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`set-tab-${id}`}
                  aria-selected={on}
                  aria-controls={`set-panel-${id}`}
                  tabIndex={on ? 0 : -1}
                  onClick={() => choose(id)}
                  className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-2 text-[15px] font-semibold transition duration-200 sm:px-4 ${
                    on ? 'btn-gradient text-white shadow-[0_8px_22px_rgba(37,99,235,0.35)]' : 'text-[#9fb0d4] hover:bg-[#13204a]/70 hover:text-white'
                  }`}
                >
                  <Icon size={16} strokeWidth={2.1} className="hidden sm:block" />
                  {t(`set.tab.${id}`)}
                </button>
              );
            })}
          </div>
        </header>

        <div
          key={tab}
          role="tabpanel"
          id={`set-panel-${tab}`}
          aria-labelledby={`set-tab-${tab}`}
          className="set-panel-in pb-10"
        >
          {tab === 'profile' && <ProfileTab />}
          {tab === 'voice' && (
            <Section id="set-voice" title={t('set.tab.voice')} sub={t('set.voiceSub')} first>
              <Preferences embedded />
            </Section>
          )}
          {tab === 'language' && <LanguageTab />}
        </div>
      </main>

      <style>{`
        .set-panel-in { animation: set-in .32s cubic-bezier(.2,.8,.2,1) both; }
        @keyframes set-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .set-panel-in { animation: none; } }
      `}</style>
    </div>
  );
}
