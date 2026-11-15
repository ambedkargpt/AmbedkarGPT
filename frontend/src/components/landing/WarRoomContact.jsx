import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Phone, X } from 'lucide-react';

import { PLATFORM_ICON } from '../generate/platformIcons';

// The team's number for war-room enquiries, the same one RSS-GPT gives.
const PHONE_DISPLAY = '+44 7306 687100';
const PHONE_E164 = '+447306687100';

/**
 * "Open your war room": a war room is set up with the team, so the button opens
 * this, with the number to call or message on WhatsApp. A modal dialog: focus
 * moves in, Tab stays inside, Escape or the backdrop closes it. Portalled to
 * the body, so no transformed ancestor on the landing page can pin it.
 */
export default function WarRoomContact({ open, onClose, copy }) {
  const ref = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    ref.current?.querySelector('a, button')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !ref.current) return;
      const items = [...ref.current.querySelectorAll('a, button')];
      const first = items[0];
      const last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const copyNumber = () => {
    navigator.clipboard?.writeText(PHONE_DISPLAY).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  };
  const wa = `https://wa.me/${PHONE_E164.slice(1)}?text=${encodeURIComponent(copy.contactMessage)}`;
  const WhatsApp = PLATFORM_ICON.whatsapp;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-[#030611]/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wr-contact-title"
        className="relative w-full max-w-[440px] overflow-hidden rounded-t-[28px] border border-[#24396b] bg-[#081027] text-white shadow-[0_40px_90px_-30px_rgba(0,0,0,0.9)] sm:rounded-[28px]"
      >
        <div className="relative flex flex-col gap-5 p-6 pb-[max(24px,env(safe-area-inset-bottom))] sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#e5484d]/40 bg-[#e5484d]/10 px-3 py-1 text-[13px] font-bold text-[#ffb3b5]">
              <span className="h-2 w-2 rounded-full bg-[#ff5a5f]" />
              {copy.eyebrow}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label={copy.contactClose}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#24396b] text-[#cfe0ff] transition hover:bg-white/[0.06] hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <h2 id="wr-contact-title" className="font-display text-[30px] font-bold leading-tight sm:text-[34px]">{copy.contactTitle}</h2>
            <p className="text-[16.5px] leading-relaxed text-[#b4c3e2]">{copy.contactBody}</p>
          </div>

          <button
            type="button"
            onClick={copyNumber}
            aria-label={`${copy.contactCopy}: ${PHONE_DISPLAY}`}
            className="flex flex-col items-start gap-1.5 rounded-2xl border border-[#24396b] bg-[#0a1130] px-5 py-4 text-left transition hover:border-[#3f9fff]"
          >
            <span dir="ltr" className="font-count whitespace-nowrap text-[26px] font-semibold tabular-nums text-white sm:text-[28px]">{PHONE_DISPLAY}</span>
            <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#8fb3ff]">
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? copy.contactCopied : copy.contactCopy}
            </span>
          </button>

          <div className="grid gap-2.5">
            <a
              href={`tel:${PHONE_E164}`}
              className="btn-gradient inline-flex min-h-14 items-center justify-center gap-2.5 rounded-2xl px-5 text-[17px] font-semibold text-white"
            >
              <Phone size={19} />
              {copy.contactCall}
            </a>
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-14 items-center justify-center gap-2.5 rounded-2xl bg-[#25D366] px-5 text-[17px] font-semibold text-[#06210F] transition hover:bg-[#2FE277]"
            >
              <WhatsApp width={20} height={20} />
              {copy.contactWhatsapp}
            </a>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
