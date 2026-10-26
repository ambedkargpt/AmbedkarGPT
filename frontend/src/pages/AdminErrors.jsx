import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Bug, ChevronRight, RefreshCw, Search } from 'lucide-react';
import Topbar from '../components/dashboard/Topbar';
import Spinner from '../components/Spinner';
import { getAdminStatus, getErrors } from '../api/monitoring';
import { BarList, KindBadge, Panel, Sparkline, StatTile, TimelineChart } from '../components/admin/ErrorCharts';
import { formatTime } from '../components/admin/errorFormat';

/**
 * Admin Errors overview (/admin/errors).
 *
 * Top: how much went wrong in the chosen period (tiles), when (timeline),
 * and where (top failing endpoints/pages, top error types).
 * Below: every issue, one row per distinct bug, with its trend. Clicking a
 * row opens the full report at /admin/errors/:id.
 *
 * The API refuses non-admins, so hiding the page is only a convenience; the
 * real check is on the server.
 */

const PERIODS = [
  { hours: 24, label: '24 hours' },
  { hours: 168, label: '7 days' },
];

const STATUS_FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: '', label: 'All' },
];

const SOURCE_FILTERS = [
  { value: '', label: 'Everywhere' },
  { value: 'backend', label: 'Backend' },
  { value: 'frontend', label: 'Browser' },
];

function Pill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition ${
        active ? 'bg-[#1a5fff] text-white' : 'border border-[#1a2c55] text-[#7b88ad] hover:border-[#3f6bd4]/60 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function IssueRow({ issue, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(issue.id)}
      className="grid w-full grid-cols-1 gap-2 border-t border-[#13204a] px-4 py-3.5 text-left transition hover:bg-[#0f1a3c]/70 md:grid-cols-[minmax(0,1fr)_120px_90px_110px_70px_150px_16px] md:items-center md:gap-4"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {issue.status === 'resolved' && <span className="text-[11px] font-semibold text-[#22c55e]">✓ Resolved</span>}
          <span className="truncate text-[13.5px] font-semibold text-white">{issue.error_type}</span>
        </div>
        <div className="mt-0.5 truncate text-[12.5px] text-[#9aa6c8]">{issue.message}</div>
        <div className="mt-0.5 truncate font-mono text-[11.5px] text-[#6b78a0]">{issue.location || issue.path || '—'}</div>
      </div>
      <div><KindBadge kind={issue.kind} /></div>
      <div className="text-[13px] text-white md:text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {issue.events_in_period}
        <span className="ml-1 text-[11px] text-[#6b78a0]">/ {issue.count} all</span>
      </div>
      <div className="hidden md:block"><Sparkline values={issue.sparkline} /></div>
      <div className="text-[13px] text-[#9aa6c8] md:text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {issue.users_in_period || '—'}
      </div>
      <div className="text-[12px] text-[#6b78a0]">{formatTime(issue.last_seen)}</div>
      <ChevronRight size={15} className="hidden text-[#4e5a80] md:block" />
    </button>
  );
}

