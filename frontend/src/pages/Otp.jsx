import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth, friendlyError } from '../context/AuthContext';
import { resendOtp as resendOtpApi } from '../api/auth';
import { useCurtain } from '../context/CurtainContext';
import AuthLayout    from '../components/AuthLayout';
import PrimaryButton from '../components/PrimaryButton';
import AuthSwitchLink from '../components/AuthSwitchLink';
import { Info } from 'lucide-react';
import { useI18n } from '../i18n/index.jsx';

const OTP_LENGTH = 6;

function describeIdentifier(identifier = '') {
  const trimmed = identifier.trim();
  if (trimmed.includes('@')) {
    const [local, domain] = trimmed.split('@');
    return { labelKey: 'auth.emailWord', masked: local.slice(0, 2) + '***@' + domain };
  }
  const digits = trimmed.replace(/\D/g, '');
  return { labelKey: 'auth.phoneWord', masked: '******' + digits.slice(-4) };
}

function OtpBoxes({ value, onChange, error }) {
  const digits    = value.split('').concat(Array(OTP_LENGTH).fill('')).slice(0, OTP_LENGTH);
  const inputRefs = useRef([]);

  useEffect(() => { inputRefs.current[0]?.focus(); }, []);

  function focusBox(i) { inputRefs.current[i]?.focus(); }

  function handleKeyDown(e, i) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      onChange(digits.map((d, j) => (j === i ? '' : d)).join(''));
      if (i > 0) focusBox(i - 1);
    } else if (e.key === 'ArrowLeft'  && i > 0)              focusBox(i - 1);
    else if   (e.key === 'ArrowRight' && i < OTP_LENGTH - 1) focusBox(i + 1);
  }

  function handleInput(e, i) {
    const char = e.target.value.replace(/\D/g, '').slice(-1);
    if (!char) return;
    onChange(digits.map((d, j) => (j === i ? char : d)).join(''));
    if (i < OTP_LENGTH - 1) focusBox(i + 1);
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    onChange(Array(OTP_LENGTH).fill('').map((_, i) => pasted[i] || '').join(''));
    focusBox(Math.min(pasted.length, OTP_LENGTH - 1));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2.5 justify-between">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => (inputRefs.current[i] = el)}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onKeyDown={(e) => handleKeyDown(e, i)}
            onInput={(e) => handleInput(e, i)}
            onPaste={handlePaste}
            onChange={() => {}}
            className={`input-field w-full text-center text-xl font-bold rounded-xl py-3.5 ${error ? 'error' : ''}`}
            style={{ caretColor: '#4f6bff' }}
          />
        ))}
      </div>
      {error && <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>}
    </div>
  );
}

function ResendTimer({ onResend, type }) {
  const { t } = useI18n();
  const [seconds, setSeconds] = useState(30);
  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);
  const label = t(type === 'phone' ? 'auth.callAgain' : 'auth.resend');
  return (
    <div className="space-y-3 text-center">
      <p className="text-[15px]" style={{ color: '#a9b6d8' }}>
        {t(type === 'phone' ? 'auth.didntGetCall' : 'auth.didntReceive')}{' '}
        {seconds > 0 && <span style={{ color: '#c5cde8' }}>{t('auth.tryAgainIn', { seconds })}</span>}
      </p>
      {seconds <= 0 && (
        <button type="button" onClick={() => { setSeconds(30); onResend(); }}
          className="flex h-12 w-full items-center justify-center rounded-xl border border-[#3a6bc4]/70 bg-[#3a6bc4]/10 px-5 text-[15px] font-semibold text-[#dbe6ff] transition hover:border-[#6b9bff] hover:bg-[#3a6bc4]/25 hover:text-white">
          {label}
        </button>
      )}
    </div>
  );
}

