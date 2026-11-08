import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useI18n } from '../../i18n/index.jsx';

// Each screen's name in the browser tab and in a shared link's history entry,
// instead of "AmbedkarGPT" everywhere. Paths not listed (a book page, which
// names itself) are left alone.
const TITLES = {
  '/': { en: 'AmbedkarGPT · Turning Karyakarta into Vichaarkarta', hi: 'AmbedkarGPT · कार्यकर्ता से विचारकर्ता तक' },
  '/login': { en: 'Sign in', hi: 'साइन इन' },
  '/signup': { en: 'Create your account', hi: 'खाता बनाएँ' },
  '/generate': { en: 'Write a post', hi: 'पोस्ट बनाएँ' },
  '/generate/social-media': { en: "Today's news · Write a post", hi: 'आज की ख़बरें · पोस्ट बनाएँ' },
  '/posts': { en: 'My posts', hi: 'मेरी पोस्ट' },
  '/settings': { en: 'Settings', hi: 'सेटिंग्स' },
  '/bhimbot': { en: 'BhimBot', hi: 'भीमबॉट' },
  '/profile-setup': { en: 'Your profile', hi: 'आपकी प्रोफ़ाइल' },
  '/questionnaire': { en: 'A few questions', hi: 'कुछ सवाल' },
  '/bhimradio': { en: 'Bhim Radio', hi: 'भीम रेडियो' },
};

export default function RouteTitle() {
  const { pathname } = useLocation();
  const { lang } = useI18n();
  useEffect(() => {
    const entry = TITLES[pathname.replace(/\/+$/, '') || '/'];
    if (!entry) return;
    const name = entry[lang] ?? entry.en;
    document.title = pathname === '/' ? name : `${name} · AmbedkarGPT`;
  }, [pathname, lang]);
  return null;
}
