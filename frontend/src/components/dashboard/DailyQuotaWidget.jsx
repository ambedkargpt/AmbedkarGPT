import { Zap, Flame, AlertTriangle, Trophy } from 'lucide-react';
import { useI18n } from '../../i18n/index.jsx';

const DAILY_LIMIT = 5;
const MILESTONE   = 200;

/**
 * quota prop shape (from GET /posts/daily-quota):
 * { daily_used, daily_limit, daily_remaining, reset_at,
 *   total_posts, streak_days, total_streak_posts,
 *   streak_at_risk, streak_broken, milestone_target }
 */
export default function DailyQuotaWidget({ quota, loading }) {
  const { t } = useI18n();

  if (loading) {
    return (
      <div className="dash-panel space-y-3 p-4 sm:p-5">
        <div className="h-3 w-28 animate-pulse rounded bg-[#1e3260]/60" />
        <div className="h-2 w-full animate-pulse rounded-full bg-[#1e3260]/40" />
        <div className="h-2 w-3/4 animate-pulse rounded-full bg-[#1e3260]/30" />
      </div>
    );
  }

  if (!quota) return null;

  const {
    daily_used = 0,
    daily_remaining = DAILY_LIMIT,
    streak_days = 0,
    total_streak_posts = 0,
    streak_at_risk = false,
    streak_broken = false,
  } = quota;

  const atLimit       = daily_remaining === 0;
  const dailyPct      = Math.min((daily_used / DAILY_LIMIT) * 100, 100);
  const milestonePct  = Math.min((total_streak_posts / MILESTONE) * 100, 100);

  return (
    <div className="dash-panel space-y-4 p-4 sm:p-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#3f9fff] to-[#7b5cff]">
            <Zap size={13} strokeWidth={2.2} className="text-white" />
          </span>
          <h3 className="font-display text-[15px] font-semibold text-white">{t('quota.dailyPosts')}</h3>
        </div>
        {/* Streak badge */}
        {streak_days > 0 && (
          <div
            className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-count text-[11.5px] font-bold tabular-nums"
            style={{
              background: streak_days >= 7 ? 'linear-gradient(90deg,#ff6b35,#f59e0b)' : 'rgba(245,158,11,0.13)',
              color: streak_days >= 7 ? 'white' : '#f59e0b',
              border: streak_days >= 7 ? 'none' : '1px solid rgba(245,158,11,0.32)',
              boxShadow: streak_days >= 7 ? '0 0 16px rgba(245,158,11,0.35)' : 'none',
            }}
          >
            <Flame size={12} strokeWidth={2.4} />
            {streak_days} day{streak_days !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Streak broken notice */}
      {streak_broken && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/8 px-3 py-2.5">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-400" strokeWidth={2} />
          <p className="text-[12px] leading-snug text-red-400">
            <span className="font-semibold">{t('quota.streakLost')}</span> {t('quota.resetToZero')}
          </p>
        </div>
      )}

      {/* Streak at risk */}
      {streak_at_risk && !streak_broken && streak_days > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2.5">
          <Flame size={14} className="mt-0.5 shrink-0 text-amber-400" strokeWidth={2} />
          <p className="text-[12px] leading-snug text-amber-400">
            <span className="font-semibold">{t('quota.publishToday')}</span> {t('quota.protectStreak', { days: streak_days })}
          </p>
        </div>
      )}

      {/* Today's goal */}
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="dash-eyebrow">{t('quota.todayGoal')}</span>
          <span className="font-count text-[13.5px] font-bold tabular-nums text-white">
            {daily_used} <span className="text-[#6f7fa8]">/ {DAILY_LIMIT}</span>
          </span>
        </div>
        <div className="mb-1.5 flex items-center justify-between gap-3 text-[11.5px]">
          <span className="text-[#8b94b8]">
            {atLimit ? t('quota.limitReached') : t('quota.publishedToday', { done: daily_used, total: DAILY_LIMIT })}
          </span>
          <span className={`shrink-0 font-semibold ${atLimit ? 'text-red-400' : 'text-[#6aa8ff]'}`}>
            {atLimit ? t('quota.zeroLeft') : t('quota.left', { n: daily_remaining })}
          </span>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-[#1e3260]/50">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${dailyPct}%`,
              background: atLimit
                ? 'linear-gradient(90deg,#ef4444,#dc2626)'
                : 'linear-gradient(90deg,#3f9fff,#7b5cff)',
              boxShadow: atLimit ? '0 0 8px rgba(239,68,68,0.4)' : '0 0 8px rgba(63,159,255,0.35)',
            }}
          />
        </div>

        {/* The 0–5 pip row that used to sit here was 9.5px type saying what
            the count above it already says in full size. */}
      </div>

      {/* Countdown at limit */}
      {atLimit && (
        <div className="flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/8 px-3.5 py-2.5">
          <span className="text-[14px] text-red-300">{t('quota.limitReached')}</span>
          <span className="text-[14px] font-bold text-red-300">{t('quota.zeroLeft')}</span>
        </div>
      )}

      {/* Milestone streak progress */}
      <div className="border-t border-[#1a254a]/60 pt-4">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="dash-eyebrow inline-flex items-center gap-1.5">
            <Trophy size={11} strokeWidth={2.2} className="text-amber-400" />
            {t('quota.milestone')}
          </span>
          <span className="font-count text-[13.5px] font-bold tabular-nums text-white">
            {total_streak_posts} <span className="text-[#6f7fa8]">/ {MILESTONE}</span>
            <span className="ml-2 rounded-md bg-amber-400/12 px-1.5 py-0.5 text-[12px] text-amber-300">₹2,000</span>
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1e3260]/50">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${milestonePct}%`,
              background: 'linear-gradient(90deg,#f59e0b,#fbbf24)',
              boxShadow: '0 0 8px rgba(245,158,11,0.45)',
            }}
          />
        </div>
        <p className="mt-2 text-[11.5px] leading-snug text-[#6b78a0]">
          {t('quota.streakNote')}
        </p>
      </div>
    </div>
  );
}