export default function Otp() {
  const { t } = useI18n();
  const { state }          = useLocation();
  const navigate           = useNavigate();
  const { go: curtainGo }  = useCurtain();
  const { verifyOtp } = useAuth();

  const identifier = state?.identifier || '';
  const type       = state?.type       || 'email';  // 'email' | 'phone'
  const mode       = state?.mode       || 'signup'; // 'signup' | 'login'
  const password   = state?.password   || '';
  const devOtp     = state?.devOtp     || '';       // auto-filled in dev mode

  useEffect(() => {
    if (!identifier) navigate('/signup', { replace: true });
  }, [identifier, navigate]);

  const { labelKey, masked } = describeIdentifier(identifier);
  const [otp, setOtp]           = useState(devOtp);
  const [otpError, setOtpError] = useState('');
  const [loading, setLoading]   = useState(false);
  const [resendMsg, setResendMsg] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (otp.length < OTP_LENGTH) { setOtpError(t('auth.otpIncomplete')); return; }
    setOtpError('');
    setLoading(true);
    try {
      const purpose = mode === 'signup' ? 'signup_verify' : 'login_verify';
      await verifyOtp(otp, identifier, type, purpose);
      // A new account goes on to give its details; a login lands on the news.
      const dest = mode === 'signup' ? '/signup/details' : '/generate/social-media';
      curtainGo(dest, { replace: true });
    } catch (err) {
      setOtpError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setOtp('');
    setOtpError('');
    setResendMsg('');
    try {
      const purpose = mode === 'signup' ? 'signup_verify' : 'login_verify';
      const data = await resendOtpApi({ target: identifier, channel: type, purpose });
      setResendMsg(t('auth.otpResent'));
      if (data?.dev_otp) setOtp(data.dev_otp);
      setTimeout(() => setResendMsg(''), 4000);
    } catch (err) {
      setOtpError(friendlyError(err));
    }
  }

  const title  = t(type === 'email' ? 'auth.verifyEmail' : 'auth.verifyPhone');
  const backTo = mode === 'login' ? '/login' : '/signup';
  const deliveryMsg = type === 'phone'
    ? <>You&apos;ll receive a <span className="font-medium" style={{ color: '#c8d8ff' }}>call</span> on <span className="font-medium" style={{ color: '#c8d8ff' }}>{masked}</span> with your 6-digit code.</>
    : <>We&apos;ve sent a 6-digit code to your {t(labelKey)} <span className="font-medium" style={{ color: '#c8d8ff' }}>{masked}</span>.</>;

  return (
    <AuthLayout brandSide="left" brandVariant="signup">
      <div className="space-y-7">
        <div>
          <h1 className="text-3xl font-bold text-white">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: '#8b94b8' }}>
            {deliveryMsg}
          </p>
          {devOtp && (
            <p className="mt-1 text-xs rounded-md px-3 py-1.5 inline-block" style={{ backgroundColor: '#0d2b1a', color: '#4ade80', border: '1px solid #166534' }}>
              Dev mode — OTP auto-filled: {devOtp}
            </p>
          )}
        </div>

        {/* Email only. A verification code from a new sender is a textbook
            spam-filter catch, and someone who does not know to look there
            concludes the code never arrived and gives up on the signup. */}
        {type === 'email' && (
          <div className="flex items-start gap-2.5 rounded-lg border border-[#3f9fff]/25 bg-[#3f9fff]/[0.07] px-4 py-3">
            <Info size={16} strokeWidth={2} className="mt-px shrink-0 text-[#7fb5ff]" />
            <p className="text-[13px] leading-relaxed text-[#a8bbdd]">
              Not in your inbox? Check your <span className="font-medium text-[#c8d8ff]">spam</span> or{' '}
              <span className="font-medium text-[#c8d8ff]">promotions</span> folder. It can take a minute
              to arrive.
            </p>
          </div>
        )}

        {resendMsg && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
            {resendMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <OtpBoxes value={otp} onChange={(v) => { setOtp(v); setOtpError(''); }} error={otpError} />
          <PrimaryButton type="submit" loading={loading}>
            {loading ? 'Verifying…' : 'Verify OTP'}
          </PrimaryButton>
        </form>

        <ResendTimer onResend={handleResend} type={type} />

        <AuthSwitchLink to={backTo} prompt={`Wrong ${type === 'email' ? 'email' : 'number'}?`} label={t('auth.goBack')} />
      </div>
    </AuthLayout>
  );
}
