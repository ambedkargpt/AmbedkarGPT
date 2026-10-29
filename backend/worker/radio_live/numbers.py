"""Spell out the figures in a Hindi line before it goes to the voice.

The writer is told to write numbers as words, and mostly does, but some
figures slip through ("2026", "4,432 करोड़", "2025 से 2032"). Sarvam's stock
voices read a bare figure digit by digit, so "2026" came out as
"दो शून्य दो छह". Everything the anchor says passes through `spell_out`
first; the transcript keeps the figures as written.
"""
from __future__ import annotations

import re

_UNITS = (
    "शून्य एक दो तीन चार पाँच छह सात आठ नौ "
    "दस ग्यारह बारह तेरह चौदह पंद्रह सोलह सत्रह अठारह उन्नीस "
    "बीस इक्कीस बाईस तेईस चौबीस पच्चीस छब्बीस सत्ताईस अट्ठाईस उनतीस "
    "तीस इकतीस बत्तीस तैंतीस चौंतीस पैंतीस छत्तीस सैंतीस अड़तीस उनतालीस "
    "चालीस इकतालीस बयालीस तैंतालीस चवालीस पैंतालीस छियालीस सैंतालीस अड़तालीस उनचास "
    "पचास इक्यावन बावन तिरेपन चौवन पचपन छप्पन सत्तावन अट्ठावन उनसठ "
    "साठ इकसठ बासठ तिरेसठ चौंसठ पैंसठ छियासठ सड़सठ अड़सठ उनहत्तर "
    "सत्तर इकहत्तर बहत्तर तिहत्तर चौहत्तर पचहत्तर छिहत्तर सतहत्तर अठहत्तर उनासी "
    "अस्सी इक्यासी बयासी तिरासी चौरासी पचासी छियासी सत्तासी अट्ठासी नवासी "
    "नब्बे इक्यानवे बानवे तिरानवे चौरानवे पचानवे छियानवे सत्तानवे अट्ठानवे निन्यानवे"
).split()

# Indian grouping: करोड़ (10^7), लाख (10^5), हज़ार (10^3), सौ (10^2).
_SCALES = ((10**7, "करोड़"), (10**5, "लाख"), (1000, "हज़ार"), (100, "सौ"))

_DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")

# A figure: Indian or Western comma grouping, or plain digits, with an optional
# decimal part. Not glued to Latin letters, so "G20" and "COVID19" stay as they are.
_NUM = r"(?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d+)?"
_FIGURE = re.compile(
    rf"(?<![A-Za-z\d.,])({_NUM})(?:\s*[-–]\s*({_NUM}))?(\s*%)?(?![A-Za-z\d])"
)


def cardinal(n: int) -> str:
    """Hindi words for a whole number, e.g. 2026 -> "दो हज़ार छब्बीस"."""
    if n < 100:
        return _UNITS[n]
    words = []
    for value, name in _SCALES:
        if n >= value:
            words += [cardinal(n // value), name]
            n %= value
    if n:
        words.append(_UNITS[n])
    return " ".join(words)


def _number(token: str) -> str:
    whole, _, frac = token.replace(",", "").partition(".")
    n = int(whole)
    # Years and figures from 1100 to 1999 are said in hundreds:
    # 1947 -> "उन्नीस सौ सैंतालीस", the way an anchor reads them.
    if "," not in token and len(whole) == 4 and 1100 <= n <= 1999:
        said = f"{_UNITS[n // 100]} सौ" + (f" {_UNITS[n % 100]}" if n % 100 else "")
    else:
        said = cardinal(n)
    if frac:
        said += " दशमलव " + " ".join(_UNITS[int(d)] for d in frac)
    return said


def _replace(m: re.Match) -> str:
    said = _number(m.group(1))
    if m.group(2):
        said += " से " + _number(m.group(2))
    if m.group(3):
        said += " प्रतिशत"
    return said


def spell_out(text: str) -> str:
    """The line with every figure written as the anchor should say it."""
    return _FIGURE.sub(_replace, text.translate(_DEVANAGARI_DIGITS))
