import PravartanIntro from './brand/PravartanIntro';
import { useCurtain } from '../context/CurtainContext';
import { useI18n } from '../i18n/index.jsx';

export default function TransitionCurtain() {
  const { t } = useI18n();
  const { active } = useCurtain();

  if (!active) return null;

  return (
    <div
      className="curtain-enter fixed inset-0 z-[150] flex flex-col items-center justify-center"
      style={{ background: 'radial-gradient(ellipse at 50% 40%, #0e1d4a 0%, #080e22 50%, #04080f 100%)' }}
    >
      {/* curtain fades out */}
      <div className="curtain-reveal absolute inset-0 bg-[#04080f]" />

      {/* logo + wordmark sit above the curtain */}
      <div className="relative z-10">
        <PravartanIntro size={96} caption={t('loader.dashboard')} />
      </div>
    </div>
  );
}
