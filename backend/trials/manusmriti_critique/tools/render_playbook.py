"""Write analysis/playbook.md, the readable report, from the curated playbook and the live counts.

The playbook (analysis/playbook.json) is written by hand from reading the per-video analyses; the
numbers in the report (which methods how many videos use, the mix of evidence) are not, they come from
analysis/aggregate.json, so adding a transcript and re-running these two commands keeps the report true:

    python3 backend/trials/manusmriti_critique/tools/aggregate.py
    python3 backend/trials/manusmriti_critique/tools/render_playbook.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from backend.trials.manusmriti_critique import config, taxonomy  # noqa: E402


def load():
    playbook = json.loads(config.PLAYBOOK_JSON.read_text(encoding="utf-8"))
    aggregate = json.loads((config.ANALYSIS_DIR / "aggregate.json").read_text(encoding="utf-8"))
    return playbook, aggregate


def seen(ids):
    return ", ".join(f"`{i}`" for i in ids)


def short(text: str, limit: int = 72) -> str:
    """A table cell: cut at a word, say so, and keep a pipe from breaking the table."""
    text = text.replace("|", "/").strip()
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0].rstrip(",;:( ") + "…"


def render(playbook, agg) -> str:
    n = agg["videos"]
    out = [f"# How the videos criticise the Manusmriti, and how the X posts follow them",
           f"*Playbook {playbook['version']} · built from {n} transcripts · regenerate with `tools/aggregate.py` then `tools/render_playbook.py`*", "",
           playbook["summary"], "",
           "## 1. What was in the folder", "",
           "| video | kind | stance on the Manusmriti | how much of it is about the Manusmriti (0-5) | length |", "|---|---|---|---|---|"]
    for v in agg["per_video"]:
        out.append(f"| `{v['video_id']}` | {short(v['genre'])} | {v['stance']} | {v['relevance']} | {v['duration']} |")
    out += ["", "What each one argues, in one line (the analysts' words, not the speakers'):", ""]
    out += [f"- `{v['video_id']}`: {v['thesis']}" for v in agg["per_video"]]
    stances = {}
    for v in agg["per_video"]:
        stances[v["stance"]] = stances.get(v["stance"], 0) + 1
    out += ["", "Stances: " + ", ".join(f"{k} {c}" for k, c in sorted(stances.items(), key=lambda kv: -kv[1])) + ". "
            "Not every transcript is a critique: the ones that defend the text or only touch it are kept because they show what a critical post has to answer.", "",
            "## 2. What they have in common", "",
            "How many of the videos use each method (a video counts once):", "", "| method | videos | what it is |", "|---|---|---|"]
    for name, m in list(agg["methods"].items())[:16]:
        desc = taxonomy.METHODS.get(name, "(a method that was not in the starting list)")
        out.append(f"| `{name}` | {m['video_count']} of {n} | {desc} |")
    kinds = agg["evidence_kinds"]
    total = sum(kinds.values())
    out += ["", f"What they use as evidence ({total} items): " + ", ".join(f"{k} {c}" for k, c in kinds.items()) +
            f". Verses are {kinds.get('verse', 0) * 100 // max(total, 1)}% of it; the rest is history, incidents and people, none of which is in the supplied book. "
            "The posts are therefore built almost entirely from the verse-centred minority.", "",
            "## 3. The patterns, and what each becomes on X", ""]
    for f in playbook["findings"]:
        out += [f"**{f['id'].replace('_', ' ')}** (seen in {seen(f['seen_in'])})", f"- {f['finding']}", f"- *On X:* {f['for_x']}", ""]
    out += ["## 4. The post structures", ""]
    for s in playbook["x_posts"]["structures"]:
        out += [f"### `{s['id']}`: {s['name']}", f"Use when {s['use_when']}. Seen in {seen(s['seen_in'])}.", ""]
        out += [f"{i}. {step}" for i, step in enumerate(s["steps"], 1)] + [""]
    out += ["Hook shapes: " + "; ".join(f"“{h['shape']}”" for h in playbook["x_posts"]["hooks"]),
            "", "Closers: " + "; ".join(playbook["x_posts"]["closers"]), "",
            "## 5. What a critical post has to answer", "", "| objection | seen in | stay safe by |", "|---|---|---|"]
    for o in playbook["objections_to_anticipate"]:
        out.append(f"| {o['objection']} | {seen(o['seen_in'])} | {o['stay_safe_by']} |")
    out += ["", "## 6. What not to copy", ""]
    for d in playbook["do_not_copy"]:
        out.append(f"- **{d['move']}**: {d['why']} (seen in {seen(d['seen_in'])})")
    out += ["", "## 7. Used by the videos, but not available from the supplied book", "",
            "These need a fact from outside the book. They are off unless the fact is supplied as approved context.", ""]
    for c in playbook["needs_approved_context"]:
        used = agg["methods"].get(c["method"], {}).get("video_count")
        out.append(f"- `{c['method']}`{f' (in {used} of {n} videos)' if used else ''}: {c['why']}")
    return "\n".join(out) + "\n"


def main() -> None:
    playbook, agg = load()
    config.PLAYBOOK_MD.write_text(render(playbook, agg), encoding="utf-8")
    print(f"wrote {config.PLAYBOOK_MD} ({len(playbook['findings'])} patterns, {len(playbook['x_posts']['structures'])} structures)")


if __name__ == "__main__":
    main()