export default function AdminErrors() {
  const navigate = useNavigate();
  // null while we ask the API whether this user is an admin.
  const [admin, setAdmin] = useState(null);
  const [hours, setHours] = useState(24);
  const [statusFilter, setStatusFilter] = useState('open');
  const [sourceFilter, setSourceFilter] = useState('');
  const [search, setSearch] = useState('');
  // null means "loading". The handlers below set it back to null.
  const [data, setData] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Bumped by the Refresh button to load again.
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    getAdminStatus()
      .then(setAdmin)
      .catch(() => setAdmin({ is_admin: false, tracking_enabled: false }));
  }, []);

  useEffect(() => {
    if (!admin?.is_admin) return undefined;
    // Ignore an answer that arrives after the filters have changed again.
    let ignore = false;
    getErrors({ status: statusFilter, source: sourceFilter, hours })
      .then((result) => { if (!ignore) setData(result); })
      .catch(() => { if (!ignore) setLoadFailed(true); });
    return () => { ignore = true; };
  }, [admin, statusFilter, sourceFilter, hours, reloadCount]);

  // Every filter change starts a new load, so the old numbers are cleared first.
  function startLoading() {
    setData(null);
    setLoadFailed(false);
  }

  function changeFilter(setter, value) {
    startLoading();
    setter(value);
  }

  function reload() {
    startLoading();
    setReloadCount((count) => count + 1);
  }

  let body;
  if (admin === null) {
    body = <div className="flex justify-center py-20"><Spinner size={32} /></div>;
  } else if (!admin.is_admin) {
    body = (
      <div className="rounded-2xl border border-[#1a2c55] bg-[#07101f]/80 p-8 text-center text-[14px] text-[#7b88ad]">
        This page is for admins only.
      </div>
    );
  } else {
    const overview = data?.overview;
    const searchText = search.trim().toLowerCase();
    const issues = (data?.errors ?? []).filter((issue) => {
      if (!searchText) return true;
      return [issue.error_type, issue.message, issue.location, issue.path]
        .some((field) => (field || '').toLowerCase().includes(searchText));
    });
    const periodLabel = hours === 24 ? 'last 24 hours' : 'last 7 days';

    body = (
      <div className="space-y-5">
        {!admin.tracking_enabled && (
          <div className="flex items-start gap-2.5 rounded-xl border border-[#fbbf24]/40 bg-[#fbbf24]/10 px-4 py-3 text-[13px] text-[#fcd34d]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              Error tracking is switched off on this server, so no new errors are being saved.
              Set <code className="font-mono">ERROR_TRACKING_ENABLED=true</code> on the backend to turn it on.
            </span>
          </div>
        )}
        {loadFailed && (
          <div className="rounded-xl border border-[#ef4444]/40 bg-[#ef4444]/10 px-4 py-3 text-[13px] text-[#fca5a5]">
            Could not load errors. Try Refresh.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Open issues" value={data?.summary.open} sub={`${data?.summary.resolved ?? '—'} resolved`} />
          <StatTile label="New issues" value={overview?.new_issues} sub={`first seen in the ${periodLabel}`} />
          <StatTile label="Occurrences" value={overview?.occurrences} sub={periodLabel} />
          <StatTile label="Users affected" value={overview?.users_affected} sub="signed-in users who hit an error" />
        </div>

        <Panel
          title="When errors happened"
          subtitle={`Occurrences per ${overview?.bucket_minutes === 360 ? '6 hours' : 'hour'}, ${periodLabel}. Hover a bar for details.`}
        >
          {overview
            ? <TimelineChart buckets={overview.timeline} bucketMinutes={overview.bucket_minutes} />
            : <div className="flex h-[190px] items-center justify-center"><Spinner size={26} /></div>}
        </Panel>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Panel title="Where it fails" subtitle="Endpoints and pages with the most errors">
            <BarList items={overview?.top_paths} emptyText={overview ? 'No errors in this period' : 'Loading…'} />
          </Panel>
          <Panel title="Error types" subtitle="Which kinds of errors happen most">
            <BarList items={overview?.top_types} emptyText={overview ? 'No errors in this period' : 'Loading…'} />
          </Panel>
        </div>

        <section className="overflow-hidden rounded-2xl border border-[#1a2c55] bg-[#07101f]/85">
          <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
            <h2 className="text-[14px] font-semibold text-white">Issues</h2>
            <div className="flex flex-wrap items-center gap-2">
              {STATUS_FILTERS.map((f) => (
                <Pill key={f.label} active={statusFilter === f.value} onClick={() => changeFilter(setStatusFilter, f.value)}>{f.label}</Pill>
              ))}
              <span className="mx-1 hidden h-5 w-px bg-[#1a2c55] sm:block" />
              {SOURCE_FILTERS.map((f) => (
                <Pill key={f.label} active={sourceFilter === f.value} onClick={() => changeFilter(setSourceFilter, f.value)}>{f.label}</Pill>
              ))}
            </div>
            <div className="relative lg:ml-auto lg:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4e5a80]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search type, message, file, path"
                className="w-full rounded-xl border border-[#1a2c55] bg-[#040914] py-2 pl-8 pr-3 text-[13px] text-white placeholder:text-[#4e5a80] outline-none focus:border-[#3f9fff]/50"
              />
            </div>
          </div>

          <div className="hidden grid-cols-[minmax(0,1fr)_120px_90px_110px_70px_150px_16px] gap-4 border-t border-[#13204a] px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#6b78a0] md:grid">
            <span>Issue</span>
            <span>Kind</span>
            <span className="text-right">Events</span>
            <span>Trend</span>
            <span className="text-right">Users</span>
            <span>Last seen</span>
            <span />
          </div>

          {data === null && !loadFailed && <div className="flex justify-center border-t border-[#13204a] py-10"><Spinner size={26} /></div>}
          {data !== null && issues.length === 0 && (
            <div className="border-t border-[#13204a] px-4 py-10 text-center text-[13.5px] text-[#7b88ad]">
              {searchText ? 'No issues match your search.' : 'No issues here. 🎉'}
            </div>
          )}
          {issues.map((issue) => (
            <IssueRow key={issue.id} issue={issue} onOpen={(id) => navigate(`/admin/errors/${id}`)} />
          ))}
        </section>
      </div>
    );
  }

  return (
    <div className="relative px-4 sm:px-6 md:px-10">
      <Topbar
        title="Errors"
        icon={<Bug size={15} strokeWidth={2} className="hidden shrink-0 text-[#4f7fd4] lg:block" />}
        right={
          admin?.is_admin ? (
            <div className="flex items-center gap-2">
              <div className="hidden rounded-full border border-[#1a2c55] p-0.5 sm:flex">
                {PERIODS.map((p) => (
                  <button
                    key={p.hours}
                    type="button"
                    onClick={() => changeFilter(setHours, p.hours)}
                    className={`rounded-full px-3 py-1 text-[12px] font-semibold ${hours === p.hours ? 'bg-[#1a5fff] text-white' : 'text-[#7b88ad] hover:text-white'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={reload}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#1a2c55] px-3.5 py-1.5 text-[12.5px] font-semibold text-[#c7d1eb] transition hover:border-[#3f6bd4]/60"
              >
                <RefreshCw size={13} /> Refresh
              </button>
            </div>
          ) : null
        }
      />

      <main className="relative z-10 mx-auto max-w-[1200px] pb-10">
        <div className="mb-6">
          <h1 className="font-display text-[28px] font-bold text-white">Errors</h1>
          <p className="mt-1 text-[13.5px] text-[#6b78a0]">
            Crashes, failed requests, slow requests and browser errors, grouped so each bug appears once. Open one for the full report.
          </p>
        </div>
        {body}
      </main>
    </div>
  );
}
