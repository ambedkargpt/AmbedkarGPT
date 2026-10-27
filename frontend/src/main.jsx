import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { getSiteLanguage } from './utils/siteLanguage.js'
import { DEFAULT_LANGUAGE } from './i18n/index.jsx'
import { purgeLegacySession } from './api/sessionStore.js'
import { startErrorReporting } from './utils/errorReporter.js'

// Send browser errors to the admin Errors page (production builds only).
startErrorReporting()

// Sessions moved from localStorage to sessionStorage so closing the tab
// signs you out. Anyone signed in under the old build has tokens sitting in
// localStorage that nothing reads and nothing clears, which would leave them
// signed in across tab closes forever. Clear them once, here.
purgeLegacySession()

// Stamp lang before first render so the Devanagari font rules fire immediately.
// Falls back to the default rather than leaving it unset: the interface is
// Hindi unless someone has chosen otherwise, and an unstamped <html> would
// paint the first frame in the Latin stack and reflow.
document.documentElement.lang = getSiteLanguage() ?? DEFAULT_LANGUAGE;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Hand off from the static boot screen in index.html. Removed after paint
// rather than before, so there is no frame where neither is on screen.
requestAnimationFrame(() => {
  const boot = document.getElementById('boot');
  if (boot) boot.remove();
});
