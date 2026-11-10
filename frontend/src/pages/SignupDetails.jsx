import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { isValidPhoneNumber } from 'react-phone-number-input';
import { useAuth } from '../context/AuthContext';
import { useCurtain } from '../context/CurtainContext';
import { clearPendingQuestions } from '../hooks/usePendingQuestions';
import { skipOnboarding } from '../utils/onboardingSkip';
import AuthLayout    from '../components/AuthLayout';
import AnimatedInput from '../components/AnimatedInput';
import PhoneField    from '../components/PhoneField';
import PrimaryButton from '../components/PrimaryButton';

import { POLITICAL_PARTIES } from '../utils/politicalParties';
import { ROLE_GROUPS, roleLabel, rolesInGroup } from '../utils/partyRoles';
import { INDIAN_STATES, CITIES_BY_STATE } from '../utils/indianStatesCities';
import { useI18n } from '../i18n/index.jsx';
import { partyLabel, levelLabel } from '../utils/displayLabel';
import { partyHasQuestions } from '../utils/partyQuestions';
import { HOME_ROUTE } from '../data/features';

/**
 * The rest of sign-up, asked once the email or phone is verified.
 *
 * Step 1 is who you are: your name, whichever contact the sign-up did not
 * collect (an email for a phone sign-up, a phone for an email or Google one),
 * state and city. Step 2 is party and role, which are fixed once saved.
 *
 * ?quick=1 is a new account made by pressing Google on the login page. That
 * person came to log in, so they are asked only for a name and a phone and
 * then let in; the party is asked for where it is needed, by the post
 * generator's gate.
 *
 * All of it is saved in one PATCH /me at the end, so leaving halfway stores
 * nothing half-answered.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupDetails() {
  const { t, lang } = useI18n();
  const [params] = useSearchParams();
  const quick = params.get('quick') === '1';
  const { go: curtainGo } = useCurtain();
  const { currentUser, updateProfile } = useAuth();

  // Whichever contact the account does not have yet is the one asked for.
  const askEmail = !quick && !currentUser?.email;
  const askPhone = !currentUser?.phone;
  const totalSteps = quick ? 1 : 2;

  const [step, setStep]                     = useState(1);
  const [fullName, setFullName]             = useState(currentUser?.full_name || '');
  const [email, setEmail]                   = useState('');
  const [phone, setPhone]                   = useState('');
  const [state, setState]                   = useState('');
  const [city, setCity]                     = useState('');
  const [customCity, setCustomCity]         = useState('');
  const [politicalParty, setPoliticalParty] = useState('');
  const [partyLevel, setPartyLevel]         = useState('');
  const [partyPosition, setPartyPosition]   = useState('');
  const [understood, setUnderstood]         = useState(false);
  const [partyOpen, setPartyOpen]           = useState(false);
  const partyRef                            = useRef(null);
  const [errors, setErrors]                 = useState({});
  const [authError, setAuthError]           = useState('');
  const [loading, setLoading]               = useState(false);

  useEffect(() => {
    function handleClickOutside(e) {
      if (partyRef.current && !partyRef.current.contains(e.target)) setPartyOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function clearError(key) {
    setErrors((p) => ({ ...p, [key]: '' }));
  }

  function handleStateChange(newState) {
    setState(newState);
    setCity('');
    setCustomCity('');
    setErrors((p) => ({ ...p, state: '', city: '' }));
  }

  function validateStep(n) {
    const e = {};
    if (n === 1) {
      if (!fullName.trim())                e.fullName = t('details.nameRequired');
      else if (fullName.trim().length < 2) e.fullName = t('details.nameShort');
      if (askEmail) {
        if (!email.trim())                    e.email = t('auth.emailRequired');
        else if (!EMAIL_RE.test(email.trim())) e.email = 'Please enter a valid email address.';
      }
      if (askPhone) {
        if (!phone)                          e.phone = t('details.phoneRequired');
        else if (!isValidPhoneNumber(phone)) e.phone = 'Please enter a valid phone number.';
      }
      if (!quick) {
        if (!state) e.state = t('auth.stateRequired');
        if (!city)  e.city = t('auth.cityRequired');
        else if (city === 'Other' && !customCity.trim()) e.city = t('auth.cityRequired');
      }
    }
    if (n === 2) {
      if (!politicalParty) e.politicalParty = t('auth.pickPartyFirst');
      else if (partyHasQuestions(politicalParty) && !partyPosition) e.partyPosition = t('profile.positionRequired');
      if (!understood) e.understood = t('signup.confirmRequired');
    }
    return e;
  }

  function goBack() {
    setErrors({});
    setStep(1);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validateStep(step);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setAuthError('');
    if (step < totalSteps) { setStep(step + 1); return; }

    setLoading(true);
    try {
      await updateProfile({
        full_name: fullName.trim(),
        ...(askEmail ? { email: email.trim() } : {}),
        ...(askPhone ? { phone } : {}),
        ...(quick ? {} : {
          state,
          city: city === 'Other' ? customCity.trim() : city,
          political_party: politicalParty,
          party_position: partyPosition,
        }),
      });
      if (quick) {
        const redirect = sessionStorage.getItem('auth_redirect') || '/generate/social-media';
        sessionStorage.removeItem('auth_redirect');
        curtainGo(redirect, { replace: true });
      } else {
        // Straight to the news. The preference questions are no longer asked:
        // each one takes the default for this party and role on the server.
        clearPendingQuestions();
        curtainGo(HOME_ROUTE, { replace: true });
      }
    } catch (err) {
      const detail = (err?.response?.data?.detail || err?.message || '').toLowerCase();
      // Both contacts are on step 1, so a clash sends the reader back there.
      if (detail.includes('email') && detail.includes('exists')) {
        setStep(1);
        setErrors({ email: t('details.emailTaken') });
      } else if (detail.includes('phone') && detail.includes('exists')) {
        setStep(1);
        setErrors({ phone: t('details.phoneTaken') });
      } else {
        setAuthError(t('details.saveFailed'));
      }
    } finally {
      setLoading(false);
    }
  }

  const selectStyle = (value, hasError) => ({
    backgroundColor: '#0d1b3e',
    border: `1px solid ${hasError ? '#ef4444' : '#1e3260'}`,
    color: value ? '#ffffff' : '#8b94b8',
  });
  const selectedParty = POLITICAL_PARTIES.find((p) => p.name === politicalParty);

  return (
    <AuthLayout brandSide="left" brandVariant="signup">
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-[36px] font-bold leading-tight tracking-tight text-white md:text-[42px]">
            {t('details.title')}
          </h1>
          <p className="mt-3 text-[14px]" style={{ color: '#8b94b8' }}>
            {t(quick ? 'details.subQuick' : 'details.sub')}
          </p>
        </div>

        {totalSteps > 1 && (
          <div>
            <p className="text-[12px] font-medium" style={{ color: '#8b94b8' }}>
              {t('details.step', { n: step })}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2" aria-hidden="true">
              {[1, 2].map((n) => (
                <div key={n} className="h-1 rounded-full" style={{ backgroundColor: n <= step ? '#3a7bff' : '#1e3260' }} />
              ))}
            </div>
            <ol className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
              {['details.s1', 'signup.s3'].map((key, i) => (
                <li
                  key={key}
                  aria-current={i + 1 === step ? 'step' : undefined}
                  className="flex items-center gap-1"
                  style={{ color: i + 1 === step ? '#ffffff' : i + 1 < step ? '#6b8aff' : '#5a6e9a', fontWeight: i + 1 === step ? 600 : 400 }}
                >
                  {i + 1 < step && <Check size={12} strokeWidth={3} />}
                  {t(key)}
                </li>
              ))}
            </ol>
          </div>
        )}

        {authError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {authError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {step === 1 && (
            <>
              <AnimatedInput
                placeholders={['e.g. Rajesh Kumar']}
                value={fullName}
                onChange={(e) => { setFullName(e.target.value); clearError('fullName'); }}
                label={t('profile.fullNameLabel')}
                error={errors.fullName}
              />

              {askEmail && (
                <AnimatedInput
                  placeholders={[t('auth.enterEmail')]}
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); clearError('email'); }}
                  label={t('auth.email')}
                  error={errors.email}
                />
              )}

              {askPhone && (
                <PhoneField
                  value={phone}
                  onChange={(v) => { setPhone(v ?? ''); clearError('phone'); }}
                  error={errors.phone}
                />
              )}

              {!quick && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium" style={{ color: '#e5e7eb' }}>
                        {t('auth.stateLabel')}
                      </label>
                      <select
                        value={state}
                        onChange={(e) => handleStateChange(e.target.value)}
                        className={`input-field w-full px-4 py-3 rounded-xl text-sm${errors.state ? ' error' : ''}`}
                      >
                        <option value="">{t('auth.selectState')}</option>
                        {INDIAN_STATES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      {errors.state && <p className="text-xs" style={{ color: '#ef4444' }}>{errors.state}</p>}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium" style={{ color: '#e5e7eb' }}>
                        {t('auth.cityLabel')}
                      </label>
                      <select
                        value={city}
                        onChange={(e) => { setCity(e.target.value); setCustomCity(''); clearError('city'); }}
                        disabled={!state}
                        className={`input-field w-full px-4 py-3 rounded-xl text-sm disabled:cursor-not-allowed disabled:opacity-50${errors.city ? ' error' : ''}`}
                      >
                        <option value="">{state ? t('auth.selectCity') : t('auth.chooseStateFirst')}</option>
                        {(CITIES_BY_STATE[state] || []).map((c) => (
                          <option key={c} value={c}>{c === 'Other' ? t('auth.otherCity') : c}</option>
                        ))}
                      </select>
                      {errors.city && <p className="text-xs" style={{ color: '#ef4444' }}>{errors.city}</p>}
                    </div>
                  </div>

                  {city === 'Other' && (
                    <input
                      type="text"
                      value={customCity}
                      onChange={(e) => { setCustomCity(e.target.value); clearError('city'); }}
                      placeholder={t('auth.customCityPlaceholder')}
                      maxLength={100}
                      className="input-field w-full px-4 py-3 rounded-xl text-sm"
                    />
                  )}
                </>
              )}
            </>
          )}

          {step === 2 && (
            <>

              <div ref={partyRef} className="relative">
                <label className="block mb-1.5 text-sm font-medium" style={{ color: '#c5cde8' }}>
                  {t('auth.party')} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setPartyOpen((o) => !o)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-all duration-200"
                  style={{
                    backgroundColor: '#0d1b3e',
                    border: `1px solid ${errors.politicalParty ? '#ef4444' : partyOpen ? '#4a6fa5' : '#1e3260'}`,
                    color: politicalParty ? '#ffffff' : '#8b94b8',
                  }}
                >
                  {politicalParty ? (
                    <span className="flex items-center gap-2.5">
                      {selectedParty?.logo && (
                        <img
                          src={selectedParty.logo}
                          alt=""
                          className="w-5 h-5 object-contain rounded-sm"
                          style={{ background: 'white', padding: '1px' }}
                          onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                        />
                      )}
                      {partyLabel(politicalParty, lang)}
                    </span>
                  ) : (
                    <span>{t('auth.selectParty')}</span>
                  )}
                  <svg
                    className="w-4 h-4 shrink-0 transition-transform duration-200"
                    style={{ transform: partyOpen ? 'rotate(180deg)' : 'rotate(0deg)', color: '#8b94b8' }}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {partyOpen && (
                  <div
                    className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden shadow-2xl"
                    style={{ backgroundColor: '#0d1b3e', border: '1px solid #1e3260', maxHeight: '240px', overflowY: 'auto' }}
                  >
                    {POLITICAL_PARTIES.map((party) => (
                      <button
                        key={party.name}
                        type="button"
                        onClick={() => { setPoliticalParty(party.name); setPartyOpen(false); setPartyLevel(''); setPartyPosition(''); clearError('politicalParty'); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-150 hover:bg-[#131f45]"
                        style={{
                          color: politicalParty === party.name ? '#ffffff' : '#c5cde8',
                          backgroundColor: politicalParty === party.name ? '#1a2a5e' : undefined,
                        }}
                      >
                        {party.logo ? (
                          <img
                            src={party.logo}
                            alt={party.name}
                            className="w-6 h-6 object-contain rounded-sm shrink-0"
                            style={{ background: 'white', padding: '1px' }}
                            onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                          />
                        ) : (
                          <span className="w-6 h-6 rounded-sm shrink-0 flex items-center justify-center text-xs" style={{ background: '#1e3260' }}>—</span>
                        )}
                        {partyLabel(party.name, lang)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {errors.politicalParty && (
                <p className="text-xs mt-0.5 px-1" style={{ color: '#ef4444' }}>{errors.politicalParty}</p>
              )}

              {/* Level first, then the title within it: one list of every
                  title is unreadable, and a level is something people know. */}
              <div className="space-y-1.5">
                <span className="text-xs px-1" style={{ color: '#8b94b8' }}>
                  {t('auth.partyPosition')}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={partyLevel}
                    onChange={(e) => { setPartyLevel(e.target.value); setPartyPosition(''); clearError('partyPosition'); }}
                    disabled={!politicalParty}
                    aria-label={t('profile.levelLabel')}
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition disabled:opacity-50 disabled:cursor-not-allowed"
                    style={selectStyle(partyLevel)}
                  >
                    <option value="">{politicalParty ? t('profile.levelLabel') : t('auth.pickParty')}</option>
                    {ROLE_GROUPS.map((g) => (
                      <option key={g.group} value={g.group}>{levelLabel(g.group, lang)}</option>
                    ))}
                  </select>
                  <select
                    value={partyPosition}
                    onChange={(e) => { setPartyPosition(e.target.value); clearError('partyPosition'); }}
                    disabled={!partyLevel}
                    aria-label={t('profile.positionLabel')}
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition disabled:opacity-50 disabled:cursor-not-allowed"
                    style={selectStyle(partyPosition, errors.partyPosition)}
                  >
                    <option value="">{partyLevel ? t('profile.positionLabel') : t('auth.pickLevel')}</option>
                    {rolesInGroup(partyLevel).map((r) => (
                      <option key={r.id} value={r.id}>{roleLabel(r, politicalParty, lang)}</option>
                    ))}
                  </select>
                </div>
                {errors.partyPosition && (
                  <p className="text-xs mt-0.5 px-1" style={{ color: '#ef4444' }}>{errors.partyPosition}</p>
                )}
              </div>

              <label className="flex items-start gap-3 cursor-pointer rounded-md px-1">
                <input
                  type="checkbox"
                  checked={understood}
                  onChange={(e) => { setUnderstood(e.target.checked); clearError('understood'); }}
                  className="mt-0.5 w-4 h-4 rounded accent-blue-500 cursor-pointer shrink-0"
                />
                <span className="text-xs leading-relaxed" style={{ color: '#c0cde8' }}>{t('signup.confirm')}</span>
              </label>
              {errors.understood && <p className="text-xs mt-0.5 px-1" style={{ color: '#ef4444' }}>{errors.understood}</p>}
            </>
          )}

          <div className="flex gap-3 pt-1">
            {step > 1 && (
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-5 text-sm font-medium transition hover:text-white"
                style={{ border: '1px solid #1e3260', color: '#c5cde8' }}
              >
                <ArrowLeft size={15} strokeWidth={2} />
                {t('common.back')}
              </button>
            )}
            <div className="flex-1">
              <PrimaryButton type="submit" loading={loading}>
                {loading ? t('auth.pleaseWait') : step < totalSteps ? (
                  <span className="inline-flex items-center gap-2">{t('common.next')} <ArrowRight size={15} strokeWidth={2.2} /></span>
                ) : t('details.finish')}
              </PrimaryButton>
            </div>
          </div>
        </form>

        {/* Nothing is saved: the account is made already, and these details
            are asked for again where they are needed (writing a post). */}
        <button
          type="button"
          onClick={() => { skipOnboarding(currentUser?.id); curtainGo(HOME_ROUTE, { replace: true }); }}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#3a6bc4]/70 bg-[#3a6bc4]/10 px-5 text-[15px] font-semibold text-[#dbe6ff] transition hover:border-[#6b9bff] hover:bg-[#3a6bc4]/25 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6b9bff]"
        >
          {t('onboard.skipToNews')}
          <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
    </AuthLayout>
  );
}
