"""How long a post is on X.

X does not count characters one for one. Its own rule (the open-source twitter-text library) gives
most scripts a weight of 1 and others, such as emoji and CJK, a weight of 2, and counts every link as
23 whatever its length. A standard post may weigh at most 280. Counting `len(text)` instead would
let an emoji-heavy or link-carrying post through that X then refuses.
"""

import re

X_LIMIT = 280
LINK_WEIGHT = 23
_LINK = re.compile(r"https?://\S+")
# Code points weighted 1 by twitter-text (everything else weighs 2): Latin, Devanagari and most
# alphabets sit below U+1100; plus a few punctuation blocks.
_LIGHT = ((0x0000, 0x10FF), (0x2000, 0x200D), (0x2010, 0x201F), (0x2032, 0x2037))


def _weight(ch: str) -> int:
    code = ord(ch)
    return 1 if any(lo <= code <= hi for lo, hi in _LIGHT) else 2


def weighted_length(text: str) -> int:
    """The length X would charge for this text."""
    links = _LINK.findall(text)
    body = _LINK.sub("", text)
    return sum(_weight(c) for c in body) + LINK_WEIGHT * len(links)


def fits(text: str, limit: int = X_LIMIT) -> bool:
    return weighted_length(text) <= limit
