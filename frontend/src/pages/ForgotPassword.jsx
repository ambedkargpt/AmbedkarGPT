import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { friendlyError } from '../context/AuthContext';
import AuthLayout    from '../components/AuthLayout';
import AnimatedInput from '../components/AnimatedInput';
import PrimaryButton from '../components/PrimaryButton';
import AuthSwitchLink from '../components/AuthSwitchLink';
import GoogleButton  from '../components/GoogleButton';
import { useAuth }   from '../context/AuthContext';
import { useCurtain } from '../context/CurtainContext';
import { useI18n } from '../i18n/index.jsx';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export default function ForgotPassword() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { loginWithGoogle } = useAuth();
  const { go: curtainGo } = useCurtain();
  const [email, setEmail]         = useState('');
  const [error, setError]         = useState('');
  const [isGoogleAccount, setIsGoogleAccount] = useState(false);
  const [loading, setLoading]     = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    setError('');
    setIsGoogleAccount(false);
    setLoading(true);
    try {
      const { data } = await axios.post(`${BASE_URL}/auth/forgot-password`, {
        email: email.trim().toLowerCase(),
      });
      navigate('/otp', {
        state: {
          identifier: email.trim().toLowerCase(),
          type:       'email',
          mode:       'reset_password',
          password:   '',
          devOtp:     data?.dev_otp || '',
        },
      });
    } catch (err) {
      const detail = err?.response?.data?.detail || '';
      if (detail === 'google_account') {
        setIsGoogleAccount(true);
      } else {
        setError(friendlyError(err));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle(tokenResponse) {
    setLoading(true);
    try {
      await loginWithGoogle(tokenResponse.access_token);
      const redirect = sessionStorage.getItem('auth_redirect') || '/generate/social-media';
      sessionStorage.removeItem('auth_redirect');
      curtainGo(redirect, { replace: true });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout brandSide="right" brandVariant="login">
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-[40px] font-bold leading-tight tracking-tight text-white md:text-[48px]">
            {t('auth.forgotTitle')}
          </h1>
          <p className="mt-3 text-[14px]" style={{ color: '#8b94b8' }}>
            {t('auth.forgotSub')}
          </p>
        </div>

        {isGoogleAccount && (
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-4 text-sm">
            <p className="font-medium text-blue-300">{t('auth.googleAccount')}</p>
            <p className="mt-1 text-[#8b94b8]">
              You signed up with Google, so there&apos;s no password to reset. Please log in with Google instead.
            </p>
            <div className="mt-3">
              <GoogleButton
                onSuccess={handleGoogle}
                onError={() => setError('Google sign-in failed. Please try again.')}
                disabled={loading}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {!isGoogleAccount && (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <AnimatedInput
              placeholders={['Enter your Email']}
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              label={t('auth.email')}
              error={error}
            />
            <PrimaryButton type="submit" loading={loading}>
              {loading ? t('landing.sending') : t('auth.sendCode')}
            </PrimaryButton>
          </form>
        )}

        <AuthSwitchLink to="/login" prompt={t('auth.rememberPwd')} label={t('auth.backToLogin')} />
      </div>
    </AuthLayout>
  );
}
