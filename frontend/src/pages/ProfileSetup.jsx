import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, AtSign, Mail, ArrowRight, ArrowLeft, ChevronDown, AlertTriangle } from 'lucide-react';
import { isValidPhoneNumber } from 'react-phone-number-input';
import { useAuth } from '../context/AuthContext';
import { clearPendingQuestions } from '../hooks/usePendingQuestions';
import { partyHasQuestions } from '../utils/partyQuestions';
import { useCurtain } from '../context/CurtainContext';
import { POLITICAL_PARTIES } from '../utils/politicalParties';
import { ROLE_GROUPS, roleLabel, groupForId, rolesInGroup } from '../utils/partyRoles';
import { INDIAN_STATES, CITIES_BY_STATE } from '../utils/indianStatesCities';
import PhoneField  from '../components/PhoneField';
import DashboardShell from '../layouts/DashboardShell';
import DrawerButton from '../components/dashboard/DrawerButton';
import AgMark      from '../components/brand/AgMark';
import ambedkarSrc from '../assets/images/qna-ambedkar.webp';
import { useI18n } from '../i18n/index.jsx';
import { partyLabel, levelLabel } from '../utils/displayLabel';

function FieldInput({ icon: Icon, label, placeholder, value, onChange, error, hint, maxLength }) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="block text-[13px] font-medium" style={{ color: '#c5cde8' }}>
        {label}
      </label>
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-200"
        style={{
          backgroundColor: '#0a1128',
          border: `1px solid ${error ? '#ef4444' : focused ? '#4a6fa5' : '#1e3260'}`,
          boxShadow: focused ? '0 0 0 3px rgba(63,159,255,0.08)' : 'none',
        }}
      >
        <Icon size={16} style={{ color: focused ? '#3f9fff' : '#4a5e8a', flexShrink: 0 }} strokeWidth={1.8} />
        <input
          type="text"
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          maxLength={maxLength}
          className="flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-[#4a5e8a]"
        />
        {maxLength && (
          <span className="text-[11px] shrink-0" style={{ color: '#3a4e72' }}>
            {value.length}/{maxLength}
          </span>
        )}
      </div>
      {error && <p className="text-[12px]" style={{ color: '#ef4444' }}>{error}</p>}
      {hint && !error && <p className="text-[12px]" style={{ color: '#5a6e9a' }}>{hint}</p>}
    </div>
  );
}

