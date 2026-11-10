"""Paths and the on/off switch for the Manusmriti-critique trial.

Everything for the trial lives in this folder. Nothing outside it imports from it except one
optional, flag-guarded router mount, so the trial is removed by deleting this folder (see README).
"""

import os
from pathlib import Path

TRIAL_DIR = Path(__file__).resolve().parent
ANALYSIS_DIR = TRIAL_DIR / "analysis"
PER_VIDEO_DIR = ANALYSIS_DIR / "per_video"        # one analysis JSON per transcript
PLAYBOOK_JSON = ANALYSIS_DIR / "playbook.json"    # the synthesized patterns the generator reads
PLAYBOOK_MD = ANALYSIS_DIR / "playbook.md"        # the same, written for people
SOURCES_DIR = TRIAL_DIR / "sources"               # the Manusmriti text goes here (never the transcripts)
OUTPUT_DIR = TRIAL_DIR / "output"                 # generated posts (gitignored)
PUBLISHED_DIR = TRIAL_DIR / "published"           # picks.json (what a person chose) and posts.json (what the website reads); both committed

# The YouTube transcripts are third-party material: they are read from where they live and are
# never copied into the repository. Only the derived analysis (with short quotes) is stored.
DEFAULT_TRANSCRIPTS_DIR = Path(
    os.getenv("MANUSMRITI_TRANSCRIPTS_DIR")
    or Path.home() / "Downloads" / "youtube-transcripts" / "youtube-transcripts" / "txt"
)


def trial_enabled() -> bool:
    """Off unless TRIAL_MANUSMRITI_CRITIQUE is set; the website never exposes the trial otherwise."""
    return (os.getenv("TRIAL_MANUSMRITI_CRITIQUE") or "").strip().lower() in {"1", "true", "yes", "on"}
