import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, FileText, CheckCircle2, Loader2 } from 'lucide-react';

import { contributeToCorpus } from '../../api/contact';
import { useI18n } from '../../i18n/index.jsx';

const MAX_MB = 200;
const ACCEPT = '.pdf,.epub,.doc,.docx,.txt,.rtf,.odt,.jpg,.jpeg,.png,.tif,.tiff,.mp3,.wav,.m4a,.ogg,.mp4,.zip';

const input =
  'w-full rounded-xl border border-[#1e3260] bg-[#0b1330] px-4 py-3 text-[15px] text-white outline-none transition placeholder:text-[#4a5f84] focus:border-[#3f6bd4] focus:shadow-[0_0_0_3px_rgba(63,107,212,0.18)]';

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-[#9db6dc]">
        {label}{required && <span className="text-[#f0a04b]"> *</span>}
      </span>
      {children}
    </label>
  );
}

/**
 * "Contribute to Corpus": who is sending it, what it is, and the file itself.
 * The file goes straight to storage (see contributeToCorpus); a person on the
 * team reviews every contribution before anything is used.
 */
export default function CorpusContributeModal({ onClose }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: '', email: '', phone: '', title: '', author: '', language: '', description: '', website: '' });
  const [file, setFile] = useState(null);
  const [rights, setRights] = useState(false);
  const [state, setState] = useState('idle');   // idle | sending | done
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && state !== 'sending') onClose(); }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose, state]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function pickFile(f) {
    setError('');
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) { setError(t('corpusForm.tooBig', { mb: MAX_MB })); return; }
    setFile(f);
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!file) { setError(t('corpusForm.needFile')); return; }
    if (!rights) { setError(t('corpusForm.needRights')); return; }
    setState('sending');
    setProgress(0);
    try {
      await contributeToCorpus({
        ...form,
        phone: form.phone || null,
        author: form.author || null,
        language: form.language || null,
        description: form.description || null,
        rights_confirmed: true,
        file,
        onProgress: setProgress,
      });
      setState('done');
    } catch (err) {
      setState('idle');
      setError(err?.response?.data?.detail && typeof err.response.data.detail === 'string'
        ? err.response.data.detail
        : t('corpusForm.failed'));
    }
  }

  // Into document.body: the landing sections sit inside transformed ancestors,
  // which would trap a fixed panel inside them (see CorpusContactModal).
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto p-4 sm:items-center"
      style={{ backgroundColor: 'rgba(3,6,17,0.82)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget && state !== 'sending') onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="corpus-contribute-title"
    >
      <div className="relative my-6 flex w-full max-w-[620px] flex-col rounded-2xl border border-[#1e3260] bg-[#080e24] shadow-[0_32px_80px_rgba(0,0,0,0.7)]">
        <div className="flex items-center justify-between border-b border-[#1a2c55] px-6 py-5 sm:px-7">
          <h2 id="corpus-contribute-title" className="font-display text-[22px] font-semibold text-white">
            {t('corpusForm.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={state === 'sending'}
            aria-label={t('bot.close')}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#1e3260] text-[#8b94b8] transition hover:border-[#3a6bc4] hover:text-white disabled:opacity-40"
          >
            <X size={17} />
          </button>
        </div>

        {state === 'done' ? (
          <div className="flex flex-col items-center px-7 py-10 text-center">
            <CheckCircle2 size={44} className="text-[#22c55e]" />
            <p className="mt-4 text-[18px] font-semibold text-white">{t('corpusForm.thanksTitle')}</p>
            <p className="mt-2 max-w-[440px] text-[15px] leading-relaxed text-[#9db6dc]">{t('corpusForm.thanksBody')}</p>
            <button type="button" onClick={onClose} className="btn-gradient mt-6 inline-flex h-12 items-center justify-center rounded-xl px-8 font-count text-[15px] font-semibold text-white">
              {t('corpusForm.done')}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 px-6 py-6 sm:px-7" noValidate={false}>
            <p className="text-[14.5px] leading-relaxed text-[#9db6dc]">{t('corpusForm.intro')}</p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('corpusForm.name')} required>
                <input className={input} value={form.name} onChange={set('name')} required minLength={2} maxLength={120} autoComplete="name" />
              </Field>
              <Field label={t('corpusForm.email')} required>
                <input className={input} type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
              </Field>
              <Field label={t('corpusForm.phone')}>
                <input className={input} type="tel" value={form.phone} onChange={set('phone')} maxLength={40} autoComplete="tel" />
              </Field>
              <Field label={t('corpusForm.language')}>
                <input className={input} value={form.language} onChange={set('language')} maxLength={60} placeholder={t('corpusForm.languageHint')} />
              </Field>
              <Field label={t('corpusForm.bookTitle')} required>
                <input className={input} value={form.title} onChange={set('title')} required minLength={2} maxLength={300} />
              </Field>
              <Field label={t('corpusForm.author')}>
                <input className={input} value={form.author} onChange={set('author')} maxLength={200} />
              </Field>
            </div>

            <Field label={t('corpusForm.description')}>
              <textarea className={`${input} min-h-[90px] resize-y`} value={form.description} onChange={set('description')} maxLength={3000} placeholder={t('corpusForm.descriptionHint')} />
            </Field>

            {/* Hidden from people; a bot that fills every field fills this too. */}
            <input type="text" name="website" value={form.website} onChange={set('website')} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-[#9db6dc]">
                {t('corpusForm.file')}<span className="text-[#f0a04b]"> *</span>
              </span>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0]); }}
                className="flex w-full items-center gap-3 rounded-xl border border-dashed border-[#3a5a9a] bg-[#0b1330] px-4 py-5 text-left transition hover:border-[#4d94ff]"
              >
                {file ? <FileText size={22} className="shrink-0 text-[#7fb5ff]" /> : <Upload size={22} className="shrink-0 text-[#7fb5ff]" />}
                <span className="min-w-0">
                  <span className="block truncate text-[14.5px] font-medium text-white">
                    {file ? file.name : t('corpusForm.choose')}
                  </span>
                  <span className="block text-[12.5px] text-[#6f86ad]">
                    {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : t('corpusForm.fileHint', { mb: MAX_MB })}
                  </span>
                </span>
              </button>
              <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
            </div>

            <label className="flex items-start gap-2.5 text-[13.5px] leading-snug text-[#c3d3ec]">
              <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#2d6fff]" />
              {t('corpusForm.rights')}
            </label>

            {error && <p role="alert" className="text-[13.5px] text-[#ff9a9a]">{error}</p>}

            {state === 'sending' && (
              <div>
                <div className="h-2 overflow-hidden rounded-full bg-[#1a2c55]">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#3f9fff] to-[#7b5cff] transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <p className="mt-1.5 text-[12.5px] text-[#6f86ad]">{t('corpusForm.uploading', { pct: Math.round(progress * 100) })}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={state === 'sending'}
              className="btn-gradient inline-flex h-13 w-full items-center justify-center gap-2 rounded-xl py-3.5 font-count text-[16px] font-semibold text-white disabled:opacity-70"
            >
              {state === 'sending' ? <Loader2 size={17} className="animate-spin" /> : <Upload size={17} />}
              {state === 'sending' ? t('corpusForm.sending') : t('corpusForm.submit')}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
