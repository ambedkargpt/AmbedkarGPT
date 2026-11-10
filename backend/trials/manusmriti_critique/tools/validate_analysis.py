"""Check one per-video analysis against the rubric and against its transcript.

The point is the last check: every quote an analysis reports must really be in the transcript. An
analysis that "remembers" a line the speaker never said would teach the generator a pattern that
does not exist, so quotes are matched against the transcript text (ignoring spacing, punctuation and
case), and any that are not found are reported as errors.

    python3 backend/trials/manusmriti_critique/tools/validate_analysis.py \
        backend/trials/manusmriti_critique/analysis/per_video/QS75VNhCOm8.json
    python3 .../validate_analysis.py --all            # every file in analysis/per_video/

Exit status is 1 when there is any error; warnings (thin analysis, over-long quotes) do not fail it.
"""

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any, Iterator, List, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from backend.trials.manusmriti_critique import config, taxonomy  # noqa: E402

QUOTE_KEYS = {"quote", "verbatim", "example"}
TIME_RE = re.compile(r"^(\d{1,2}:\d{2}(:\d{2})?|pos:\d+)$")
MAX_QUOTE_WORDS = 40          # derived data keeps short excerpts, not the speaker's text
REQUIRED = [
    "schema_version", "video_id", "language", "duration", "genre", "speaker_persona",
    "stance_on_manusmriti", "relevance", "audience_addressed", "one_line_thesis", "structure", "hook",
    "closing", "methods", "contexts", "evidence", "authorities_cited", "rhetorical_devices",
    "counterarguments", "tone", "persuasion_strengths", "weaknesses_or_risks", "reusable_template",
    "best_quotes_for_style", "do_not_imitate",
]


def normalise(text: str) -> str:
    """Letters, digits and combining marks only, lower-cased: robust to spacing and punctuation."""
    text = unicodedata.normalize("NFC", text).lower()
    return "".join(ch for ch in text if unicodedata.category(ch)[0] in "LNM")


def quotes(node: Any, path: str = "") -> Iterator[Tuple[str, str]]:
    """Every (path, text) for a field that is supposed to be a verbatim quote."""
    if isinstance(node, dict):
        for key, value in node.items():
            if key in QUOTE_KEYS and isinstance(value, str):
                yield f"{path}.{key}", value
            else:
                yield from quotes(value, f"{path}.{key}")
    elif isinstance(node, list):
        for i, value in enumerate(node):
            yield from quotes(value, f"{path}[{i}]")


def times(node: Any, path: str = "") -> Iterator[Tuple[str, str]]:
    if isinstance(node, dict):
        for key, value in node.items():
            if key in {"time", "start", "end"} and isinstance(value, str):
                yield f"{path}.{key}", value
            else:
                yield from times(value, f"{path}.{key}")
    elif isinstance(node, list):
        for i, value in enumerate(node):
            yield from times(value, f"{path}[{i}]")


