# Manusmriti critique: trial

A trial feature that writes **X (Twitter) posts criticising what the Manusmriti itself says**, using the
method the supplied YouTube videos use. Every fact in a post is a verse of the supplied Manusmriti PDF,
quoted word for word with its reference. Nothing is published automatically: a person reads each review
sheet and decides.

The result is a **Manusmriti section on the website** (`/manusmriti`): a page to read, with the posts grouped by topic,
each with the verse it is built on, a Copy button and a Post-on-X link. It is a page, not a bot: there is no text box
and nothing a visitor types reaches a model (§7).

It is a trial, so it is built to be redone and removed:

* the work lives in this folder; the website touches it in only a few lines (§6 lists them);
* it is switched off unless `TRIAL_MANUSMRITI_CRITIQUE=true` is set on the server and the frontend is built with the
  section enabled (it always is under `vite dev`; a production build needs `VITE_MANUSMRITI_SECTION=true`);
* removing it is a few deletions (§6).

## 1. What was done, in order

| step | input | output | where |
|---|---|---|---|
| 1. Analyse the videos | 9 transcripts | one JSON per video: methods, contexts, beats, evidence, objections, quotes | `analysis/per_video/` |
| 2. Find the patterns | those 9 analyses | counts, then a hand-curated playbook | `analysis/aggregate.json` → `analysis/playbook.json` |
| 3. Write the report | the playbook | what the videos do and how the X posts follow it | `analysis/playbook.md` (**read this first**) |
| 4. Read the book | `Manu-Smriti.pdf` | 2,684 verses, English only, with page numbers | `sources/manusmriti_verses.json` |
| 5. Write posts | chosen verses + playbook | posts, checked and saved for review | `output/runs/<time>-<format>/review.md` |
| 6. Choose the topics | the whole book, sent to Gemini once | ranked candidate topics with their verses, every verse id checked against the book | `output/topics_proposed-<purpose>-<time>.json` |
| 7. Choose what is published | the posts a person picked (`published/picks.json`) | `published/posts.json`: every post re-checked against the verse text, with the cited verses embedded | `published/` (committed) |
| 8. Show it | `posts.json` | the section at `/manusmriti` | `api.py`, the frontend page |

## 2. Quick start

