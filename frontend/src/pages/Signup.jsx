import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isValidPhoneNumber } from 'react-phone-number-input';
import { useAuth, friendlyError } from '../context/AuthContext';
import { useCurtain } from '../context/CurtainContext';
import AuthLayout    from '../components/AuthLayout';
import AnimatedInput from '../components/AnimatedInput';
import PasswordInput from '../components/PasswordInput';
import PhoneField    from '../components/PhoneField';
import PrimaryButton from '../components/PrimaryButton';
import AuthSwitchLink from '../components/AuthSwitchLink';
import GuestButton from '../components/GuestButton';
import GoogleButton  from '../components/GoogleButton';
import LegalModal    from '../components/LegalModal';
import { useI18n } from '../i18n/index.jsx';

/**
 * Sign-up asks for one thing: how to reach you, proved with a code.
 *
 * Everything else - name, the other contact, state, city, party and role - is
 * asked on /signup/details once the code is verified. Asking it all up front
 * meant three screens of questions before anyone knew whether the code would
 * even arrive, and the answers sat on an account that might never be verified.
 * Google sign-up goes to the same details screen, since Google proves the
 * email in place of the code.
 */
export default function Signup() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { go: curtainGo } = useCurtain();
  const { signupWithEmail, signupWithPhone, loginWithGoogle } = useAuth();

  const [mode, setMode]                       = useState('email');
  const [email, setEmail]                     = useState('');
  const [phone, setPhone]                     = useState('');
  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted]     = useState(false);
  const [modal, setModal]                     = useState(null);
  const [errors, setErrors]                   = useState({});
  const [authError, setAuthError]             = useState('');
  const [loading, setLoading]                 = useState(false);

  function validate() {
    const e = {};
    if (mode === 'email') {
      if (!email.trim())                              e.email = t('auth.emailRequired');
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Please enter a valid email address.';
      if (!password)                 e.password = t('auth.passwordRequired');
      else if (password.length < 8)  e.password = t('auth.passwordMinLen');
      if (!confirmPassword)          e.confirmPassword = t('auth.confirmPasswordRequired');
      else if (confirmPassword !== password) e.confirmPassword = t('auth.passwordMismatch');
    } else {
      if (!phone)                          e.phone = 'Phone number is required.';
      else if (!isValidPhoneNumber(phone)) e.phone = 'Please enter a valid phone number.';
    }
    if (!termsAccepted) e.terms = 'You must accept the Terms of Service and Privacy Policy.';
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
      if (mode === 'phone') {
        const data = await signupWithPhone(phone);
        navigate('/otp', { state: { identifier: data?.otp_target || phone, type: 'phone', mode: 'signup', password: '', devOtp: data?.dev_otp || '' } });
      } else {
        const data = await signupWithEmail(email.trim(), password);
        navigate('/otp', { state: { identifier: email.trim(), type: 'email', mode: 'signup', password, devOtp: data?.dev_otp || '' } });
      }
    } catch (err) {
      setAuthError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle(tokenResponse) {
    setAuthError('');
    setLoading(true);
    try {
      const data = await loginWithGoogle(tokenResponse.access_token);
      // Someone who already had an account and pressed Google here is
      // signing in, not signing up; their details are already on file.
      if (data?.is_new_user) {
        curtainGo('/signup/details', { replace: true });
      } else {
        const redirect = sessionStorage.getItem('auth_redirect') || '/generate/social-media';
        sessionStorage.removeItem('auth_redirect');
        curtainGo(redirect, { replace: true });
      }
    } catch (err) {
      setAuthError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  function switchMode(m) {
    setMode(m);
    setErrors({});
    setAuthError('');
    setPassword('');
    setConfirmPassword('');
  }

  return (
    <AuthLayout brandSide="left" brandVariant="signup">
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-[40px] font-bold leading-tight tracking-tight text-white md:text-[48px]">
            {t('auth.createAccount')}
          </h1>
          <p className="mt-3 text-[14px]" style={{ color: '#8b94b8' }}>
            {t('auth.createAccountSub')}
          </p>
        </div>

        {authError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {authError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <GoogleButton
            onSuccess={handleGoogle}
            onError={() => setAuthError(t('auth.googleFailed'))}
            disabled={loading}
          />
          {/* Google skips the checkbox below, so the agreement is stated
              where that path starts instead. */}
          <p className="-mt-1 text-center text-[13.5px] leading-relaxed" style={{ color: '#9fb0d6' }}>
            {t('auth.googleTerms')}{' '}
            <button type="button" onClick={() => setModal('privacy')} className="underline underline-offset-2 hover:opacity-80" style={{ color: '#6b8aff' }}>
              {t('landing.privacy')}
            </button>
            {' '}{t('auth.andWord')}{' '}
            <button type="button" onClick={() => setModal('terms')} className="underline underline-offset-2 hover:opacity-80" style={{ color: '#6b8aff' }}>
              {t('landing.terms')}
            </button>
          </p>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ backgroundColor: '#2a3566' }} />
            <span className="text-[14px] font-medium" style={{ color: '#a9b6d8' }}>{t('auth.or')}</span>
            <div className="flex-1 h-px" style={{ backgroundColor: '#2a3566' }} />
          </div>

          {/* Email / Phone toggle */}
          <div className="flex rounded-xl p-1.5" style={{ backgroundColor: '#0a1128', border: '1px solid #2c4a8a' }}>
            {['email', 'phone'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className="flex-1 rounded-lg py-3 text-[15px] font-semibold transition-all duration-200"
                style={{
                  backgroundColor: mode === m ? '#1a2a5e' : 'transparent',
                  color: mode === m ? '#ffffff' : '#8b94b8',
                  boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.4)' : 'none',
                }}
              >
                {m === 'email' ? t('auth.email') : t('auth.phone')}
              </button>
            ))}
          </div>

          {mode === 'email' ? (
            <AnimatedInput
              placeholders={[t('auth.enterEmail')]}
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: '' })); setAuthError(''); }}
              label={t('auth.email')}
              error={errors.email}
            />
          ) : (
            <PhoneField
              value={phone}
              onChange={(v) => { setPhone(v ?? ''); setErrors((p) => ({ ...p, phone: '' })); setAuthError(''); }}
              error={errors.phone}
            />
          )}

          {mode === 'email' && (
            <>
              <PasswordInput
                value={password}
                onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: '' })); }}
                error={errors.password}
              />
              <PasswordInput
                label={t('auth.confirmPassword')}
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setErrors((p) => ({ ...p, confirmPassword: '' })); }}
                error={errors.confirmPassword}
              />
            </>
          )}
          <label className="flex items-start gap-3 cursor-pointer rounded-md px-1">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => { setTermsAccepted(e.target.checked); setErrors((p) => ({ ...p, terms: '' })); }}
              className="mt-0.5 h-5 w-5 rounded accent-blue-500 cursor-pointer shrink-0"
            />
            <span className="text-[14px] leading-relaxed" style={{ color: '#b4c2e2' }}>
              {t('auth.signupTerms')}{' '}
              <button type="button" onClick={() => setModal('privacy')} className="underline underline-offset-2 hover:opacity-80 transition-opacity" style={{ color: '#6b8aff' }}>
                {t('landing.privacy')}
              </button>
              {' '}{t('auth.andWord')}{' '}
              <button type="button" onClick={() => setModal('terms')} className="underline underline-offset-2 hover:opacity-80 transition-opacity" style={{ color: '#6b8aff' }}>
                {t('landing.terms')}
              </button>
            </span>
          </label>
          {errors.terms && <p className="text-xs mt-0.5 px-1" style={{ color: '#ef4444' }}>{errors.terms}</p>}

          <PrimaryButton type="submit" loading={loading}>
            {loading ? t('auth.pleaseWait') : mode === 'phone' ? t('auth.sendOtp') : t('auth.signup')}
          </PrimaryButton>
        </form>

        <AuthSwitchLink to="/login" prompt={t('auth.alreadyAccount')} label={t('auth.login')} />

        <GuestButton />
      </div>
      {modal && <LegalModal type={modal} onClose={() => setModal(null)} />}
    </AuthLayout>
  );
}
