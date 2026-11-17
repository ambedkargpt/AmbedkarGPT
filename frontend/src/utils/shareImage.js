/**
 * Sharing the post's image to a platform.
 *
 * No platform lets a website attach an image to a share link (wa.me, the X
 * intent and Reddit's submit page take text only; Facebook's takes a public
 * URL). So:
 *  - where the browser can share files (phones, and Edge or Chrome on
 *    Windows), the image goes into the system share sheet with the post's
 *    text, and the person picks the app there;
 *  - elsewhere the image is downloaded, the text copied, and the platform's
 *    compose page opened, for the person to attach the image they just saved.
 *
 * Both have to start inside the click, with nothing awaited before them, or
 * the browser refuses the share sheet and blocks the new tab. So the page
 * makes the file as soon as the card is drawn and hands it in ready.
 */

export const SHARE_PLATFORMS = ['whatsapp', 'facebook', 'twitter', 'reddit'];

/** The compose page for a platform, with as much of the text as it takes. */
export function composeUrl(platform, text) {
  const enc = encodeURIComponent;
  const t = String(text || '').trim();
  if (platform === 'whatsapp') return `https://wa.me/?text=${enc(t.slice(0, 1500))}`;
  if (platform === 'twitter') return `https://twitter.com/intent/tweet?text=${enc(t.slice(0, 270))}`;
  if (platform === 'reddit') return `https://www.reddit.com/submit?type=IMAGE&title=${enc(t.split('\n')[0].slice(0, 300))}`;
  if (platform === 'facebook') return 'https://www.facebook.com/';
  return null;
}

/** Whether this browser can put a file into the system share sheet. */
export function canShareFile(file) {
  try {
    return Boolean(file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
  } catch {
    return false;
  }
}

export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Shares `file` (the PNG) with `text` to `platform`. Call straight from the
 * click. Resolves to 'shared' (the share sheet took it), 'cancelled', or
 * 'opened' (downloaded, text copied, the platform opened in a new tab).
 */
export function shareImage({ file, text, platform }) {
  if (canShareFile(file)) {
    return navigator.share({ files: [file], text })
      .then(() => 'shared')
      .catch((err) => (err?.name === 'AbortError' ? 'cancelled' : fallback()));
  }
  return Promise.resolve(fallback());

  function fallback() {
    const url = composeUrl(platform, text);
    if (url) window.open(url, '_blank', 'noopener');
    downloadFile(file);
    navigator.clipboard?.writeText(text).catch(() => {});
    return 'opened';
  }
}
