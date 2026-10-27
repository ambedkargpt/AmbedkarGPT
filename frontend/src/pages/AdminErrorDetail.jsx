import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Bug, Check, CheckCircle2, Copy, RefreshCw, RotateCcw } from 'lucide-react';
import Topbar from '../components/dashboard/Topbar';
import Spinner from '../components/Spinner';
import { getError, setErrorStatus } from '../api/monitoring';
import { BarList, KindBadge, Panel, StatTile, TimelineChart } from '../components/admin/ErrorCharts';
import { formatDuration, formatShortTime, formatTime, parsePythonTraceback, SERIES, toDate } from '../components/admin/errorFormat';

/**
 * One issue in depth (/admin/errors/:id), laid out in the order you need it
 * when fixing a bug:
 *
 *   1. Diagnosis    what happened, where, the likely cause, how to fix it
 *   2. Impact       how often, how many users, how slow, since when
 *   3. Timeline     when it happened
 *   4. Evidence     stack trace (our code highlighted) and the log lines the
 *                   request wrote before it failed
 *   5. Occurrences  every recent time it happened; pick one to see its logs
 *   6. Investigate  ready-to-paste Grafana / CloudWatch queries
 */

const PERIODS = [
  { hours: 24, label: '24 hours' },
  { hours: 168, label: '7 days' },
];

function CopyButton({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked; nothing else to do */
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#1a2c55] px-2 py-1 text-[11.5px] font-semibold text-[#9aa6c8] transition hover:border-[#3f6bd4]/60 hover:text-white"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : label}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6b78a0]">{label}</div>
      <div className="mt-1.5 break-words text-[13.5px] leading-relaxed text-[#d6dcf0]">{children}</div>
    </div>
  );
}

// The whole report as plain text, to paste into a ticket or a chat.
function reportAsText(issue, event) {
  const lines = [
    `[${issue.source} / ${issue.kind}] ${issue.error_type}: ${issue.message}`,
    '',
    `What happened: ${issue.insight?.what || ''}`,
    `Where: ${issue.location || '—'}`,
  ];
  if (issue.code_line) lines.push(`Code: ${issue.code_line}`);
  if (issue.root_cause) lines.push(`Root cause: ${issue.root_cause}${issue.root_cause_location ? ` at ${issue.root_cause_location}` : ''}`);
  lines.push(`Likely cause: ${issue.insight?.likely_cause || ''}`);
  (issue.insight?.how_to_fix || []).forEach((step, i) => lines.push(`  ${i + 1}. ${step}`));
  lines.push('', `Seen ${issue.count} times. First: ${formatTime(issue.first_seen)}. Last: ${formatTime(issue.last_seen)}.`);
  if (event) {
    lines.push(`Latest: ${event.method || ''} ${event.path || event.page || ''} status=${event.status ?? '—'} duration=${formatDuration(event.duration_ms)} request_id=${event.request_id || '—'}`);
    if (event.breadcrumbs?.length) {
      lines.push('', 'Log lines before it:');
      event.breadcrumbs.forEach((b) => lines.push(`  ${b.time} ${b.level} ${b.logger}: ${b.message}`));
    }
  }
  if (issue.traceback) lines.push('', 'Traceback:', issue.traceback);
  if (issue.extra?.component_stack) lines.push('', 'Component stack:', issue.extra.component_stack);
  return lines.join('\n');
}

