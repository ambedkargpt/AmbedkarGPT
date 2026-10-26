import { useLocation, useNavigate } from 'react-router-dom';
import { Bug } from 'lucide-react';
import { useIsAdmin } from '../../hooks/useIsAdmin';

/**
 * The "Errors" row in the sidebar. Renders nothing for anyone who is not an
 * admin, so the sidebar looks exactly as before for normal users.
 *
 * Styled like the other rows in Sidebar.jsx. Kept in its own file so the
 * sidebar only needed one added line.
 *
 * @param {object}   p
 * @param {boolean}  p.isActive   – true on the Errors page
 * @param {string}   p.fade       – the label class Sidebar uses while collapsing
 * @param {boolean}  p.collapsed  – rail collapsed, so show a tooltip instead of the label
 * @param {Function} p.onClose    – closes the phone drawer after navigating
 */
export default function AdminNavLink({ isActive: activeFromShell, fade, collapsed, onClose }) {
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // The shell only knows exact paths, so a single report (/admin/errors/:id)
  // is matched here.
  const isActive = activeFromShell || pathname.startsWith('/admin/errors');
  if (!isAdmin) return null;

  return (
    <button
      type="button"
      onClick={() => { navigate('/admin/errors'); onClose?.(); }}
      title={collapsed ? 'Errors' : undefined}
      className={[
        'group relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3.5 py-2.5 text-[13.5px] font-medium transition-all duration-200',
        isActive ? 'text-white' : 'text-[#7b88ad] hover:text-[#c7d1eb] hover:bg-[#0f173a]/70',
      ].join(' ')}
      style={
        isActive
          ? {
              background: 'linear-gradient(90deg, rgba(63,110,255,0.32) 0%, rgba(79,107,255,0.12) 100%)',
              border: '1px solid rgba(79,135,255,0.28)',
              boxShadow: '0 4px 18px rgba(15,40,100,0.35)',
            }
          : { border: '1px solid transparent' }
      }
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-[#3f9fff] to-[#7b5cff]" />
      )}
      <Bug size={17} strokeWidth={1.8} className="shrink-0" />
      <span className={fade}>Errors</span>
      <span className={`ml-auto rounded-full bg-[#ff6b5a]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#ff8a7a] ${fade}`}>
        Admin
      </span>
    </button>
  );
}