def validate(analysis_path: Path, transcripts_dir: Path) -> Tuple[List[str], List[str], int]:
    errors, warnings = [], []
    data = json.loads(analysis_path.read_text(encoding="utf-8"))

    for key in REQUIRED:
        if key not in data:
            errors.append(f"missing required field '{key}'")
    if errors:
        return errors, warnings, 0

    video_id = data["video_id"]
    if analysis_path.stem != video_id:
        errors.append(f"file name {analysis_path.stem!r} does not match video_id {video_id!r}")
    transcript_file = transcripts_dir / f"{video_id}.txt"
    if not transcript_file.exists():
        return errors + [f"transcript not found: {transcript_file}"], warnings, 0
    transcript = normalise(transcript_file.read_text(encoding="utf-8"))

    # vocabulary
    if data["stance_on_manusmriti"] not in taxonomy.STANCES:
        errors.append(f"stance_on_manusmriti {data['stance_on_manusmriti']!r} not in {taxonomy.STANCES}")
    rel = data["relevance"]
    if not (isinstance(rel, dict) and isinstance(rel.get("score"), int) and 0 <= rel["score"] <= 5 and rel.get("why")):
        errors.append("relevance must be {score: 0-5 integer, why: text}")
    for i, m in enumerate(data["methods"]):
        name = m.get("method", "")
        if name not in taxonomy.METHODS and not name.startswith("new:"):
            errors.append(f"methods[{i}].method {name!r} is not in the taxonomy (use 'new:<name>' for a new one)")
    for i, c in enumerate(data["contexts"]):
        name = c.get("context", "")
        if name not in taxonomy.CONTEXTS and not name.startswith("new:"):
            errors.append(f"contexts[{i}].context {name!r} is not in the list (use 'new:<name>')")
    for i, b in enumerate(data["structure"]):
        if b.get("beat") not in taxonomy.BEATS:
            errors.append(f"structure[{i}].beat {b.get('beat')!r} not in {taxonomy.BEATS}")
    for i, e in enumerate(data["evidence"]):
        if e.get("kind") not in taxonomy.EVIDENCE_KINDS:
            errors.append(f"evidence[{i}].kind {e.get('kind')!r} not in {taxonomy.EVIDENCE_KINDS}")
        if not isinstance(e.get("needs_verification_against_text"), bool):
            errors.append(f"evidence[{i}].needs_verification_against_text must be true or false")

    for where, value in times(data):
        if not TIME_RE.match(value.strip()):
            errors.append(f"{where}: time {value!r} must look like 12:34, 1:02:03 or pos:12345")

    # quotes must really be in the transcript
    checked = 0
    for where, text in quotes(data):
        if not text.strip():
            errors.append(f"{where}: empty quote")
            continue
        pieces = [p for p in re.split(r"…|\.\.\.", text) if len(normalise(p)) >= 3]
        if not pieces:
            errors.append(f"{where}: quote has no usable text")
            continue
        checked += 1
        missing = [p.strip() for p in pieces if normalise(p) not in transcript]
        if missing:
            errors.append(f"{where}: not found in the transcript: {missing[0][:90]!r}")
        if len(text.split()) > MAX_QUOTE_WORDS:
            warnings.append(f"{where}: {len(text.split())} words (keep quotes to {MAX_QUOTE_WORDS} or fewer)")

    # thin analysis (warnings: a short or off-topic video may legitimately have little)
    long_transcript = len(transcript) > 3000
    if len(data["structure"]) < (5 if long_transcript else 3):
        warnings.append(f"only {len(data['structure'])} structure beats")
    if rel.get("score", 0) >= 2 and len(data["methods"]) < 3:
        warnings.append(f"relevance {rel['score']} but only {len(data['methods'])} methods")
    if len(data["reusable_template"]) < 4:
        warnings.append("reusable_template has fewer than 4 steps")
    if long_transcript and len(data["best_quotes_for_style"]) < 5:
        warnings.append("fewer than 5 best_quotes_for_style")
    return errors, warnings, checked


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("files", nargs="*", type=Path)
    parser.add_argument("--all", action="store_true", help="validate every file in analysis/per_video/")
    parser.add_argument("--transcripts", type=Path, default=config.DEFAULT_TRANSCRIPTS_DIR)
    args = parser.parse_args()

    files = sorted(config.PER_VIDEO_DIR.glob("*.json")) if args.all else args.files
    if not files:
        sys.exit("nothing to validate: pass a file or --all")
    failed = 0
    for path in files:
        try:
            errors, warnings, checked = validate(path, args.transcripts)
        except (ValueError, OSError) as exc:
            errors, warnings, checked = [f"cannot read: {exc}"], [], 0
        status = "OK" if not errors else f"{len(errors)} ERROR(S)"
        print(f"{path.name}: {status} | {checked} quotes checked against the transcript | {len(warnings)} warning(s)")
        for line in errors:
            print(f"   ERROR   {line}")
        for line in warnings:
            print(f"   warning {line}")
        failed += bool(errors)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
