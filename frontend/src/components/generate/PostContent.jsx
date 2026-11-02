import { parsePost } from '../../utils/parsePost';

// Sized with clamp() rather than a base class plus an md: variant, and that
// is load-bearing rather than style. index.css carries a Hindi type scale that
// maps every arbitrary text-[Npx] token up by about 12% for Devanagari's
// smaller x-height, and it is plain unlayered CSS, so it outranks Tailwind's
// own utilities: under lang="hi" a text-[21px] paragraph rendered at 23.5px and
// the md:text-[23px] beside it never applied. clamp() produces a token the map
// has no rule for, so these sizes are the sizes.
//
// The values are already chosen for Devanagari, so nothing is lost by opting
// out of that bump: 16.5px here reads like a normal 15px Latin body.

// Devanagari and Latin are not read at the same size. Mangal and Noto Sans
// Devanagari have a smaller x-height, so Hindi at 15px reads smaller than
// English at 15px, and a single size for both leaves one of them wrong. The
// English figures are where Instagram and Reddit sit on a phone; the Hindi ones
// are those plus about 8%.
const SIZE = {
  en: { head: 'text-[clamp(17px,1.3vw+11px,22px)]', body: 'text-[clamp(15px,1.1vw+10.5px,18px)]', lead: 'leading-[1.6]' },
  hi: { head: 'text-[clamp(18px,1.4vw+12px,24px)]', body: 'text-[clamp(16px,1.2vw+11px,20px)]', lead: 'leading-[1.75]' },
};

// animate: the post arrives a paragraph at a time (keyed on the text, so a
// regenerated or translated post arrives again).
export default function PostContent({ content, className = '', lang = 'hi', animate = false }) {
  const size = SIZE[lang] ?? SIZE.hi;
  if (!content?.trim()) return null;

  const { headline, paragraphs, hashtags } = parsePost(content);
  const arrive = (i) => (animate ? { className: 'ag-type', style: { '--ty-delay': `${Math.min(i * 90, 1200)}ms` } } : { className: '', style: undefined });

  // If parsing produced nothing meaningful, render the raw content as plain text
  // so the post is never invisible to the user.
  const hasStructure = headline || paragraphs.length > 0;
  if (!hasStructure) {
    return (
      <div className={`space-y-3 ${className}`} style={{ fontFamily: "'Mangal', 'Noto Sans Devanagari', serif" }}>
        <p className={`whitespace-pre-wrap ${size.body} ${size.lead} text-[#e6eefb]`}>
          {content.trim()}
        </p>
      </div>
    );
  }

  return (
    <div key={animate ? content : undefined} className={`space-y-5 ${className}`} style={{ fontFamily: "'Mangal', 'Noto Sans Devanagari', serif" }}>
      {headline && (
        <p className={`${size.head} font-bold leading-[1.35] text-white ${arrive(0).className}`} style={arrive(0).style}>
          {headline}
        </p>
      )}

      {/* On a phone this is ordinary app body text, around 16.5px, and it grows
          to 23px by the desktop width the demo is given on. It used to be 21px
          at every width, which the Hindi scale then pushed to 23.5px: three
          paragraphs filled the screen and the post had to be scrolled to be
          read at all. */}
      {paragraphs.map((para, i) => (
        <p key={i} className={`${size.body} ${size.lead} text-[#e6eefb] ${arrive(i + 1).className}`} style={arrive(i + 1).style}>
          {para}
        </p>
      ))}

      {hashtags.length > 0 && (
        <div className={`flex flex-wrap gap-1.5 pt-1 ${arrive(paragraphs.length + 1).className}`} style={arrive(paragraphs.length + 1).style}>
          {hashtags.map((tag) => (
            <span
              key={tag}
              className="rounded-full px-3 py-1 text-[clamp(12px,0.5vw+10px,14px)] font-medium"
              style={{
                backgroundColor: 'rgba(63,159,255,0.1)',
                border: '1px solid rgba(63,159,255,0.25)',
                color: '#5fa5ff',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