export default function ProfileSetup() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { go: curtainGo } = useCurtain();
  const { currentUser, updateProfile } = useAuth();

  const [fullName, setFullName]   = useState(currentUser?.full_name || '');
  // Onboarding sends the user on to the questionnaire; someone editing an
  // existing profile from the sidebar should land back on the dashboard
  // instead of being pushed through onboarding again.
  // Onboarding until the account has what a post is written from: a party,
  // and a position where the party's questions depend on one. A Google sign-up
  // arrives with a name and nothing else, and used to be shown the edit form -
  // with a way back to a dashboard it could not use.
  const profileMissing = !currentUser?.political_party
    || (partyHasQuestions(currentUser?.political_party) && !currentUser?.party_position);
  const isOnboarding = !currentUser?.full_name || profileMissing;
  const nextRoute = isOnboarding ? '/questionnaire' : '/dashboard';
  const [username, setUsername]   = useState(currentUser?.username || '');
  // Whichever of the two a signup didn't collect — phone signup has no email
  // on file and vice versa. Filled in here, both stay optional: nothing
  // forces someone to add the identifier they deliberately skipped.
  const needsEmail = !currentUser?.email;
  const needsPhone = !currentUser?.phone;
  const [fillEmail, setFillEmail] = useState('');
  const [fillPhone, setFillPhone] = useState('');
  // Where they are. Accounts created before signup asked for these have them
  // empty, which is the whole reason they are editable here.
  const [state, setState] = useState(currentUser?.state || '');
  // A saved city that is not in its state's list came from the "Other" box,
  // so it has to resolve back to Other with the text restored. Selecting the
  // city itself would silently drop what they typed.
  const savedCity = currentUser?.city || '';
  const savedCityKnown =
    !!savedCity && (CITIES_BY_STATE[currentUser?.state] || []).includes(savedCity);
  const [city, setCity] = useState(savedCity ? (savedCityKnown ? savedCity : 'Other') : '');
  const [customCity, setCustomCity] = useState(savedCity && !savedCityKnown ? savedCity : '');
  const [dob, setDob] = useState(currentUser?.date_of_birth || '');
  const [politicalParty, setPoliticalParty] = useState(currentUser?.political_party || '');
  const [partyPosition, setPartyPosition] = useState(currentUser?.party_position || '');

  function handleStateChange(newState) {
    setState(newState);
    setCity('');
    setCustomCity('');
    setErrors((p) => ({ ...p, city: '' }));
  }
  // Derived from the saved position so reopening the form lands on the level
  // already chosen, rather than asking someone to find it again.
  const [partyLevel, setPartyLevel] = useState(() => groupForId(currentUser?.party_position || ''));

  // The party is set once and then fixed: every answer is stored against an
  // id that names it, so changing it orphans all of them. The server refuses
  // it; this disables the control so nobody fills in a form that is going to
  // be rejected. The position stays editable: a new level brings its own five
  // questions.
  const partyLocked = Boolean(currentUser?.political_party);

  function handleLevelChange(level) {
    setPartyLevel(level);
    // The old position belongs to the old level, so keeping it would leave the
    // two selects disagreeing about what was chosen.
    setPartyPosition('');
  }
  const [errors, setErrors]       = useState({});
  const [loading, setLoading]     = useState(false);
  const [authError, setAuthError] = useState('');

  function validate() {
    const e = {};
    if (!fullName.trim())          e.fullName = 'Please enter your name.';
    else if (fullName.trim().length < 2) e.fullName = 'Name must be at least 2 characters.';
    if (!username.trim())          e.username = 'Username is required.';
    else if (username.trim().length < 3) e.username = 'Username must be at least 3 characters.';
    else if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) e.username = t('profile.usernameRule');
    if (!politicalParty) e.politicalParty = 'Please select a political party.';
    else if (partyHasQuestions(politicalParty) && !partyPosition) e.partyPosition = t('profile.positionRequired');
    if (needsEmail && fillEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fillEmail.trim()))
      e.fillEmail = 'Please enter a valid email address.';
    if (needsPhone && fillPhone && !isValidPhoneNumber(fillPhone))
      e.fillPhone = 'Please enter a valid phone number.';
    // Optional here, unlike signup: an account that predates these fields
    // should not be blocked from changing its username until it fills them.
    // Half-answers are the exception, since they store nothing useful.
    if (city && !state) e.city = t('auth.stateRequired');
    if (city === 'Other' && !customCity.trim()) e.city = t('auth.cityRequired');
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setAuthError('');
    setLoading(true);
    try {
      await updateProfile({
        full_name: fullName.trim(),
        username: username.trim(),
        political_party: politicalParty || undefined,
        // Sent even when blank, because clearing the position is a real choice
        // and undefined would leave the previous one in place.
        party_position: partyPosition,
        ...(needsEmail && fillEmail.trim() ? { email: fillEmail.trim() } : {}),
        ...(needsPhone && fillPhone ? { phone: fillPhone } : {}),
        ...(state ? { state } : {}),
        ...(city ? { city: city === 'Other' ? customCity.trim() : city } : {}),
        ...(dob ? { date_of_birth: dob } : {}),
      });
      // What is outstanding just changed; the next route must not act on the
      // answer from before the party was chosen.
      clearPendingQuestions();
      curtainGo(nextRoute, { replace: true });
    } catch (err) {
      const detail = (err?.response?.data?.detail || err?.message || '').toLowerCase();
      if (detail.includes('username') && detail.includes('taken')) {
        setErrors({ username: 'This username is already taken. Try another.' });
      } else if (detail.includes('email') && detail.includes('exists')) {
        setErrors({ fillEmail: 'This email is already in use.' });
      } else if (detail.includes('phone') && detail.includes('exists')) {
        setErrors({ fillPhone: 'This phone number is already in use.' });
      } else {
        setAuthError('Could not save your profile. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  function handleSkip() {
    curtainGo(nextRoute, { replace: true });
  }

  const page = (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: 'linear-gradient(160deg,#0d1535 0%,#080e22 100%)' }}
    >
      {/* Ambient glows */}
      <div className="pointer-events-none fixed -left-48 -top-48 h-[500px] w-[500px] rounded-full bg-[#1e4fb5]/15 blur-[130px]" />
      <div className="pointer-events-none fixed bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-[#3f9fff]/10 blur-[120px]" />
      <div className="pointer-events-none fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-[#7b5cff]/5 blur-[140px]" />

      {/* Top nav */}
      {/* The only way out used to be a Cancel link under the form, below the
          fold on a laptop, so the page read as a dead end. Editing offers a way
          back at the top; onboarding does not, because a new account has no
          dashboard to return to and an exit there would strand the sign-up. */}
      <header className="relative z-10 flex items-center gap-4 px-8 pt-7 md:px-14">
        {isOnboarding ? (
          <>
            <div className="flex items-center gap-2.5">
              <AgMark size={28} color="#8FA8FF" />
              <span className="font-display text-[20px] font-bold leading-none tracking-tight">
                <span className="text-white">{t('brand.ambedkar')}</span>
                <span className="gradient-text-cyan">GPT</span>
              </span>
            </div>
            {/* Onboarding gets a skip rather than a back: there is nothing
                behind this screen, signup is already done. It sits up here
                because the only other exit is under the form, and the level
                and position selects pushed that below the fold. */}
            {!profileMissing && (
              <button
                type="button"
                onClick={handleSkip}
                className="ml-auto inline-flex h-10 items-center gap-2 rounded-full border border-[#1e3260]/70 px-4 text-[13px] font-medium text-[#8b9dc4] transition hover:border-[#3a6bc4]/70 hover:text-white"
              >
                {t('profile.skip')}
                <ArrowRight size={15} strokeWidth={2} />
              </button>
            )}
          </>
        ) : (
          <>
            {/* The brand that used to sit here is in the sidebar now. On a
                phone the sidebar is a drawer, and this page is reached from
                it, so the way back into it belongs here. */}
            <DrawerButton />
            <button
              type="button"
              onClick={handleSkip}
              aria-label={t('profile.backToDash')}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-[#1e3260]/70 px-4 text-[13px] font-medium text-[#8b9dc4] transition hover:border-[#3a6bc4]/70 hover:text-white"
            >
              <ArrowLeft size={15} strokeWidth={2} />
              <span className="hidden sm:inline">{t('common.back')}</span>
            </button>
          </>
        )}
      </header>

      {/* Main
          One column: the portrait sits over the form rather than beside it, so
          the fields get the width the picture used to take. */}
      <main className="relative z-10 flex flex-1 flex-col items-center px-4 pb-12 pt-4 sm:px-6">
        <div className="flex w-full min-w-0 max-w-[820px] flex-col items-center">

          {/* Portrait */}
          <div className="relative mb-7 flex items-center justify-center">
            <div
              className="absolute h-[260px] w-[260px] rounded-full blur-[80px] sm:h-[340px] sm:w-[340px]"
              style={{ background: 'radial-gradient(circle, rgba(63,159,255,0.22) 0%, rgba(123,92,255,0.10) 55%, transparent 75%)' }}
            />
            <img
              src={ambedkarSrc}
              alt="Dr. B.R. Ambedkar"
              className="relative z-10 w-[190px] object-contain drop-shadow-[0_20px_56px_rgba(0,0,0,0.6)] sm:w-[240px]"
            />
          </div>

          {/* Form */}
          <div className="flex w-full flex-col items-center">

        {/* Card */}
        <div
          className="w-full min-w-0 max-w-[820px] rounded-2xl p-5 sm:p-8 md:p-10"
          style={{
            background: 'rgba(10,17,40,0.7)',
            border: '1px solid rgba(30,50,96,0.6)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
          }}
        >
          {/* Step badge */}
          <div className="mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1" style={{ background: 'rgba(63,159,255,0.1)', border: '1px solid rgba(63,159,255,0.2)' }}>
            <span className="h-1.5 w-1.5 rounded-full bg-[#3f9fff]" />
            <span className="text-[11px] font-medium tracking-wide" style={{ color: '#6baaff' }}>{isOnboarding ? t('profile.setupCaps') : t('profile.yourProfile')}</span>
          </div>

          <h1 className="font-display text-[28px] font-bold leading-tight text-white md:text-[32px]">
            {isOnboarding ? t('profile.tellName') : t('profile.editProfile')}
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: '#7a8db5' }}>
            {isOnboarding ? t('profile.onboardHint') : t('profile.editHint')}
          </p>

          {authError && (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {authError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            {/* Name and handle share a row on the wider card: they are the
                two halves of who you are here, and one per line left most of
                the field empty. Stacked below sm. */}
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <FieldInput
                icon={User}
                label={t('profile.fullNameLabel')}
                placeholder="e.g. Rajesh Kumar"
                value={fullName}
                onChange={(e) => { setFullName(e.target.value); setErrors((p) => ({ ...p, fullName: '' })); }}
                error={errors.fullName}
                maxLength={100}
              />
              <FieldInput
                icon={AtSign}
                label={t('profile.usernameLabel')}
                placeholder="your_handle"
                value={username}
                onChange={(e) => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')); setErrors((p) => ({ ...p, username: '' })); }}
                error={errors.username}
                hint={t('profile.usernameHint')}
                maxLength={50}
              />
            </div>

            {/* Whichever contact method the signup path didn't collect.
                Optional — filling it in is a convenience, not a gate. */}
            {needsEmail && (
              <FieldInput
                icon={Mail}
                label={t('auth.email')}
                placeholder="you@example.com"
                value={fillEmail}
                onChange={(e) => { setFillEmail(e.target.value); setErrors((p) => ({ ...p, fillEmail: '' })); }}
                error={errors.fillEmail}
                hint={t('profile.addEmailHint')}
              />
            )}
            {needsPhone && (
              <PhoneField
                value={fillPhone}
                onChange={(v) => { setFillPhone(v ?? ''); setErrors((p) => ({ ...p, fillPhone: '' })); }}
                error={errors.fillPhone}
                hint={t('profile.addPhoneHint')}
                optional
              />
            )}

            {/* State, city and date of birth. Signup collects these now, so
                these are here for the accounts that predate it. Optional, so
                an old account can still change its name without being made
                to complete a form it never agreed to. */}
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-white">
                {t('auth.stateLabel')} / {t('auth.cityLabel')}
                <span className="ml-1.5 font-normal" style={{ color: '#5a6e9a' }}>{t('common.optional')}</span>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="relative">
                  <select
                    value={state}
                    onChange={(e) => handleStateChange(e.target.value)}
                    aria-label={t('auth.stateLabel')}
                    className="w-full appearance-none rounded-xl px-4 py-3.5 pr-10 text-[14px] outline-none transition"
                    style={{
                      backgroundColor: '#0a1130',
                      border: '1px solid #1e3260',
                      color: state ? '#ffffff' : '#8b94b8',
                    }}
                  >
                    <option value="" className="bg-[#0a1130]">{t('auth.selectState')}</option>
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s} className="bg-[#0a1130] text-white">{s}</option>
                    ))}
                  </select>
                  <ChevronDown
                    size={16}
                    strokeWidth={2}
                    className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2"
                    style={{ color: '#8b94b8' }}
                  />
                </div>

                <div className="relative">
                  <select
                    value={city}
                    onChange={(e) => { setCity(e.target.value); setCustomCity(''); setErrors((p) => ({ ...p, city: '' })); }}
                    disabled={!state}
                    aria-label={t('auth.cityLabel')}
                    className="w-full appearance-none rounded-xl px-4 py-3.5 pr-10 text-[14px] outline-none transition disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      backgroundColor: '#0a1130',
                      border: `1px solid ${errors.city ? '#ef4444' : '#1e3260'}`,
                      color: city ? '#ffffff' : '#8b94b8',
                    }}
                  >
                    <option value="" className="bg-[#0a1130]">
                      {state ? t('auth.selectCity') : t('auth.chooseStateFirst')}
                    </option>
                    {(CITIES_BY_STATE[state] || []).map((c) => (
                      <option key={c} value={c} className="bg-[#0a1130] text-white">
                        {c === 'Other' ? t('auth.otherCity') : c}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={16}
                    strokeWidth={2}
                    className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2"
                    style={{ color: '#8b94b8' }}
                  />
                </div>
              </div>

              {city === 'Other' && (
                <input
                  type="text"
                  value={customCity}
                  onChange={(e) => { setCustomCity(e.target.value); setErrors((p) => ({ ...p, city: '' })); }}
                  placeholder={t('auth.customCityPlaceholder')}
                  maxLength={100}
                  className="mt-3 w-full rounded-xl px-4 py-3.5 text-[14px] text-white outline-none transition placeholder:text-[#4a5e8a]"
                  style={{ backgroundColor: '#0a1130', border: '1px solid #1e3260' }}
                />
              )}
              {errors.city && <p className="mt-1.5 text-[12px]" style={{ color: '#ef4444' }}>{errors.city}</p>}
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-white">
                {t('auth.dobLabel')}
                <span className="ml-1.5 font-normal" style={{ color: '#5a6e9a' }}>{t('common.optional')}</span>
              </label>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className="input-field w-full rounded-xl px-4 py-3.5 text-[14px]"
              />
            </div>

            {/* Said before the choice, not after it. A lock the writer only
                meets as a rejected save is a trap; this is the Instagram
                pattern for a username or a date of birth. It disappears once
                both are set, because by then it is advice about nothing. */}
            {!partyLocked && (
              <div
                className="flex gap-3 rounded-xl px-4 py-3.5"
                style={{ backgroundColor: 'rgba(240,160,75,0.08)', border: '1px solid rgba(240,160,75,0.28)' }}
              >
                <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0" style={{ color: '#f0b877' }} />
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: '#f0b877' }}>
                    {t('profile.lockWarning.title')}
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: '#c0cde8' }}>
                    {t('profile.lockWarning.body')}
                  </p>
                </div>
              </div>
            )}

            {/* Party affiliation — decides which news feed the user sees */}
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-white">
                {t('profile.partySupport')}
              </label>
              <div className="relative">
                <select
                  value={politicalParty}
                  onChange={(e) => { setPoliticalParty(e.target.value); setErrors((p) => ({ ...p, politicalParty: '' })); }}
                  disabled={partyLocked}
                  className="w-full appearance-none rounded-xl px-4 py-3.5 pr-10 text-[14px] outline-none transition disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    backgroundColor: '#0a1130',
                    border: `1px solid ${errors.politicalParty ? '#ef4444' : '#1e3260'}`,
                    color: politicalParty ? '#ffffff' : '#8b94b8',
                  }}
                >
                  <option value="" className="bg-[#0a1130]">{t('profile.selectParty')}</option>
                  {POLITICAL_PARTIES.map((p) => (
                    <option key={p.name} value={p.name} className="bg-[#0a1130] text-white">
                      {partyLabel(p.name, lang)}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  strokeWidth={2}
                  className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2"
                  style={{ color: '#8b94b8' }}
                />
              </div>
              {partyLocked && (
                <p className="mt-1.5 text-[12px]" style={{ color: '#8b94b8' }}>{t('profile.partyLocked')}</p>
              )}
              {errors.politicalParty
                ? <p className="mt-1.5 text-[12px]" style={{ color: '#ef4444' }}>{errors.politicalParty}</p>
                : <p className="mt-1.5 text-[12px]" style={{ color: '#5a6e9a' }}>{t('profile.feedTailored')}</p>}
            </div>

            {/* Position in the party, asked in two steps. One list of 41 titles
                was accurate and unreadable: someone new does not know whether a
                Zila Mahamantri is above or below a Mandal Adhyaksh, but they do
                know which level they work at. Titles differ between parties for
                the same post, so the options are relabelled from the party
                above. Optional throughout: a supporter with no office is a
                legitimate answer. */}
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-white">
                {t('profile.positionInParty')}
                <span className="ml-1.5 font-normal" style={{ color: '#5a6e9a' }}>{t('common.optional')}</span>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="relative">
                  <select
                    value={partyLevel}
                    onChange={(e) => handleLevelChange(e.target.value)}
                    disabled={!politicalParty}
                    aria-label={t('profile.levelLabel')}
                    className="w-full appearance-none rounded-xl px-4 py-3.5 pr-10 text-[14px] outline-none transition disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      backgroundColor: '#0a1130',
                      border: '1px solid #1e3260',
                      color: partyLevel ? '#ffffff' : '#8b94b8',
                    }}
                  >
                    <option value="" className="bg-[#0a1130]">
                      {politicalParty ? t('profile.levelLabel') : t('profile.chooseParty')}
                    </option>
                    {ROLE_GROUPS.map((g) => (
                      <option key={g.group} value={g.group} className="bg-[#0a1130] text-white">
                        {levelLabel(g.group, lang)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={16}
                    strokeWidth={2}
                    className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2"
                    style={{ color: '#8b94b8' }}
                  />
                </div>

                <div className="relative">
                  <select
                    value={partyPosition}
                    onChange={(e) => setPartyPosition(e.target.value)}
                    disabled={!partyLevel}
                    aria-label={t('profile.positionLabel')}
                    className="w-full appearance-none rounded-xl px-4 py-3.5 pr-10 text-[14px] outline-none transition disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      backgroundColor: '#0a1130',
                      border: '1px solid #1e3260',
                      color: partyPosition ? '#ffffff' : '#8b94b8',
                    }}
                  >
                    <option value="" className="bg-[#0a1130]">
                      {partyLevel ? t('profile.positionLabel') : t('profile.pickLevelFirst')}
                    </option>
                    {rolesInGroup(partyLevel).map((r) => (
                      <option key={r.id} value={r.id} className="bg-[#0a1130] text-white">
                        {roleLabel(r, politicalParty, lang)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={16}
                    strokeWidth={2}
                    className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2"
                    style={{ color: '#8b94b8' }}
                  />
                </div>
              </div>

              {errors.partyPosition
                ? <p className="mt-1.5 text-[12px]" style={{ color: '#ef4444' }}>{errors.partyPosition}</p>
                : (
                  <p className="mt-1.5 text-[12px]" style={{ color: '#5a6e9a' }}>
                    {t('profile.positionHint')}
                  </p>
                )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 text-[14px] font-semibold text-white transition-all duration-200 hover:brightness-110 disabled:pointer-events-none disabled:opacity-50"
              style={{
                background: 'linear-gradient(90deg, #0a7dff, #3a9fff)',
                boxShadow: '0 4px 20px rgba(17,122,255,0.35)',
              }}
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  {t('common.saving')}
                </>
              ) : (
                <>
                  {isOnboarding ? t('common.next') : t('profile.saveChanges')}
                  <ArrowRight size={15} strokeWidth={2.2} />
                </>
              )}
            </button>
          </form>

          {!profileMissing && (
            <button
              type="button"
              onClick={handleSkip}
              className="mt-4 w-full py-2 text-center text-[13px] transition-opacity hover:opacity-100"
              style={{ color: '#4a5e8a', opacity: 0.7 }}
            >
              {isOnboarding ? t('profile.skip') : t('common.cancel')}
            </button>
          )}
        </div>

        {/* Step indicators */}
        <div className="mt-6 flex items-center gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === 0 ? 20 : 6,
                height: 6,
                background: i === 0 ? '#3f9fff' : 'rgba(63,159,255,0.2)',
              }}
            />
          ))}
        </div>
        <p className="mt-2 text-[11px]" style={{ color: '#3a4e72' }}>{t('profile.stepOf')}</p>

          </div>
        </div>
      </main>
    </div>
  );

  // Editing, reached from the sidebar, keeps the sidebar. Onboarding does not:
  // a new account has nowhere to navigate to yet, and an exit there would
  // strand the sign-up half done.
  return isOnboarding ? page : <DashboardShell active="profile">{page}</DashboardShell>;
}
