import client from './client';
import { readSession, writeSession, removeSession } from './sessionStore';
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export function saveTokens(tokens) {
  writeSession('access_token', tokens.access_token);
  writeSession('refresh_token', tokens.refresh_token);
}

export function clearTokens() {
  removeSession('access_token');
  removeSession('refresh_token');
  removeSession('user');
}

function saveUser(user) {
  writeSession('user', JSON.stringify(user));
}

export function getStoredUser() {
  try {
    return JSON.parse(readSession('user'));
  } catch {
    return null;
  }
}

// ── Signup with email + password ─────────────────────────────────────────────
export async function signupWithEmail({ username, email, password, political_party, party_position, phone, state, city, date_of_birth }) {
  const { data } = await axios.post(`${BASE_URL}/auth/signup`, {
    username,
    email,
    password,
    ...(political_party ? { political_party } : {}),
    ...(party_position ? { party_position } : {}),
    ...(phone ? { phone } : {}),
    ...(state ? { state } : {}),
    ...(city ? { city } : {}),
    ...(date_of_birth ? { date_of_birth } : {}),
  });
  // No session yet: it is issued by verify-otp once the code is entered.
  return data; // { otp_required, otp_target, dev_otp? }
}

// ── Send phone OTP (signup or login) ─────────────────────────────────────────
// purpose: 'signup_verify' | 'login_verify'
// Returns { otp_required: true, otp_target, dev_otp? }. No session yet:
// verifyOtp below is what signs the user in.
export async function sendPhoneOtp({ phone, purpose, username, political_party, party_position, state, city, date_of_birth }) {
  const { data } = await axios.post(`${BASE_URL}/auth/send-phone-otp`, {
    phone,
    purpose,
    ...(username ? { username } : {}),
    ...(political_party ? { political_party } : {}),
    ...(party_position ? { party_position } : {}),
    ...(state ? { state } : {}),
    ...(city ? { city } : {}),
    ...(date_of_birth ? { date_of_birth } : {}),
  });
  return data;
}

// ── Verify OTP ────────────────────────────────────────────────────────────────
// target: the email address or phone number
// channel: 'email' | 'phone'
// purpose: 'signup_verify' | 'login_verify'
export async function verifyOtp({ target, channel, otp_code, purpose }) {
  const { data } = await axios.post(`${BASE_URL}/auth/verify-otp`, {
    target,
    channel,
    otp_code,
    purpose,
  });
  // Signing up and logging in end here, with the session.
  if (data.tokens) {
    saveTokens(data.tokens);
    if (data.user) saveUser(data.user);
  }
  return data; // { message, tokens?, user? }
}

// ── Login with email/phone + password ────────────────────────────────────────
export async function login({ identifier, password }) {
  const { data } = await axios.post(`${BASE_URL}/auth/login`, {
    identifier,
    password,
  });
  if (data.tokens) {
    saveTokens(data.tokens);
    saveUser(data.user);
  }
  return data; // may have otp_required: true + dev_otp if unverified
}

// ── Google OAuth ──────────────────────────────────────────────────────────────
export async function loginWithGoogle(googleAccessToken, politicalParty) {
  const { data } = await axios.post(`${BASE_URL}/auth/google-login`, {
    access_token: googleAccessToken,
    ...(politicalParty ? { political_party: politicalParty } : {}),
  });
  if (data.tokens) {
    saveTokens(data.tokens);
    saveUser(data.user);
  }
  return data;
}

// ── Continue as guest ─────────────────────────────────────────────────────────
// A ready-made account for one party ('congress' | 'samajwadi'). The browser
// keeps a random device id, so the same device and party get the same guest
// account back rather than a new one on every visit.
const GUEST_DEVICE_KEY = 'ambedkargpt_guest_device';

function guestDeviceId() {
  try {
    let id = localStorage.getItem(GUEST_DEVICE_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');
      localStorage.setItem(GUEST_DEVICE_KEY, id);
    }
    return id;
  } catch {
    // Storage blocked: a fresh id each time. The server still limits how many
    // guest accounts one network can make in a day.
    return `${Date.now()}${Math.random().toString(36).slice(2)}`.replace(/[^A-Za-z0-9_-]/g, '');
  }
}

export async function guestLogin(party) {
  const { data } = await axios.post(`${BASE_URL}/auth/guest`, { party, device_id: guestDeviceId() });
  if (data.tokens) {
    saveTokens(data.tokens);
    saveUser(data.user);
  }
  return data;
}

// ── Resend OTP ────────────────────────────────────────────────────────────────
export async function resendOtp({ target, channel, purpose }) {
  const { data } = await axios.post(`${BASE_URL}/auth/resend-otp`, { target, channel, purpose });
  return data; // { message, dev_otp? }
}

// ── Get current user from backend ────────────────────────────────────────────
export async function getMe() {
  const { data } = await client.get('/auth/me');
  saveUser(data);
  return data;
}

// ── Update profile (full_name, username, ...) ─────────────────────────────────
export async function updateProfile({ full_name, username, political_party, party_position, email, phone, state, city, date_of_birth }) {
  const { data } = await client.patch('/auth/me', {
    ...(full_name  !== undefined ? { full_name }  : {}),
    ...(username   !== undefined ? { username }   : {}),
    ...(political_party !== undefined ? { political_party } : {}),
    // Sent even when empty: '' clears a position, undefined leaves it alone.
    ...(party_position !== undefined ? { party_position } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(phone !== undefined ? { phone } : {}),
    ...(state !== undefined ? { state } : {}),
    ...(city !== undefined ? { city } : {}),
    ...(date_of_birth !== undefined ? { date_of_birth } : {}),
  });
  saveUser(data);
  return data;
}

// ── Logout ────────────────────────────────────────────────────────────────────
export async function logout() {
  const refreshToken = readSession('refresh_token');
  try {
    if (refreshToken) {
      await client.post('/auth/logout', { refresh_token: refreshToken });
    }
  } finally {
    clearTokens();
  }
}