function Diagnosis({ issue }) {
  const insight = issue.insight || {};
  return (
    <Panel title="Diagnosis">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <Field label="What happened">{insight.what}</Field>
          <Field label="Where it happened">
            <span className="font-mono text-[12.5px] text-white">{issue.location || '—'}</span>
            {issue.code_line && (
              <pre className="mt-2 overflow-x-auto rounded-lg border-l-2 border-[#ff8a7a] bg-[#040914] px-3 py-2 font-mono text-[12px] text-[#fca5a5]">
                {issue.code_line}
              </pre>
            )}
            {issue.path && (
              <div className="mt-2 text-[12.5px] text-[#9aa6c8]">
                {issue.source === 'frontend' && issue.kind === 'browser_crash' ? 'Page' : 'Endpoint'}:{' '}
                <span className="font-mono">{issue.method ? `${issue.method} ` : ''}{issue.path}</span>
              </div>
            )}
            {issue.page && issue.kind === 'api_failure' && (
              <div className="mt-1 text-[12.5px] text-[#9aa6c8]">On page: <span className="font-mono">{issue.page}</span></div>
            )}
          </Field>
        </div>
        <div className="space-y-5">
          <Field label="Likely cause">
            {issue.root_cause && (
              <div className="mb-2 rounded-lg bg-[#fbbf24]/10 px-3 py-2 font-mono text-[12.5px] text-[#fcd34d]">
                {issue.root_cause}
                {issue.root_cause_location && <div className="mt-0.5 text-[11.5px] text-[#c9a54a]">at {issue.root_cause_location}</div>}
              </div>
            )}
            {insight.likely_cause}
          </Field>
          {insight.how_to_fix?.length > 0 && (
            <Field label="How to fix it">
              <ol className="list-decimal space-y-1.5 pl-5">
                {insight.how_to_fix.map((step) => <li key={step}>{step}</li>)}
              </ol>
            </Field>
          )}
        </div>
      </div>
    </Panel>
  );
}

function FrameRow({ frame }) {
  return (
    <div className={`border-l-2 px-3 py-1.5 ${frame.ours ? 'border-[#3987e5] bg-[#3987e5]/[0.07]' : 'border-transparent'}`}>
      <div className="font-mono text-[12px]">
        <span className={frame.ours ? 'text-white' : 'text-[#6b78a0]'}>{frame.shortFile}</span>
        <span className="text-[#6b78a0]">:{frame.line} in </span>
        <span className={frame.ours ? 'text-[#86b6ef]' : 'text-[#6b78a0]'}>{frame.func}()</span>
      </div>
      {frame.code && (
        <div className={`mt-0.5 font-mono text-[11.5px] ${frame.ours ? 'text-[#d6dcf0]' : 'text-[#4e5a80]'}`}>{frame.code}</div>
      )}
    </div>
  );
}

