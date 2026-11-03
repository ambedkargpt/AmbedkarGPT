# Manusmriti critique: trial

A trial feature that writes **X (Twitter) posts criticising what the Manusmriti itself says**, using the
method the supplied YouTube videos use. Every fact in a post is a verse of the supplied Manusmriti PDF,
quoted word for word with its reference. Nothing is published automatically: a person reads each review
sheet and decides.

It is a trial, so it is built to be redone and removed:

* everything lives in this folder; the website does not import it;
* it is switched off unless `TRIAL_MANUSMRITI_CRITIQUE=true` is set (only used by the optional API mount, see §7);
* removing it is `git rm -r backend/trials backend/tests/test_manusmriti_trial_*.py` (see §6).

## 1. What was done, in order

| step | input | output | where |
|---|---|---|---|
| 1. Analyse the videos | 9 transcripts | one JSON per video: methods, contexts, beats, evidence, objections, quotes | `analysis/per_video/` |
| 2. Find the patterns | those 9 analyses | counts, then a hand-curated playbook | `analysis/aggregate.json` → `analysis/playbook.json` |
| 3. Write the report | the playbook | what the videos do and how the X posts follow it | `analysis/playbook.md` (**read this first**) |
| 4. Read the book | `Manu-Smriti.pdf` | 2,684 verses, English only, with page numbers | `sources/manusmriti_verses.json` |
| 5. Write posts | chosen verses + playbook | posts, checked and saved for review | `output/runs/<time>-<format>/review.md` |

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
```

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
```

If the optional API mount of §7 was added, also delete its one line (and the import) in `backend/main.py`.
Nothing else refers to this folder: no database tables, no migrations, no frontend files, no new
dependencies (`google-genai` and `openai` are already in `backend/requirements-api.txt`; PyMuPDF is needed only for the one-off ingest).

## 7. Putting it on the website (not done yet, on purpose)

Posts have not been approved by an owner, so no route or page exists. When they are:

* `backend/trials/manusmriti_critique/api.py`: a router that returns 404 unless `trial_enabled()` and is guarded by
  the existing `backend.core.admin.require_admin` (admins are listed in `ADMIN_USER_IDS`); it calls
  `generate.run(...)`, caps `variants`, and returns the posts with their status and issues. One `include_router`
  line behind the flag in `backend/main.py`, so with the flag off the route does not exist.
* The verse file (`sources/manusmriti_verses.json`) is not in git; on a server, run the ingest once or ship the
  file with the deployment (only if the translation's licence allows it).
* A frontend page only for admins, listing posts with their verses and status, and a copy button. Publishing
  to X stays manual.

## 8. Known limits

* Hooks and closers are often plain ("Is this justice?"). A human edit is expected; `--focus` helps.
* The model sometimes reuses the playbook's example wording (the 5.148 post is close to the example).
* The fact-check is strict and sometimes pedantic (it flags "by birth" because the verse says "Brahmana"
  and "Sudra"); that is the right direction to err in, but it makes `needs_review` common.
* The videos' strongest moves (Ambedkar, the Constitution, today's incidents) are outside the book and so
  off by default (§4, outside facts).
* The Manusmriti PDF has no translator; Bühler's translation is likely but not confirmed.

## 9. Tests

```bash
python3 -m pytest backend/tests/test_manusmriti_trial_*.py
```

They need no network, model or PDF (tests that compare with the real book or transcripts skip if those
are absent): the verifier, the ingest, the generator (with a fake model), the analysis validator and the
playbook.
