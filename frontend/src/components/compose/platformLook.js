// How each platform looks inside the composer: the phone's app bar, the stage
// glow, and the short limit line under the platform card. The ids and limits
// themselves stay in PLATFORMS in SocialMediaPostGenerator.jsx — this only adds
// the visual layer on top, keyed by the same ids.

export const PLATFORM_LOOK = {
  twitter: {
    icon: '𝕏', iconBg: '#000000', name: 'X',
    hue: '29,155,240',
    frame: '#000000', bar: '#000000', barBorder: '#2F3336', barFg: '#E7E9EA',
    limitKey: 'cmp.lim.twitter', appTitleKey: 'cmp.app.twitter',
  },
  reddit: {
    icon: 'r/', iconBg: '#FF4500', name: 'Reddit',
    hue: '255,69,0',
    frame: '#1A1A1B', bar: '#1A1A1B', barBorder: '#343536', barFg: '#D7DADC',
    limitKey: 'cmp.lim.reddit', appTitle: 'r/india',
  },
  whatsapp: {
    icon: 'W', iconBg: '#25D366', name: 'WhatsApp',
    hue: '37,211,102',
    frame: '#0B141A', bar: '#1F2C34', barBorder: '#1F2C34', barFg: '#E9EDEF',
    limitKey: 'cmp.lim.whatsapp', appTitleKey: 'cmp.app.whatsapp',
  },
  facebook: {
    icon: 'f', iconBg: '#1877F2', name: 'Facebook',
    hue: '24,119,242',
    frame: '#18191A', bar: '#242526', barBorder: '#3E4042', barFg: '#E4E6EB',
    limitKey: 'cmp.lim.facebook', appTitle: 'facebook',
  },
};

// generation_meta.profile_used.target_platform holds the PLATFORMS label
// ("Twitter / X", "Reddit", ...). Map it back to an id for the posts list.
export function platformIdFromLabel(label = '') {
  const l = String(label).toLowerCase();
  if (l.includes('reddit')) return 'reddit';
  if (l.includes('whatsapp') || l.includes('messaging')) return 'whatsapp';
  if (l.includes('facebook')) return 'facebook';
  return 'twitter';
}
