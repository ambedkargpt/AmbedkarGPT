import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { UserCog, SlidersHorizontal, LogOut } from 'lucide-react';
import { partyLogo } from '../../utils/politicalParties';
import { useI18n } from '../../i18n/index.jsx';
import { PREFERENCES_ENABLED } from '../../data/features';

/**
 * Account menu behind the topbar avatar.
 *
 * The avatar was a plain div, so the only route to profile or preferences was
 * the sidebar, and signing out lived in a separate button in the page header
 * that was hidden below md. Putting all three here means one place to look,
 * and it is where people expect to find them.
 */
export default function ProfileMenu({ name, email, initial, party, onLogout }) {
  const { t } = useI18n();
  // Resolved from the full list, not the offered one, so an account carrying a
  // party we no longer offer still shows its own logo instead of nothing.
  const logo = partyLogo(party);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const [anchor, setAnchor] = useState(null);

  // Matches the sidebar's Log Out. Both revoke the refresh token server-side,
  // so both have a round trip to show; one showing progress and the other not
  // is more noticeable than neither showing it.
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await onLogout?.();
      setOpen(false);
    } finally {
      // Only reached when logout failed; on success the dashboard unmounts.
      setLoggingOut(false);
    }
  }

  // Positioned from the button rather than by CSS: the dashboard sits inside
  // ancestors that create a containing block for fixed elements, which would
  // otherwise place this relative to the wrong box.
  useEffect(() => {
    if (!open || !btnRef.current) return undefined;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setAnchor({ top: r.bottom + 10, right: window.innerWidth - r.right });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function go(path) {
    setOpen(false);
    navigate(path);
  }

  const items = [
    { label: t('dash.updateProfile'), icon: UserCog, onClick: () => go('/settings') },
    PREFERENCES_ENABLED && { label: t('dash.preferences'), icon: SlidersHorizontal, onClick: () => go('/preferences') },
  ].filter(Boolean);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('nav.accountMenu')}
        className="flex items-center gap-3 rounded-full transition hover:opacity-90"
      >
        <div className="hidden text-right leading-tight sm:block">
          <div className="text-[13.5px] font-semibold text-white">{name}</div>
        </div>
        <div className="relative">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#3f9fff]/50 bg-gradient-to-br from-[#2b3e7a] to-[#1a2654] text-[13px] font-semibold text-white shadow-[0_0_14px_rgba(63,159,255,0.25)]">
            {initial}
          </div>
          {logo ? (
            // The party badge takes the corner the presence dot had: two marks
            // on one 40px avatar is clutter, and which party someone represents
            // says more here than whether they are online.
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#070b1c] bg-white">
              <img
                src={logo}
                alt={party}
                title={party}
                className="h-[18px] w-[18px] object-contain"
                onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
              />
            </span>
          ) : (
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#070b1c] bg-[#22c55e]" />
          )}
        </div>
      </button>

      {open && anchor && createPortal(
        <>
          <div className="fixed inset-0 z-[190]" onClick={() => setOpen(false)} />
          <div
            role="menu"
            aria-label={t('menu.accountLabel')}
            style={{ top: anchor.top, right: Math.max(anchor.right, 12) }}
            className="fixed z-[200] w-[248px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-[#1e3260] bg-[#080e24] shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
          >
            <div className="border-b border-[#1a2c55] px-4 py-3">
              <p className="truncate text-[13.5px] font-semibold text-white">{name}</p>
              {email && email !== '—' && (
                <p className="mt-0.5 truncate text-[12px] text-[#8b94b8]">{email}</p>
              )}
              {party && (
                <p className="mt-2 flex items-center gap-2 text-[12px] text-[#9dc3ff]">
                  {logo && (
                    <img src={logo} alt="" className="h-4 w-4 shrink-0 rounded-sm bg-white object-contain p-px" />
                  )}
                  <span className="truncate">{party}</span>
                </p>
              )}
            </div>

            <div className="py-1.5">
              {items.map(({ label, icon: Icon, onClick }) => (
                <button
                  key={label}
                  type="button"
                  role="menuitem"
                  onClick={onClick}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13.5px] text-[#c3d3ec] transition hover:bg-[#0f173a]/80 hover:text-white"
                >
                  <Icon size={16} strokeWidth={1.85} className="shrink-0 text-[#8b9dc4]" />
                  {label}
                </button>
              ))}
            </div>

            {/* Signing out is separated: it is the one item here that undoes
                something rather than navigating somewhere. */}
            <div className="border-t border-[#1a2c55] py-1.5">
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                disabled={loggingOut}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13.5px] text-[#c3d3ec] transition hover:bg-[#0f173a]/80 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-transparent disabled:hover:text-[#c3d3ec]"
              >
                {loggingOut ? (
                  <>
                    <span className="spinner-ring shrink-0" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    {t('auth.signingOut')}
                  </>
                ) : (
                  <>
                    <LogOut size={16} strokeWidth={1.85} className="shrink-0 text-[#8b9dc4]" />
                    {t('auth.logout')}
                  </>
                )}
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
