import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, RefreshCw } from 'lucide-react';

import { getPost } from '../api/posts';
import { PLATFORM_ICON } from '../components/generate/platformIcons';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/index.jsx';
import { labelForId } from '../utils/partyRoles';
import { parsePost } from '../utils/parsePost';
import { drawPostImage, partyKey } from '../utils/postImage';
import { canShareFile, downloadFile, SHARE_PLATFORMS, shareImage } from '../utils/shareImage';

const PLATFORM = {
  whatsapp: { label: 'WhatsApp', bg: '#25d366', ink: '#04220f' },
  facebook: { label: 'Facebook', bg: '#1877f2', ink: '#ffffff' },
  twitter:  { label: 'X',        bg: '#0f1419', ink: '#ffffff', ring: true },
  reddit:   { label: 'Reddit',   bg: '#ff4500', ink: '#ffffff' },
};

/**
 * The post as an image, on a page of its own (/generate/social-media/image/:postId),
 * opened from "Make an image" on a written post. The card (utils/postImage.js)
 * in a dark or light look, a download, and a share button per platform
 * (utils/shareImage.js says what a share can and cannot do from a website).
 */
export default function PostImage() {
  const { postId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { t, lang } = useI18n();
  const canvasRef = useRef(null);
  const [post, setPost] = useState(null);
  const [failed, setFailed] = useState(false);
  const [look, setLook] = useState('dark');
  const [file, setFile] = useState(null);     // the drawn card as a PNG, ready for a click
  const [note, setNote] = useState('');

  useEffect(() => {
    let live = true;
    getPost(postId).then((p) => { if (live) setPost(p); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [postId]);

  const author = currentUser?.is_guest ? t('guest.name') : (currentUser?.full_name || currentUser?.username || '');
  const role = labelForId(currentUser?.party_position || '', currentUser?.political_party || '', lang);
  const text = post?.content || '';

  useEffect(() => {
    if (!post || !canvasRef.current) return undefined;
    let live = true;
    setFile(null);
    const { headline, paragraphs, hashtags } = parsePost(post.content);
    drawPostImage(canvasRef.current, {
      headline: headline || paragraphs[0] || '',
      body: (headline ? paragraphs : paragraphs.slice(1)).join('\n'),
      hashtags,
      party: partyKey(currentUser?.political_party),
      look,
      card: post.generation_meta?.post_parts?.card || {},
      author,
      role,
    }).then(() => new Promise((resolve) => canvasRef.current?.toBlob(resolve, 'image/png')))
      .then((blob) => {
        if (live && blob) setFile(new File([blob], `ambedkargpt-post-${post.id}-${look}.png`, { type: 'image/png' }));
      });
    return () => { live = false; };
  }, [post, look, currentUser?.political_party, author, role]);

  function back() {
    if (window.history.length > 1) navigate(-1);
    else navigate(`/generate/social-media?post=${postId}`);
  }

  function share(platform) {
    if (!file) return;
    setNote('');
    shareImage({ file, text, platform }).then((how) => {
      if (how === 'opened') setNote(t('img.share.opened', { platform: PLATFORM[platform].label }));
    });
  }

  const sheet = file ? canShareFile(file) : false;

  return (
    <div className="min-h-screen bg-[#060b1f] px-4 pb-12 pt-5 text-white sm:px-8">
      <div className="mx-auto max-w-[1180px]">
        <button
          type="button"
          onClick={back}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#24396b] bg-[#0a1130] px-4 text-[15px] font-semibold text-[#cfe0ff] transition hover:border-[#3f9fff] hover:text-white"
        >
          <ArrowLeft size={17} />
          {t('img.back')}
        </button>
        <h1 className="mt-5 font-display text-[28px] font-bold leading-tight sm:text-[34px]">{t('img.title')}</h1>

        {failed ? (
          <p role="alert" className="mt-6 text-[17px] text-[#f0d9b8]">{t('img.notFound')}</p>
        ) : (
          <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,640px)_minmax(0,1fr)] lg:gap-10">
            {/* The card, as it will be saved. */}
            <div className="relative mx-auto aspect-square w-full max-w-[640px] overflow-hidden rounded-2xl border border-white/10 bg-[#050a1c] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]">
              <canvas ref={canvasRef} aria-label={t('img.preview')} className="block h-full w-full" />
              {!file && (
                <div className="absolute inset-0 grid place-items-center text-[#9aa8cc]">
                  <RefreshCw size={24} className="animate-spin" aria-hidden="true" />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-5">
              <div>
                <p className="mb-2 text-[14px] font-semibold text-[#9fb0d4]">{t('img.look')}</p>
                <div role="radiogroup" aria-label={t('img.look')} className="grid grid-cols-2 gap-1 rounded-2xl border border-[#24396b] bg-[#0a1130] p-1">
                  {['dark', 'light'].map((id) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={look === id}
                      onClick={() => setLook(id)}
                      className={`h-11 rounded-xl text-[15px] font-semibold transition ${look === id ? 'bg-[#1d4ed8] text-white' : 'text-[#9fb0d4] hover:text-white'}`}
                    >
                      {t(`img.look.${id}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[14px] font-semibold text-[#9fb0d4]">{t('img.shareTo')}</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {SHARE_PLATFORMS.map((p) => {
                    const Icon = PLATFORM_ICON[p];
                    const c = PLATFORM[p];
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => share(p)}
                        disabled={!file}
                        className="inline-flex min-h-[54px] items-center justify-center gap-2.5 rounded-2xl px-4 text-[16px] font-bold transition hover:brightness-110 disabled:opacity-50"
                        style={{ background: c.bg, color: c.ink, boxShadow: c.ring ? 'inset 0 0 0 1.5px rgba(255,255,255,0.25)' : undefined }}
                      >
                        {Icon && <Icon width={20} height={20} />}
                        {c.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2.5 text-[13.5px] leading-relaxed text-[#9aa8cc]">{sheet ? t('img.share.sheet') : t('img.share.how')}</p>
                {note && <p role="status" className="mt-2 text-[14px] font-semibold text-[#fbbf24]">{note}</p>}
              </div>

              <button
                type="button"
                onClick={() => file && downloadFile(file)}
                disabled={!file}
                className="btn-gradient inline-flex min-h-[54px] items-center justify-center gap-2 rounded-2xl px-6 text-[17px] font-bold text-white disabled:opacity-50"
              >
                <Download size={18} />
                {t('img.download')}
              </button>
              <p className="text-[13px] text-[#7f8db3]">{t('img.note')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