Needs `google-genai` (the backend's environment has it) and a Gemini key, or `openai` and an OpenAI key.
Run from the repository root.

```bash
# once: read the book (needs PyMuPDF, only for this step)
python3 backend/trials/manusmriti_critique/tools/ingest_book.py /path/to/Manu-Smriti.pdf

# look at verses, or let a theme propose them
python3 -m backend.trials.manusmriti_critique.book --show "8.267-8.272"
python3 -m backend.trials.manusmriti_critique.book --theme punishment_by_birth --top 8

# write posts: three variants for two verses
python3 -m backend.trials.manusmriti_critique.generate --verses 8.268 8.270 --variants 3 --env-file path/to/.env
python3 -m backend.trials.manusmriti_critique.generate --verses 8.267-8.268 --format thread --variants 2
python3 -m backend.trials.manusmriti_critique.generate --theme women_control --top 4
python3 -m backend.trials.manusmriti_critique.generate --verses 8.270 --dry-run     # print the prompts only

# you edited a post by hand (or wrote one)? Run the file through the same checks.
# A thread: separate the parts with a line of ---. Verses named in the text are picked up on their own;
# add --verses for neighbouring verses the post relies on (for example 8.270, which says who "he" is in 8.272).
python3 -m backend.trials.manusmriti_critique.generate --check-file my_post.txt

# which topics make the best menu for the no-questions bot? Sends the whole book (about 123,000 tokens) to Gemini once.
# --purpose critique (default) asks for topics where the verses themselves show unequal rules; --purpose general for the most interesting ones.
python3 backend/trials/manusmriti_critique/tools/propose_topics.py --env-file path/to/.env
python3 backend/trials/manusmriti_critique/tools/propose_topics.py --dry-run          # size of the prompt only

# choose what the website shows: edit published/picks.json, then check every post against the verses and build posts.json
python3 backend/trials/manusmriti_critique/tools/publish_posts.py --check
python3 backend/trials/manusmriti_critique/tools/publish_posts.py
```

The topic finder does not decide the menu: it ranks candidates, drops any verse id the book does not have, and suggests ten
that do not mostly repeat each other's verses. A person reads the verses behind each topic and chooses. Two runs on this book
gave different lists because the purpose differs: a menu for "interesting" topics picked warfare, foods and forest hermits,
while one told that the bot is a critique picked punishment by caste, the rules for Sudras, women, learning and property.

Themes: `punishment_by_birth`, `sudra_exclusion`, `women_control`, `brahmana_privilege`,
`outcastes_and_purity`, `birth_ranking`. Other flags: `--focus "note"` steers the writing,
`--no-judge` skips the model fact-check, `--provider gemini|openai|gemini,openai`.

Settings (environment): `TRIAL_LLM_PROVIDERS` (default `gemini,openai`), `TRIAL_GEMINI_MODEL`
(`models/gemini-3.5-flash`), `TRIAL_GEMINI_THINKING` (1024), `TRIAL_OPENAI_MODEL`, `TRIAL_JUDGE_MODEL`
(`models/gemini-pro-latest`, the fact-check; it falls back to the writing model and records which one ran),
`TRIAL_JUDGE_THINKING` (2048). Keys are read from the environment (`GEMINI_API_KEY` or `GOOGLE_API_KEY`,
`OPENAI_API_KEY`); `--env-file` loads a `.env` for that one run and nothing is written anywhere.

## 3. How a post is made and why it can be trusted (up to a point)

1. **Write.** The model gets the verses, the neighbouring verses for context, the playbook (structures,
   hooks, closers, what to avoid) and hard rules, and returns posts as JSON that *declare* the verses and
   the exact quotations they use.
2. **Verify (code, not a model)**, `verify.py`. A post is an **error** if: it is over 280 weighted characters
   (X's own counting: links 23, emoji and CJK 2); it names no verse, or a verse that was not declared or
   does not exist; text in quotation marks is not word for word in a cited verse; a number (digits or words)
   is not in the cited verses; a strong word (kill, slave, torture, brand, banish…) is not in them; "Two
   verses" does not match the verses cited; a side-by-side pattern uses only one verse; it makes collective
   statements about a community, attributes motives to people, names politicians, abuses, or calls for
   violence; it uses an outside fact (Ambedkar, the Constitution, a court, a date) that is not in a cited verse
   and not in `sources/approved_context.json`; it uses a hashtag other than `#Manusmriti`.
   Claims about practice ("was enforced", "for centuries") and the word "Hindu" are warnings.
3. **Repair.** Failing posts go back to the model with the exact errors, up to two rounds.
4. **Fact-check (model).** A second, stronger model reads each surviving post against the verse text,
   sentence by sentence: is every claim in the verse, is any qualifier dropped ("arrogantly",
   "his Sudra (slave)"), is the opinion marked as an opinion, is the tone fair.
5. **Status:** `approved` (passed everything), `needs_review` (a warning, or the fact-check disagrees; the
   reason is printed) or `rejected` (an error survived the repairs). **Approved still means "read it
   yourself"**: the checks catch wrong numbers, invented quotes and dropped qualifiers, not taste.

Each run is saved under `output/runs/<UTC time>-<format>/` as `run.json` and a readable `review.md`
(post, verses with their text and PDF page, issues, the fact-check). `output/` is not committed.

A post you edit by hand goes through steps 2 and 4 with `--check-file`. The fact-check only sees the verses a post
cites (or that you add with `--verses`), so a claim that rests on a neighbouring verse needs that verse named: a
post saying "a Sudra" about 8.272 ("If he arrogantly teaches…") passed once and failed once until 8.270, which says
who "he" is, was cited too. Treat a single "approved" as a good sign, not a proof.

## 4. Redo guide

| I want to… | do this |
|---|---|
| use another book or translation | `tools/ingest_book.py <pdf>`. It splits on verse numbers and reports gaps; chapter counts are compared with `EXPECTED_COUNTS` (this PDF ends chapter 11 at 11.265, documented there). Tests that compare example posts with the real text re-check them. |
| change how posts sound | edit `analysis/playbook.json` (structures, hooks, closers, `must`, `must_not`) and run `tools/render_playbook.py`. `generate.load_playbook()` merges it over a built-in default and prints its version. |
| change what is forbidden | `verify.py`: `BLOCKED_PATTERNS`, `STRONG_WORDS`, `OUTSIDE_FACTS`, `PATTERN_MIN_VERSES`. Each has a test in `backend/tests/test_manusmriti_trial_verify.py`. |
| allow an outside fact (Ambedkar's burning of the text, a constitutional article) | put it, as one sentence, in `sources/approved_context.json` (a JSON list of strings). Only facts listed there pass the outside-fact check, and the playbook's `needs_approved_context` says which of the videos' methods this enables. |
| analyse more videos | put the transcript in the transcripts folder (`MANUSMRITI_TRANSCRIPTS_DIR`, default `~/Downloads/youtube-transcripts/youtube-transcripts/txt`), write `analysis/per_video/<id>.json` following `analysis/rubric.md`, run `tools/validate_analysis.py --all`, then `tools/aggregate.py`, update `playbook.json` by hand from the new counts and run `tools/render_playbook.py`. The validator rejects any quote that is not really in the transcript. |
| change the model | environment settings in §2; only `llm.py` talks to a model. |

**The per-video analyses are not committed.** They quote the YouTube transcripts (about a third of their
words in total) and those belong to their authors, so `analysis/.gitignore` keeps `per_video/*.json` and
`aggregate.json` on the machine that has the transcripts. The playbook, which contains none of their text,
is committed. On a fresh checkout the two tests that compare the playbook with the analyses are skipped.

## 5. Guardrails (all enforced in code, none left to the model's judgement)

* Claims only from the supplied verses; the check runs on the text, not on the model's description of it.
* The target is the rule, never a community, caste, religion or person; no politicians, no abuse, no violence.
* An opinion is marked as one (a question, or "Not balanced justice"); a fact is a verse.
* The verse's own qualifiers are kept; "prescribes" and "says", never "was done" or "for centuries".
* The translation is not named in a post until its edition is confirmed (the PDF does not say).
* The transcripts are never copied into the repository and the book text is not committed (`sources/.gitignore`).

## 6. Removing the trial

```bash
git rm -r backend/trials backend/tests/test_manusmriti_trial_*.py
git rm -r frontend/src/components/manusmriti frontend/src/pages/Manusmriti.jsx \
          frontend/src/data/manusmriti.js frontend/src/data/manusmriti.test.js frontend/src/api/manusmriti.js
```

then delete the lines that mention the trial in four existing files (a search for `manusmriti` or `MANUSMRITI` finds them):

| file | what to delete |
|---|---|
| `backend/main.py` | the block at the end that mounts the router behind `TRIAL_MANUSMRITI_CRITIQUE` |
| `frontend/src/App.jsx` | the `Manusmriti` lazy import, the `/manusmriti` route and `MANUSMRITI_SECTION_ENABLED` in the import |
| `frontend/src/components/Navbar.jsx` | the nav item, the `ITEM_FOR_PATH` entry, the `manusmriti` branch of `handleNav` and the import |
| `frontend/src/data/features.js`, `i18n/pages.js`, `components/seo/RouteTitle.jsx` | the `MANUSMRITI_SECTION_ENABLED` constant, the `msm.*` and `nav.manusmritiCaps` strings, the `/manusmriti` title |

Nothing else refers to it: no database tables, no migrations, no new dependencies (`google-genai` and `openai` are
already in `backend/requirements-api.txt`; PyMuPDF is needed only for the one-off ingest).

## 7. The website section

**Product rule: the visitor never asks a question.** Unlike BheemBot, this is not a bot. There is no text box, nothing
a visitor types is sent anywhere, and no model runs while they read. The posts were written and checked beforehand;
the visitor only chooses which topic to read. That keeps every word inside what was reviewed, which open
question-and-answer cannot promise.

How it fits together:

* `published/picks.json` is what a person chose: the topics (title and one line, English and Hindi) and the posts, each
  with its topic, text, the verses it cites and `"reviewed": false|true`.
* `tools/publish_posts.py` turns it into `published/posts.json`. It re-checks every post against the verse text
  (`--check` to only check, `--only-reviewed` to leave out what nobody has read) and stops on the first problem. The
  file carries the text of the cited verses, so the site and its tests need neither the PDF nor a model.
* `api.py` serves that file read-only at `GET /api/v1/manusmriti/posts`. `backend/main.py` mounts it only while
  `TRIAL_MANUSMRITI_CRITIQUE` is on, so with the flag off the route does not exist. It has no write route and no
  input (a test pins that).
* The page is `frontend/src/pages/Manusmriti.jsx` with `components/manusmriti/PostCard.jsx`. A topic is a link
  (`/manusmriti?topic=<id>`). Each card has the post as it would read on X, the verse text one tap away, Copy and
  Post on X (a thread has Copy only, since X cannot post a thread in one go). A post not yet marked reviewed carries an
  "Awaiting review" tag, so nothing looks signed off that is not.

Run it locally (the backend needs its usual `.env`):

```bash
TRIAL_MANUSMRITI_CRITIQUE=true python3 -m uvicorn backend.main:app --reload --port 8000
cd frontend && npm run dev            # then open http://localhost:5173/manusmriti
```

Change the content: edit `published/picks.json` (add, remove or reword a post, mark it `"reviewed": true` after reading
it), run `python3 backend/trials/manusmriti_critique/tools/publish_posts.py`, and commit both files. A reworded post
must pass the same checks, so it cannot say more than its verse does.

Before it goes live: set `TRIAL_MANUSMRITI_CRITIQUE=true` in the server's environment (for the Lambda, in the AWS
console), build the frontend with `VITE_MANUSMRITI_SECTION=true`, read every post and mark it reviewed, confirm the
translation and put its name in `picks.json` (`"translation"`; the page shows it once set), and run the build with
`--only-reviewed`.

## 8. Known limits

* The 41 posts in `picks.json` are marked `"reviewed": false`: the checks above are strong on numbers, quotations and
  dropped qualifiers, but they are not a reader. A person reads each one before the section goes live.
* Hooks and closers are often plain ("Is this justice?"). A human edit is expected; `--focus` helps.
* The model sometimes reuses the playbook's example wording (the 5.148 post is close to the example).
* The fact-check is strict and sometimes pedantic (it flags "by birth" because the verse says "Brahmana"
  and "Sudra"); that is the right direction to err in, but it makes `needs_review` common.
* The videos' strongest moves (Ambedkar, the Constitution, today's incidents) are outside the book and so
  off by default (§4, outside facts).
* The Manusmriti PDF has no translator; Bühler's translation is likely but not confirmed.

## 9. Tests

```bash
python3 -m pytest backend/tests/test_manusmriti_trial_*.py        # the trial: verifier, ingest, generator, topics, API, published file
cd frontend && npx vitest run src/data/manusmriti.test.js         # the section's small decisions
```

They need no network, model or PDF (tests that compare with the real book or transcripts skip if those are absent).
The published file is re-verified against the verse text it carries itself, so that test runs on a fresh checkout too.
