import { Menu } from 'lucide-react';
import { useShell } from '../../layouts/dashboardShellContext';
import { useI18n } from '../../i18n/index.jsx';

/**
 * The header strip every signed-in working screen shares: the drawer button on
 * phones, where you are on the left, page controls in the middle, and the
 * account controls on the right. It sticks to the top of the scrolling area on
 * glass, so the controls stay reachable without taking a band of the screen.
 *
 * @param {object}    p
 * @param {object}    p.user        – name, email and party for the avatar menu
 * @param {number}    p.totalPosts  – the count the notification bell reads
 * @param {string}    p.title       – the page's name, on the left
 * @param {JSX.Element} p.icon      – small mark beside the title, desktop only
 * @param {JSX.Element} p.right     – page-specific controls, before the account ones
 */
// The account controls (language, notifications, profile menu) moved into the
// rail, which now carries the language toggle, the signed-in card and log out;
// `user` and `totalPosts` are still accepted so callers need not change.
export default function Topbar({ title, icon = null, right = null }) {
  const { t } = useI18n();
  const { openMenu } = useShell();

  return (
    <header className="dash-header sticky top-0 z-30 -mx-4 mb-5 px-4 sm:-mx-6 sm:px-6 md:-mx-10 md:px-10">
      <div className="flex h-16 items-center gap-3 md:h-[76px]">
        {/* Hamburger — phones and tablets */}
        <button
          type="button"
          onClick={openMenu}
          className="dash-icon-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#1e3260]/70 text-[#8b9ac0] lg:hidden"
          aria-label={t('common.openMenu')}
        >
          <Menu size={17} strokeWidth={1.9} />
        </button>

        <div className="flex min-w-0 items-center gap-3">
          {icon && (
            <span
              className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-white lg:flex [&>svg]:block [&>svg]:!text-white"
              style={{ background: 'linear-gradient(140deg, #3f9fff 0%, #5b7cff 100%)', boxShadow: '0 10px 26px rgba(63,110,255,0.4)' }}
            >
              {icon}
            </span>
          )}
          <span className="truncate font-display text-[21px] font-bold tracking-tight text-white md:text-[28px]">
            {title ?? t('nav.dashboard')}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {right}
        </div>
      </div>
    </header>
  );
}
