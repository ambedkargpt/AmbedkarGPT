"""Count what the per-video analyses have in common, without any judgement.

Reads every analysis/per_video/*.json and writes analysis/aggregate.json: how many videos use each
method (and how strongly), which contexts they place the criticism in, the order of beats, the
kinds of evidence, the rhetorical devices, and every objection raised. The curated playbook
(analysis/playbook.json) is written from these numbers plus a reading of the analyses; this part is
mechanical, so it can be re-run whenever a transcript is added or an analysis changes.

    python3 backend/trials/manusmriti_critique/tools/aggregate.py
"""

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from backend.trials.manusmriti_critique import config, taxonomy  # noqa: E402

STRENGTH = {"low": 1, "medium": 2, "high": 3}


def load_all():
    """Every analysis that is valid JSON. One that is not (say, still being written) is named and skipped, not fatal."""
    analyses = []
    for path in sorted(config.PER_VIDEO_DIR.glob("*.json")):
        try:
            analyses.append(json.loads(path.read_text(encoding="utf-8")))
        except ValueError as exc:
            print(f"WARNING: skipping {path.name}, not valid JSON yet ({exc})", file=sys.stderr)
    return analyses


def aggregate(analyses):
    out = {"videos": len(analyses), "per_video": [], "methods": {}, "contexts": {}, "beats": {},
           "beat_order": [], "evidence_kinds": {}, "devices": {}, "objections": [], "do_not_imitate": [],
           "weaknesses": [], "authorities": {}, "hooks": [], "closings": []}

    methods = defaultdict(lambda: {"videos": [], "strength_sum": 0, "examples": []})
    contexts = defaultdict(list)
    beats = Counter()
    kinds = Counter()
    devices = defaultdict(list)
    authorities = defaultdict(list)
    for a in analyses:
        vid = a["video_id"]
        out["per_video"].append({
            "video_id": vid, "language": a["language"], "duration": a["duration"], "genre": a["genre"],
            "stance": a["stance_on_manusmriti"], "relevance": a["relevance"]["score"],
            "thesis": a["one_line_thesis"], "methods": len(a["methods"]), "evidence_items": len(a["evidence"]),
        })
        for m in a["methods"]:
            entry = methods[m["method"]]
            entry["videos"].append(vid)
            entry["strength_sum"] += STRENGTH.get(m.get("strength", "low"), 1)
            for ex in m.get("examples", [])[:1]:
                entry["examples"].append({"video_id": vid, "quote": ex.get("quote", ""), "gloss": ex.get("gloss", "")})
        for c in a["contexts"]:
            contexts[c["context"]].append(vid)
        seq = []
        for b in a["structure"]:
            beats[b["beat"]] += 1
            seq.append(b["beat"])
        out["beat_order"].append({"video_id": vid, "stance": a["stance_on_manusmriti"], "beats": seq})
        for e in a["evidence"]:
            kinds[e["kind"]] += 1
        for d in a["rhetorical_devices"]:
            devices[d["device"].strip().lower()].append(vid)
        for c in a["counterarguments"]:
            out["objections"].append({"video_id": vid, "objection": c["objection"], "response": c.get("response", ""), "quote": c.get("quote", "")})
        for name in a["authorities_cited"]:
            authorities[name["name"]].append(vid)
        out["do_not_imitate"] += [{"video_id": vid, "item": x} for x in a["do_not_imitate"]]
        out["weaknesses"] += [{"video_id": vid, "item": x} for x in a["weaknesses_or_risks"]]
        out["hooks"].append({"video_id": vid, **a["hook"]})
        out["closings"].append({"video_id": vid, **a["closing"]})

    out["methods"] = {
        name: {"videos": sorted(set(v["videos"])), "video_count": len(set(v["videos"])),
               "strength_sum": v["strength_sum"], "in_taxonomy": name in taxonomy.METHODS, "examples": v["examples"]}
        for name, v in sorted(methods.items(), key=lambda kv: (-len(set(kv[1]["videos"])), -kv[1]["strength_sum"], kv[0]))
    }
    out["contexts"] = {k: {"video_count": len(set(v)), "videos": sorted(set(v))}
                       for k, v in sorted(contexts.items(), key=lambda kv: -len(set(kv[1])))}
    out["beats"] = dict(beats.most_common())
    out["evidence_kinds"] = dict(kinds.most_common())
    out["devices"] = {k: {"video_count": len(set(v)), "videos": sorted(set(v))}
                      for k, v in sorted(devices.items(), key=lambda kv: -len(set(kv[1])))}
    out["authorities"] = {k: {"video_count": len(set(v)), "videos": sorted(set(v))}
                          for k, v in sorted(authorities.items(), key=lambda kv: -len(set(kv[1])))}
    return out


def main() -> None:
    analyses = load_all()
    if not analyses:
        sys.exit("no analyses in analysis/per_video/")
    result = aggregate(analyses)
    path = config.ANALYSIS_DIR / "aggregate.json"
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{result['videos']} analyses -> {path}")
    print(f"{'method':38}{'videos':>7}{'strength':>9}")
    for name, m in list(result["methods"].items())[:25]:
        print(f"{name:38}{m['video_count']:>7}{m['strength_sum']:>9}{'' if m['in_taxonomy'] else '  (new)'}")
    print("contexts:", {k: v["video_count"] for k, v in result["contexts"].items()})
    print("evidence kinds:", result["evidence_kinds"])


if __name__ == "__main__":
    main()
