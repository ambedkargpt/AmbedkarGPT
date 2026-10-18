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
import GoogleButton  from '../components/GoogleButton';
import { useI18n } from '../i18n/index.jsx';

// One-click sign-in for the shared team accounts seeded by
// backend/scripts/seed_test_accounts.py.
//
// The password is read from the environment and never written here. Anything in
// this file is compiled into the bundle every visitor downloads, and these
// accounts have no limits at all -- committing their password would publish
// uncapped generation under the project's name to anyone who opened devtools.
// Set VITE_TEST_PASSWORD in frontend/.env locally, or on a staging deployment,
// and the block appears; leave it unset, as production should, and it does not
// render at all.
const TEST_PASSWORD = import.meta.env.VITE_TEST_PASSWORD || '';
const TEST_ACCOUNTS = [
  { email: 'test.cong@ambedkargpt.test', label: 'Congress' },
  { email: 'test.sp@ambedkargpt.test', label: 'Samajwadi' },
  { email: 'test.ind@ambedkargpt.test', label: 'No party' },
];

export default function Login() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { go: curtainGo } = useCurtain();
  const { loginWithEmail, loginWithPhone, loginWithGoogle } = useAuth();

  const [mode, setMode]         = useState('email');
  const [email, setEmail]       = useState('');
  const [phone, setPhone]       = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors]     = useState({});
  const [authError, setAuthError] = useState('');
  const [loading, setLoading]   = useState(false);

  function validate() {
    const e = {};
    if (mode === 'email') {
      if (!email.trim()) e.email    = t('auth.emailRequired');
      if (!password)     e.password = t('auth.passwordRequired');
    } else {
      if (!phone)                          e.phone = 'Phone number is required.';
      else if (!isValidPhoneNumber(phone)) e.phone = 'Please enter a valid phone number.';
      // No password for phone — OTP is sent automatically
    }
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
        const data = await loginWithPhone(phone);
        navigate('/otp', {
          state: {
            identifier: data?.otp_target || phone,
            type: 'phone',
            mode: 'login',
            password: '',
            devOtp: data?.dev_otp || '',
          },
        });
      } else {
        const data = await loginWithEmail(email.trim(), password);
        if (data?.otp_required) {
          navigate('/otp', {
            state: {
              identifier: data.otp_target || email.trim(),
              type: 'email',
              mode: 'login',
              password: '',
              devOtp: data.dev_otp || '',
            },
          });
        } else {
          const redirect = sessionStorage.getItem('auth_redirect') || '/dashboard';
          sessionStorage.removeItem('auth_redirect');
          curtainGo(redirect, { replace: true });
        }
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
      await loginWithGoogle(tokenResponse.access_token);
      const redirect = sessionStorage.getItem('auth_redirect') || '/dashboard';
      sessionStorage.removeItem('auth_redirect');
      curtainGo(redirect, { replace: true });
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
  }

  return (
    <AuthLayout brandSide="right" brandVariant="login">
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-[44px] font-bold leading-tight tracking-tight text-white md:text-[52px]">
            {t('auth.welcomeBack')}
          </h1>
          <p className="mt-3 text-[14px]" style={{ color: '#8b94b8' }}>
            {t('auth.loginSub')}
          </p>
        </div>

        {/* Email / Phone toggle */}
        <div className="flex rounded-xl p-1" style={{ backgroundColor: '#0a1128', border: '1px solid #1e3260' }}>
          {['email', 'phone'].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className="flex-1 rounded-lg py-2 text-sm font-medium transition-all duration-200"
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

        {authError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {authError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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
            <div className="space-y-1">
              <PasswordInput
                value={password}
                onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: '' })); }}
                error={errors.password}
              />
              <div className="flex justify-end">
                <Link to="/forgot-password" className="text-xs underline underline-offset-2 hover:opacity-80 transition-opacity" style={{ color: '#6b8aff' }}>
                  {t('auth.forgotPassword')}
                </Link>
              </div>
            </div>
          )}

          {mode === 'phone' && (
            <p className="text-xs" style={{ color: '#8b94b8' }}>
              {t('auth.otpToNumber')}
            </p>
          )}

          <PrimaryButton type="submit" loading={loading}>
            {loading ? t('auth.pleaseWait') : mode === 'phone' ? t('auth.sendOtp') : t('auth.login')}
          </PrimaryButton>
        </form>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px" style={{ backgroundColor: '#2a3566' }} />
          <span className="text-xs" style={{ color: '#8b94b8' }}>{t('auth.or')}</span>
          <div className="flex-1 h-px" style={{ backgroundColor: '#2a3566' }} />
        </div>

        <GoogleButton
          onSuccess={handleGoogle}
          onError={() => setAuthError(t('auth.googleFailed'))}
          disabled={loading}
        />

        <p className="text-center text-sm" style={{ color: '#8b94b8' }}>
          {t('auth.noAccount')}{' '}
          <Link to="/signup" className="underline underline-offset-2 hover:opacity-80 transition-opacity font-medium" style={{ color: '#6b8aff' }}>
            {t('auth.signUp')}
          </Link>
        </p>

        {TEST_PASSWORD && (
          <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: '#2a3566', backgroundColor: 'rgba(10,17,48,0.6)' }}>
            <p className="text-[11px] font-medium" style={{ color: '#8b94b8' }}>
              Test accounts — click to fill
            </p>
            <div className="mt-1.5 flex flex-col gap-1">
              {TEST_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => { setMode('email'); setEmail(acc.email); setPassword(TEST_PASSWORD); }}
                  className="text-left text-[11px] underline underline-offset-2 hover:opacity-80"
                  style={{ color: '#6b8aff' }}
                >
                  {acc.email} · {acc.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
