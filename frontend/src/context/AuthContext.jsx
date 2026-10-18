import { createContext, useContext, useEffect, useState } from 'react';
import { readSession } from '../api/sessionStore';
import * as authApi from '../api/auth';
import { setAnalyticsUser, trackEvent } from '../analytics/metrics';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function friendlyError(err) {
  const detail = err?.response?.data?.detail || err?.message || String(err);
  const msg = detail.toLowerCase();
  if (msg.includes('phone') && (msg.includes('already') || msg.includes('duplicate')))
    return 'An account with this phone number already exists.';
  if (msg.includes('already') || msg.includes('duplicate'))
    return 'An account with this email already exists.';
  if ((msg.includes('invalid') && msg.includes('credential')) || msg.includes('wrong password'))
    return 'Incorrect email or password.';
  if (detail === 'google_account')
    return 'This account uses Google Sign-In. Please log in with Google instead.';
  if (detail === 'phone_otp_required')
    return 'Use the Phone Number tab and enter your number to receive a one-time code.';
  if (msg.includes('not found') || msg.includes('does not exist'))
    return 'No account found with these credentials.';
  if (msg.includes('expired') && msg.includes('otp'))
    return 'OTP has expired. Please request a new one.';
  if (msg.includes('invalid') && msg.includes('otp'))
    return 'Invalid OTP. Please check and try again.';
  if (msg.includes('too many') || msg.includes('rate limit'))
    return 'Too many attempts. Please try again later.';
  if (msg.includes('network') || msg.includes('failed to fetch'))
    return 'Network error. Check your connection.';
  return detail || 'Something went wrong. Please try again.';
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(authApi.getStoredUser());
  const [loading, setLoading]         = useState(true);

  // On mount verify the stored token is still valid
  useEffect(() => {
    const token = readSession('access_token');
    if (token) {
      authApi.getMe()
        .then((user) => setCurrentUser(user))
        .catch(() => {
          authApi.clearTokens();
          setCurrentUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // Keeps analytics tied to whoever is signed in, so a visit that starts
  // logged out and continues logged in reads as one person rather than two.
  // The app's own id, never an email or a phone: sending anything that
  // identifies a person directly is against Google's terms.
  useEffect(() => { setAnalyticsUser(currentUser?.id); }, [currentUser?.id]);

  // ── Email signup → returns data including dev_otp in dev mode ─────────────
  // `extra` carries the fields collected regardless of which identifier is
  // primary: a phone given alongside the email, state, city, date of birth.
  async function signupWithEmail(email, password, politicalParty, partyPosition, extra = {}) {
    const username = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 50);
    return authApi.signupWithEmail({
      username,
      email,
      password,
      political_party: politicalParty || undefined,
      party_position: partyPosition || undefined,
      phone: extra.phone || undefined,
      state: extra.state || undefined,
      city: extra.city || undefined,
      date_of_birth: extra.dateOfBirth || undefined,
    });
  }

  // ── Phone signup (OTP-based, no password) ─────────────────────────────────
  async function signupWithPhone(phone, politicalParty, partyPosition, extra = {}) {
    const username = 'user_' + phone.replace(/\D/g, '').slice(-8);
    return authApi.sendPhoneOtp({
      phone,
      purpose: 'signup_verify',
      username,
      political_party: politicalParty || undefined,
      party_position: partyPosition || undefined,
      state: extra.state || undefined,
      city: extra.city || undefined,
      date_of_birth: extra.dateOfBirth || undefined,
    });
  }

  // ── Phone login (OTP-based) ────────────────────────────────────────────────
  async function loginWithPhone(phone) {
    return authApi.sendPhoneOtp({ phone, purpose: 'login_verify' });
  }

  // ── OTP verification ───────────────────────────────────────────────────────
  // target: the email or phone that received the OTP
  // channel: 'email' | 'phone'
  // purpose: 'signup_verify' | 'login_verify'
  async function verifyOtp(code, target, channel, purpose) {
    const data = await authApi.verifyOtp({ target, channel, otp_code: code, purpose });
    // Tokens were already saved on signup/login. Refresh user to get verified state.
    const user = await authApi.getMe().catch(() => authApi.getStoredUser());
    if (user) setCurrentUser(user);
    trackEvent(purpose === 'signup_verify' ? 'sign_up' : 'login', { method: channel });
    return data;
  }

  // ── Email / phone + password login ────────────────────────────────────────
  async function loginWithEmail(identifier, password) {
    const data = await authApi.login({ identifier, password });
    if (data?.user && !data.otp_required) {
      setCurrentUser(data.user);
      trackEvent('login', { method: 'password' });
    }
    return data; // caller checks data.otp_required to decide next route
  }

  // ── Google OAuth login ─────────────────────────────────────────────────────
  async function loginWithGoogle(googleAccessToken, politicalParty) {
    const data = await authApi.loginWithGoogle(googleAccessToken, politicalParty);
    if (data?.user) {
      setCurrentUser(data.user);
      trackEvent('login', { method: 'google' });
    }
    return data;
  }

  async function updateProfile(fields) {
    const user = await authApi.updateProfile(fields);
    if (user) setCurrentUser(user);
    return user;
  }

  async function logout() {
    await authApi.logout();
    setCurrentUser(null);
  }

  return (
    <AuthContext.Provider value={{
      currentUser,
      loading,
      signupWithEmail,
      signupWithPhone,
      loginWithPhone,
      verifyOtp,
      loginWithEmail,
      loginWithGoogle,
      updateProfile,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
