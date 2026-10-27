// A2 "Spoke Nib" geometry — viewBox 0 0 100 100, wheel centre (50, 40).
// 24 spokes start just outside the hub so the chakra stays crisp at small sizes.
export const SPOKE_ANGLES = Array.from({ length: 24 }, (_, k) => k * 15);
export const SPOKE = { x1: 50, y1: 30.5, x2: 50, y2: 12 };
export const RIM = { cx: 50, cy: 40, r: 30, strokeWidth: 6 };
export const HUB = { cx: 50, cy: 40, r: 6 };
// nib with breather hole and slit (evenodd)
export const NIB = 'M33 56 H67 L50 98 Z M46 63 A4 4 0 1 0 54 63 A4 4 0 1 0 46 63 Z M48.6 68 H51.4 V88 H48.6 Z';
// nib outline only, used to cut a thin gap around the nib in the wheel
export const NIB_OUTLINE = 'M33 56 H67 L50 98 Z';

// A8 "Bold" — favicon / anything under 24px
export const BOLD_SPOKE_ANGLES = [0, 30, 60, 90, 120, 150];
export const BOLD_NIB = 'M34 70 H66 L50 98 Z M48 76 H52 V89 H48 Z';
