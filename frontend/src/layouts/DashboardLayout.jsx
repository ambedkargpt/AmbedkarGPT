import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import DashboardShell from './DashboardShell';
import Spinner from '../components/Spinner';

/**
 * The signed-in frame, mounted once for every screen inside it.
 *
 * Each page used to render its own DashboardShell, so moving between them
 * unmounted the rail and built a new one: the sidebar blinked, its collapsed
 * state reset, the scroll position went, and a lazy chunk arriving late
 * covered the whole viewport with a spinner. As a layout route the frame
 * outlives the page, and only what sits in the Outlet changes.
 *
 * The shell works out which rail item is current from the path, so nothing
 * has to be passed down here.
 */
export default function DashboardLayout() {
  const { pathname } = useLocation();
  return (
    <DashboardShell>
      {/* Scoped to the content column on purpose. The app-wide Suspense sits
          above the router, so its fallback replaced the rail as well - which
          is the flash this layout exists to remove. */}
      <Suspense
        fallback={(
          <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
            <Spinner size={32} />
          </div>
        )}
      >
        {/* Keyed on the path, so each screen settles in as it arrives while
            the rail around it stays put. */}
        <div key={pathname} className="ag-page-in">
          <Outlet />
        </div>
      </Suspense>
    </DashboardShell>
  );
}
