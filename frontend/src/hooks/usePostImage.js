import { useEffect, useRef, useState } from 'react';

import { parsePost } from '../utils/parsePost';
import { drawPostImage, partyKey } from '../utils/postImage';

/**
 * The post drawn on the image card (utils/postImage.js), kept ready as a PNG
 * file for a click to download or share (a share must start inside the click,
 * with nothing awaited first). Draws only while `active`, and again whenever
 * the words, the look or the writer change.
 */
export default function usePostImage({ active, content, card, politicalParty, look, author, role, name }) {
  const canvasRef = useRef(null);
  const [file, setFile] = useState(null);

  useEffect(() => {
    if (!active || !content || !canvasRef.current) return undefined;
    let live = true;
    setFile(null);
    const { headline, paragraphs, hashtags } = parsePost(content);
    drawPostImage(canvasRef.current, {
      headline: headline || paragraphs[0] || '',
      body: (headline ? paragraphs : paragraphs.slice(1)).join('\n'),
      hashtags,
      party: partyKey(politicalParty),
      look,
      card: card || {},
      author: author || '',
      role: role || '',
    })
      .then(() => new Promise((resolve) => canvasRef.current?.toBlob(resolve, 'image/png')))
      .then((blob) => {
        if (live && blob) setFile(new File([blob], `${name || 'ambedkargpt-post'}-${look}.png`, { type: 'image/png' }));
      });
    return () => { live = false; };
  }, [active, content, card, politicalParty, look, author, role, name]);

  return { canvasRef, file };
}
