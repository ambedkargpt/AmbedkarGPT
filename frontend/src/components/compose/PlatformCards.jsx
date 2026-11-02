import { useI18n } from '../../i18n/index.jsx';
import { PLATFORM_LOOK } from './platformLook';

// Four platform cards. The picked one takes its platform's colour as a border
// and a soft glow in the corner; each says what the platform allows.
export default function PlatformCards({ platforms, value, onChange, disabled = false }) {
  const { t } = useI18n();
  return (
    <div role="radiogroup" aria-label={t('gen.platform')} className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      {platforms.map((p) => {
        const look = PLATFORM_LOOK[p.id];
        const on = p.id === value;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(p.id)}
            className="cmp-pcard relative flex h-[64px] min-w-0 xl:h-[74px] flex-col items-start justify-center gap-1.5 overflow-hidden rounded-[14px] border px-[7px] text-left text-white disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              borderColor: on ? `rgba(${look.hue},0.75)` : '#22305c',
              background: on ? '#15224f' : '#0c1430',
            }}
          >
            <span
              aria-hidden="true"
              className="cmp-glow pointer-events-none absolute inset-0"
              style={{
                opacity: on ? 1 : 0,
                background: `radial-gradient(120px 60px at 100% 0%, rgba(${look.hue},0.35), transparent 70%)`,
              }}
            />
            <span className="relative flex max-w-full items-center gap-1">
              <span
                aria-hidden="true"
                className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] text-[12px] font-bold text-white"
                style={{ background: look.iconBg }}
              >
                {look.icon}
              </span>
              <span className="truncate text-[14px] font-semibold">{t(`cmp.plat.${p.id}`)}</span>
            </span>
            <span
              className="relative max-w-full truncate font-count text-[12px] font-medium"
              style={{ color: on ? '#c0cde8' : '#6b78a0' }}
            >
              {t(look.limitKey)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