function StackTrace({ issue }) {
  const [showLibrary, setShowLibrary] = useState(false);
  const sections = issue.source === 'backend' ? parsePythonTraceback(issue.traceback) : [];

  if (!issue.traceback) {
    return (
      <Panel title="Stack trace">
        <p className="text-[13px] text-[#6b78a0]">
          No stack trace for this kind of issue. The evidence is in the log lines and the occurrences below.
        </p>
      </Panel>
    );
  }

  if (!sections.length) {
    // Browser stacks: shown as they came. Production code is minified, so
    // the file names are bundle names; the page and component list help more.
    return (
      <Panel title="Stack trace" right={<CopyButton text={issue.traceback} />}>
        <pre className="max-h-[360px] overflow-auto whitespace-pre rounded-lg bg-[#040914] p-3 font-mono text-[11.5px] leading-relaxed text-[#c7d1eb]">
          {issue.traceback}
        </pre>
        {issue.extra?.component_stack && (
          <>
            <div className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wider text-[#6b78a0]">React components (innermost first)</div>
            <pre className="max-h-[200px] overflow-auto whitespace-pre rounded-lg bg-[#040914] p-3 font-mono text-[11.5px] text-[#c7d1eb]">
              {issue.extra.component_stack}
            </pre>
          </>
        )}
      </Panel>
    );
  }

  const libraryCount = sections.reduce((n, s) => n + s.frames.filter((f) => !f.ours).length, 0);
  return (
    <Panel
      title="Stack trace"
      subtitle="Our code is highlighted. Read from the top: the first error is the root cause."
      right={
        <div className="flex items-center gap-2">
          {libraryCount > 0 && (
            <button
              type="button"
              onClick={() => setShowLibrary((v) => !v)}
              className="rounded-md border border-[#1a2c55] px-2 py-1 text-[11.5px] font-semibold text-[#9aa6c8] hover:text-white"
            >
              {showLibrary ? 'Hide' : 'Show'} {libraryCount} library lines
            </button>
          )}
          <CopyButton text={issue.traceback} />
        </div>
      }
    >
      <div className="space-y-4">
        {sections.map((section, index) => {
          const frames = showLibrary ? section.frames : section.frames.filter((f) => f.ours);
          const hidden = section.frames.length - frames.length;
          let label = 'Error';
          if (sections.length > 1) label = index === 0 ? 'Root cause' : index === sections.length - 1 ? 'Final error' : 'Then';
          return (
            <div key={index} className="overflow-hidden rounded-xl border border-[#13204a] bg-[#040914]">
              <div className="flex items-center gap-2 border-b border-[#13204a] px-3 py-2">
                <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-[#9aa6c8]">{label}</span>
                <span className="truncate font-mono text-[12.5px] text-[#fca5a5]">{section.error}</span>
              </div>
              <div className="py-1">
                {frames.map((frame, i) => <FrameRow key={`${frame.file}:${frame.line}:${i}`} frame={frame} />)}
                {hidden > 0 && <div className="px-3 py-1 text-[11.5px] text-[#4e5a80]">{hidden} library lines hidden</div>}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

const LEVEL_COLOR = { ERROR: '#ff8a7a', CRITICAL: '#ff8a7a', WARNING: '#fbbf24', INFO: '#86b6ef', DEBUG: '#6b78a0' };

function Breadcrumbs({ event }) {
  const crumbs = event?.breadcrumbs || [];
  return (
    <Panel
      title="What the request logged before it failed"
      subtitle={event ? `Occurrence at ${formatTime(event.time)}. Pick another one in the table below.` : 'No occurrence selected'}
    >
      {crumbs.length === 0 ? (
        <p className="text-[13px] text-[#6b78a0]">
          No log lines were recorded for this occurrence. Only requests on the server have them, and only lines our code
          writes at INFO or above (on the Lambda, LOG_LEVEL=INFO).
        </p>
      ) : (
        <div className="max-h-[340px] overflow-auto rounded-lg bg-[#040914] py-1 font-mono text-[11.5px]">
          {crumbs.map((crumb, index) => (
            <div key={index} className="flex gap-3 px-3 py-1 hover:bg-white/[0.03]">
              <span className="shrink-0 text-[#4e5a80]">{toDate(crumb.time)?.toLocaleTimeString()}</span>
              <span className="w-16 shrink-0 font-semibold" style={{ color: LEVEL_COLOR[crumb.level] || '#9aa6c8' }}>{crumb.level}</span>
              <span className="hidden w-48 shrink-0 truncate text-[#6b78a0] lg:block" title={crumb.logger}>{crumb.logger}</span>
              <span className="min-w-0 break-words text-[#d6dcf0]">{crumb.message}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function Occurrences({ events, selectedId, onSelect }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#1a2c55] bg-[#07101f]/85">
      <div className="p-4">
        <h2 className="text-[14px] font-semibold text-white">Occurrences</h2>
        <p className="mt-0.5 text-[12px] text-[#6b78a0]">The latest {events.length}. Click one to see what it logged.</p>
      </div>
      {events.length === 0 && (
        <div className="border-t border-[#13204a] px-4 py-8 text-center text-[13px] text-[#6b78a0]">None in this period.</div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[12.5px]">
          {events.length > 0 && (
            <thead>
              <tr className="border-t border-[#13204a] text-[11px] uppercase tracking-wider text-[#6b78a0]">
                <th className="px-4 py-2 font-semibold">Time</th>
                <th className="px-4 py-2 font-semibold">Request / page</th>
                <th className="px-4 py-2 text-right font-semibold">Status</th>
                <th className="px-4 py-2 text-right font-semibold">Duration</th>
                <th className="px-4 py-2 font-semibold">User</th>
                <th className="px-4 py-2 font-semibold">Request id</th>
              </tr>
            </thead>
          )}
          <tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
            {events.map((event) => (
              <tr
                key={event.id}
                onClick={() => onSelect(event.id)}
                className={`cursor-pointer border-t border-[#13204a] transition ${event.id === selectedId ? 'bg-[#0f1a3c]' : 'hover:bg-[#0f1a3c]/60'}`}
              >
                <td className="whitespace-nowrap px-4 py-2.5 text-[#c7d1eb]">{formatTime(event.time)}</td>
                <td className="max-w-[260px] truncate px-4 py-2.5 font-mono text-[#c7d1eb]">
                  {event.method ? `${event.method} ` : ''}{event.path || event.page || '—'}
                </td>
                <td className="px-4 py-2.5 text-right text-[#c7d1eb]">{event.status ?? '—'}</td>
                <td className="px-4 py-2.5 text-right text-[#c7d1eb]">{formatDuration(event.duration_ms)}</td>
                <td className="max-w-[140px] truncate px-4 py-2.5 font-mono text-[#9aa6c8]">{event.user_id || '—'}</td>
                <td className="px-4 py-2.5">
                  {event.request_id ? (
                    <span className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <span className="max-w-[120px] truncate font-mono text-[#9aa6c8]" title={event.request_id}>{event.request_id}</span>
                      <CopyButton text={event.request_id} label="" />
                    </span>
                  ) : <span className="text-[#4e5a80]">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function AdminErrorDetail() {
  const { id } = useParams();
  const [hours, setHours] = useState(168);
  // null while loading; { failed: 403 | 404 | 'other' } when it could not load.
  const [issue, setIssue] = useState(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [changingStatus, setChangingStatus] = useState(false);

  useEffect(() => {
    let ignore = false;
    getError(id, hours)
      .then((result) => { if (!ignore) setIssue(result); })
      .catch((err) => {
        const code = err?.response?.status;
        if (!ignore) setIssue({ failed: code === 403 || code === 404 ? code : 'other' });
      });
    return () => { ignore = true; };
  }, [id, hours, reloadCount]);

  function reload(nextHours = hours) {
    setIssue(null);
    setHours(nextHours);
    setReloadCount((count) => count + 1);
  }

  async function changeStatus(status) {
    setChangingStatus(true);
    try {
      await setErrorStatus(id, status);
      setIssue((current) => ({ ...current, status }));
    } catch {
      /* the button simply becomes usable again */
    } finally {
      setChangingStatus(false);
    }
  }

  let body;
  if (issue === null) {
    body = <div className="flex justify-center py-20"><Spinner size={32} /></div>;
  } else if (issue.failed) {
    const text = issue.failed === 403
      ? 'This page is for admins only.'
      : issue.failed === 404 ? 'This issue does not exist any more. Issues not seen for 60 days are deleted.' : 'Could not load this issue. Try Refresh.';
    body = <div className="rounded-2xl border border-[#1a2c55] bg-[#07101f]/80 p-8 text-center text-[14px] text-[#7b88ad]">{text}</div>;
  } else {
    const events = issue.events || [];
    const selected = events.find((e) => e.id === selectedEventId) || events[0] || null;
    const stats = issue.stats || {};
    const isResolved = issue.status === 'resolved';
    const periodLabel = hours === 24 ? 'last 24 hours' : 'last 7 days';
    const series = [issue.source === 'frontend' ? SERIES.frontend : SERIES.backend];

    body = (
      <div className="space-y-5">
        {/* Heading */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <KindBadge kind={issue.kind} />
            <span className="text-[12px] text-[#6b78a0]">{issue.source === 'frontend' ? 'Browser' : 'Backend'}</span>
            {isResolved
              ? <span className="text-[12px] font-semibold text-[#22c55e]">✓ Marked as fixed</span>
              : <span className="text-[12px] font-semibold text-[#ff8a7a]">● Open</span>}
          </div>
          <h1 className="mt-2 break-words font-display text-[24px] font-bold leading-tight text-white">
            {issue.error_type}: <span className="font-semibold text-[#d6dcf0]">{issue.message}</span>
          </h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => changeStatus(isResolved ? 'open' : 'resolved')}
              disabled={changingStatus}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1a5fff] px-3.5 py-2 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {isResolved ? <RotateCcw size={14} /> : <CheckCircle2 size={14} />}
              {isResolved ? 'Reopen' : 'Mark as fixed'}
            </button>
            <CopyButton text={reportAsText(issue, selected)} label="Copy full report" />
          </div>
          {!isResolved && (
            <p className="mt-2 text-[12px] text-[#6b78a0]">If it happens again after being marked as fixed, it reopens by itself.</p>
          )}
        </div>

        <Diagnosis issue={issue} />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatTile label="All time" value={issue.count} sub="times in total" />
          <StatTile label="In period" value={stats.events_in_period} sub={periodLabel} />
          <StatTile label="Users affected" value={stats.users_affected} sub={periodLabel} />
          <StatTile label="Slowest" value={formatDuration(stats.slowest_ms)} sub={`avg ${formatDuration(stats.average_ms)}`} />
          <StatTile label="First seen" value={formatShortTime(issue.first_seen, true)} />
          <StatTile label="Last seen" value={formatShortTime(issue.last_seen, true)} />
        </div>

        <Panel
          title="When it happened"
          subtitle={`Occurrences per ${issue.bucket_minutes === 360 ? '6 hours' : 'hour'}, ${periodLabel}`}
        >
          <TimelineChart buckets={issue.timeline || []} bucketMinutes={issue.bucket_minutes} series={series} />
        </Panel>

        <StackTrace issue={issue} />
        <Breadcrumbs event={selected} />
        <Occurrences events={events} selectedId={selected?.id} onSelect={setSelectedEventId} />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Panel title="Where it happened" subtitle={`Endpoints and pages, ${periodLabel}`}>
            <BarList items={stats.paths} emptyText="None in this period" />
          </Panel>
          <Panel title="Investigate further" subtitle="Paste into Grafana Explore (logs data source) or CloudWatch Logs Insights">
            {issue.investigate?.length ? (
              <ul className="space-y-3">
                {issue.investigate.map((q) => (
                  <li key={q.label}>
                    <div className="mb-1 text-[12px] text-[#9aa6c8]">{q.label}</div>
                    <div className="flex items-start gap-2">
                      <code className="min-w-0 flex-1 break-all rounded-lg bg-[#040914] px-3 py-2 font-mono text-[11.5px] text-[#c7d1eb]">{q.query}</code>
                      <CopyButton text={q.query} label="" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-[13px] text-[#6b78a0]">No request ids recorded for this issue.</p>}
          </Panel>
        </div>
      </div>
    );
  }

  return (
    <div className="relative px-4 sm:px-6 md:px-10">
      <Topbar
        title="Error report"
        icon={<Bug size={15} strokeWidth={2} className="hidden shrink-0 text-[#4f7fd4] lg:block" />}
        right={
          <div className="flex items-center gap-2">
            <div className="hidden rounded-full border border-[#1a2c55] p-0.5 sm:flex">
              {PERIODS.map((p) => (
                <button
                  key={p.hours}
                  type="button"
                  onClick={() => reload(p.hours)}
                  className={`rounded-full px-3 py-1 text-[12px] font-semibold ${hours === p.hours ? 'bg-[#1a5fff] text-white' : 'text-[#7b88ad] hover:text-white'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => reload()}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#1a2c55] px-3.5 py-1.5 text-[12.5px] font-semibold text-[#c7d1eb] transition hover:border-[#3f6bd4]/60"
            >
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        }
      />

      <main className="relative z-10 mx-auto max-w-[1200px] pb-10">
        <Link to="/admin/errors" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-[#7b88ad] hover:text-white">
          <ArrowLeft size={14} /> All errors
        </Link>
        {body}
      </main>
    </div>
  );
}
