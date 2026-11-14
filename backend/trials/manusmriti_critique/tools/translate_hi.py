"""Hindi for the Manusmriti section: every published entry and every verse it cites.

    python backend/trials/manusmriti_critique/tools/translate_hi.py --env-file backend/.env
    python backend/trials/manusmriti_critique/tools/translate_hi.py --only a075266a --force

Writes published/posts_hi.json, which api.py lays over posts.json when it serves the section. The English stays
the source: each Hindi entry stores a fingerprint of the English it was made from, and api.py ignores an entry
whose English has since changed, so a republished post falls back to English until this is run again instead of
showing an old translation. Run it after publish_posts.py; it only translates what is new or changed.

A translation is checked before it is kept, and retried once if it fails:
  * every verse reference (8.267) and every number in the English is still there, as digits;
  * a thread has the same number of parts, and a single post for X still fits in 280 characters;
  * it is Hindi: mostly Devanagari.
The verses are Bühler's English (1886); their Hindi is a translation of that translation, and the page says so.

Uses DeepSeek (DEEPSEEK_API_KEY, model MANUSMRITI_HI_MODEL or deepseek-chat).
"""

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
PUBLISHED = HERE / "published"
POST_FIELDS = ("headline", "says", "critique", "fair_note")

GUIDE = """You translate entries of a critique of the Manusmriti from English into Hindi for an Indian website.
Rules:
- Natural, plain Hindi in Devanagari, the register of a serious Hindi newspaper. Not Sanskritised, not Hinglish.
- Translate faithfully. Add nothing, drop nothing, soften nothing, sharpen nothing.
- Keep every verse reference exactly as written in digits, e.g. 8.267 stays 8.267. Write "Manusmriti 8.267" as "मनुस्मृति 8.267".
- Write every number as digits, as in the English (12 stays 12; "one hundred" may become 100).
- Caste and legal terms in their usual Hindi form: ब्राह्मण, क्षत्रिय, वैश्य, शूद्र, पण, द्विज, चांडाल.
- Text in quotation marks is a quotation of the verse: translate it faithfully and keep it in quotation marks.
- Keep line breaks (\\n) where the English has them.
Return only the JSON asked for."""


def fingerprint(obj) -> str:
    return hashlib.sha1(json.dumps(obj, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:12]


def post_source(post: dict) -> dict:
    return {**{k: post.get(k) or "" for k in POST_FIELDS}, "parts": list(post.get("parts") or [])}


def _numbers(text: str) -> list[str]:
    return re.findall(r"\d+(?:\.\d+)?", text or "")


def _devanagari_share(text: str) -> float:
    letters = re.findall(r"[^\W\d_]", text or "")
    return sum("ऀ" <= ch <= "ॿ" for ch in letters) / (len(letters) or 1)


def check_post(src: dict, hi: dict) -> list[str]:
    problems = []
    for key in POST_FIELDS:
        if src[key] and not str(hi.get(key) or "").strip():
            problems.append(f"{key} missing")
    parts = hi.get("parts") or []
    if len(parts) != len(src["parts"]):
        problems.append(f"{len(parts)} parts for {len(src['parts'])}")
    if len(src["parts"]) == 1 and parts and len(parts[0]) > 280:
        problems.append(f"post is {len(parts[0])} characters, over 280")
    whole_src = " ".join([*(src[k] for k in POST_FIELDS), *src["parts"]])
    whole_hi = " ".join([*(str(hi.get(k) or "") for k in POST_FIELDS), *map(str, parts)])
    missing = sorted(set(_numbers(whole_src)) - set(_numbers(whole_hi)))
    if missing:
        problems.append("numbers or verses lost: " + ", ".join(missing))
    if _devanagari_share(whole_hi) < 0.8:
        problems.append("not Hindi")
    return problems


def check_verses(src: dict, hi: dict) -> list[str]:
    problems = []
    for vid, text in src.items():
        out = str(hi.get(vid) or "")
        if not out.strip():
            problems.append(f"{vid} missing")
        elif set(_numbers(text)) - set(_numbers(out)) or _devanagari_share(out) < 0.8:
            problems.append(f"{vid} unfaithful")
    return problems


def ask(client, model: str, instruction: str, payload) -> dict:
    resp = client.chat.completions.create(
        model=model,
        temperature=0.2,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": GUIDE},
            {"role": "user", "content": instruction + "\n\n" + json.dumps(payload, ensure_ascii=False, indent=1)},
        ],
    )
    return json.loads(resp.choices[0].message.content or "{}")


def translate_post(client, model, src):
    note = None
    for _ in range(2):
        instruction = ("Translate this entry into Hindi. Return the same keys: headline, says, critique, fair_note, "
                       "and parts (a list with the same number of items; each part is a post for X and, when there is "
                       "only one, must stay within 280 characters).")
        if note:
            instruction += "\nYour previous answer had these problems, fix them: " + "; ".join(note)
        hi = ask(client, model, instruction, src)
        note = check_post(src, hi)
        if not note:
            return {**{k: hi[k] for k in POST_FIELDS if src[k]}, "parts": hi["parts"]}, []
    return None, note


def translate_verses(client, model, src):
    note = None
    for _ in range(2):
        instruction = ("These are verses of the Manusmriti in G. Bühler's English translation. Translate each into "
                       "Hindi, keeping the words in parentheses (Bühler's additions) in parentheses. Return a JSON "
                       "object with the same keys (the verse numbers).")
        if note:
            instruction += "\nFix: " + "; ".join(note)
        hi = ask(client, model, instruction, src)
        note = check_verses(src, hi)
        if not note:
            return {k: hi[k] for k in src}, []
    return {k: hi[k] for k in src if k not in {p.split()[0] for p in note} and hi.get(k)}, note


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--env-file", help="a .env file with DEEPSEEK_API_KEY")
    ap.add_argument("--only", nargs="*", help="post ids to translate")
    ap.add_argument("--force", action="store_true", help="translate again even when the English has not changed")
    args = ap.parse_args()
    if args.env_file:
        from dotenv import load_dotenv
        load_dotenv(args.env_file)
    from openai import OpenAI

    client = OpenAI(api_key=os.environ["DEEPSEEK_API_KEY"], base_url=os.getenv("DEEPSEEK_BASE_URL") or "https://api.deepseek.com")
    model = os.getenv("MANUSMRITI_HI_MODEL") or "deepseek-chat"

    data = json.loads((PUBLISHED / "posts.json").read_text(encoding="utf-8"))
    out_path = PUBLISHED / "posts_hi.json"
    done = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else {}
    posts_hi, verses_hi = done.get("posts", {}), done.get("verses", {})
    failed = []

    for post in data["posts"]:
        if args.only and post["id"] not in args.only:
            continue
        src = post_source(post)
        fp = fingerprint(src)
        if not args.force and posts_hi.get(post["id"], {}).get("source") == fp:
            continue
        hi, problems = translate_post(client, model, src)
        if hi:
            posts_hi[post["id"]] = {"source": fp, **hi}
            print("post", post["id"], "ok")
        else:
            failed.append(f"post {post['id']}: {'; '.join(problems)}")
            print("post", post["id"], "FAILED:", "; ".join(problems))

    todo = {vid: v["text"] for vid, v in data["verses"].items()
            if args.force or verses_hi.get(vid, {}).get("source") != fingerprint(v["text"])}
    ids = sorted(todo)
    for i in range(0, len(ids), 12):
        batch = {vid: todo[vid] for vid in ids[i:i + 12]}
        hi, problems = translate_verses(client, model, batch)
        for vid, text in hi.items():
            verses_hi[vid] = {"source": fingerprint(batch[vid]), "text": text}
        if problems:
            failed.append("verses: " + "; ".join(problems))
        print("verses", ", ".join(batch), "ok" if not problems else "with problems: " + "; ".join(problems))

    out_path.write_text(json.dumps({"posts": posts_hi, "verses": verses_hi}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"saved {out_path.name}: {len(posts_hi)} posts, {len(verses_hi)} verses")
    if failed:
        print("NOT translated (still shown in English):\n  " + "\n  ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
