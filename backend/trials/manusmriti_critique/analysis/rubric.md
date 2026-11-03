# Rubric: analysing one transcript

**Purpose.** We are studying how speakers criticise the Manusmriti, so that a later step can write social-media
posts that criticise facts found in a Manusmriti text we supply, in a similar way. This analysis is about
*method*: how each speaker builds the case, in what context, with what evidence, in what tone. It is
not a verdict on the Manusmriti or on any speaker.

Everything is re-runnable: the same rubric, the same validator
(`tools/validate_analysis.py`), the same vocabulary (`taxonomy.py`). To add a transcript later, analyse it
with this rubric into `analysis/per_video/<video_id>.json` and run the validator.

## How to read the transcript

- Read the **whole** transcript, in order. Do not skim, do not stop at the first section. A long recording may
  be mostly about other things; say so and still read it all.
- Files are in `<transcripts dir>/`: `<id>.paragraphs.txt` (one block per ~20-30 seconds, each starting with
  `[mm:ss]`) and `<id>.txt` (the same text as one unbroken line, no timestamps). Some videos have only the
  `.txt`: use `pos:<character offset>` for `time` there (read it in slices of about 6,000 characters).
- Languages are Hindi, Hindi-English mixed, or Bengali. **Analyse in English; keep every quote in the original
  script.** Never translate inside a quote field (put a short English `gloss` beside it instead).

## Rules that make the analysis usable

1. **Quotes are verbatim.** Every `quote` / `verbatim` / `example` value is copied character-for-character from the
   transcript, 40 words at most, without the `[mm:ss]` markers and without crossing a paragraph break. Use `…`
   to join two pieces of one sentence. The validator rejects a quote it cannot find in the transcript.
2. **Describe, do not endorse, and do not correct from memory.** Say what the speaker claims the text says.
   For every claim about what a verse/rule says, set `needs_verification_against_text: true` unless it is only a
   historical or modern fact. If you are confident a claim contradicts the standard text, say so in `note`, and
   say how sure you are. The generator will later check claims against the supplied book text, not against this file.
3. **Be exhaustive on evidence.** List every distinct verse, rule, law, historical claim, statistic, incident or person
   the speaker uses to support a point (one entry each). A verse-by-verse video can have dozens.
4. **Use the vocabulary.** `methods[].method` from `taxonomy.METHODS`, `contexts[].context` from `taxonomy.CONTEXTS`,
   `structure[].beat` from `taxonomy.BEATS`, `evidence[].kind` from `taxonomy.EVIDENCE_KINDS`. If something fits none,
   write `new:<short_name>` and explain it in `description`.
5. **Not every transcript is a critique.** Some are debates, defences, or about something else. Set
   `stance_on_manusmriti` honestly (`critical`, `defends`, `mixed`, `counter_critique`, `not_about_manusmriti`) and
   `relevance.score` (0-5: how much of the recording is about criticising or defending the text). For a defence or counter-critique,
   fill the same fields for *their* method, put their objections in `counterarguments`, and in `weaknesses_or_risks`
   say where those objections are weak, so a critical post can anticipate them.
6. **Say what not to copy.** `do_not_imitate`: abuse, attacks on a religion's followers, unverifiable accusations,
   sweeping claims about whole communities, anything a careful critic would avoid.

## Output: one JSON object, saved as `analysis/per_video/<video_id>.json`

```json
{
  "schema_version": 1,
  "video_id": "…",
  "language": "hi | bn | hi-en",
  "duration": "mm:ss or h:mm:ss (last timestamp), or 'unknown'",
  "genre": "e.g. short monologue | verse-by-verse explainer | historical explainer | debate clip | long interview | religious polemic",
  "speaker_persona": "who is speaking and how they present themselves (use a name only if the speaker says it)",
  "stance_on_manusmriti": "critical | defends | mixed | counter_critique | not_about_manusmriti",
  "relevance": {"score": 0, "why": "…"},
  "audience_addressed": "who the speaker is talking to",
  "one_line_thesis": "…",
  "topic_map": [{"start": "mm:ss", "end": "mm:ss", "topic": "…"}],
  "structure": [
    {"beat": "hook", "start": "00:00", "end": "00:20", "summary": "…", "quote": "verbatim"}
  ],
  "hook": {"type": "…", "verbatim": "…", "why_it_works": "…"},
  "closing": {"type": "…", "verbatim": "…", "cta": "…"},
  "methods": [
    {"method": "verse_citation", "description": "how this speaker uses it here", "strength": "low | medium | high",
     "examples": [{"time": "00:24", "quote": "verbatim", "gloss": "English"}]}
  ],
  "contexts": [{"context": "legal_penal", "how_used": "…"}],
  "evidence": [
    {"time": "00:24", "reference_as_spoken": "chapter 8 verse 270", "claim_made": "…",
     "quote": "verbatim", "gloss": "English", "kind": "verse",
     "needs_verification_against_text": true, "note": "optional"}
  ],
  "authorities_cited": [{"name": "…", "how_used": "…", "time": "…"}],
  "rhetorical_devices": [{"device": "…", "example": "verbatim", "time": "…", "effect": "…"}],
  "counterarguments": [{"objection": "…", "response": "…", "time": "…", "quote": "verbatim"}],
  "tone": {"register": "…", "emotion": "…", "humour_or_sarcasm": "…", "vocabulary_notes": "…"},
  "persuasion_strengths": ["…"],
  "weaknesses_or_risks": ["…"],
  "reusable_template": ["step 1: …", "step 2: …"],
  "best_quotes_for_style": [{"time": "…", "quote": "verbatim", "note": "why this line is worth imitating (the move, not the words)"}],
  "do_not_imitate": ["…"]
}
```

`topic_map` is for recordings longer than ten minutes and is optional otherwise. `reusable_template` is a generic
skeleton, written with placeholders (`[offence]`, `[varna A]`, `[verse]`), of how a post in this speaker's style is built.

## Checking your file

```
python3 backend/trials/manusmriti_critique/tools/validate_analysis.py backend/trials/manusmriti_critique/analysis/per_video/<video_id>.json
```

Fix every ERROR and re-run until it reports `OK`. Warnings are advice (a thin analysis, an over-long quote).

## Method vocabulary (from `taxonomy.py`)

| id | meaning |
|---|---|
| `verse_citation` | Cites a specific chapter/verse (or a specific rule) and says what it prescribes. |
| `punishment_asymmetry` | The same offence carries different penalties depending on the varna of offender or victim. |
| `reverse_the_equation` | Flips the roles ("now reverse it...") to expose the unfairness. |
| `attribution_shield` | Distances the speaker from the claim: "I am not saying this, the book says it", or invites checking. |
| `contrast_with_other_text` | Sets the text against another text or tradition (Gita, Buddha, Constitution, another law code). |
| `authority_appeal` | Invokes Ambedkar, Phule, Periyar, Buddha, courts or scholars as authority. |
| `association_with_modern_leaders` | Ties the text to modern leaders or organisations who praised or promote it. |
| `origin_history_narrative` | Tells how varna, caste or untouchability arose historically. |
| `gender_rules` | Uses the rules on women (guardianship, property, marriage, widowhood) as evidence. |
| `economic_and_ritual_exclusion` | Shows exclusion from wealth, property, education, ritual or public life. |
| `constitution_vs_text` | Sets constitutional equality and rights against the text's rules. |
| `present_day_consequence` | Links today's discrimination or incidents to the text's legacy. |
| `rebuttal_of_apologetics` | Answers defenders: interpolation, "varna is not caste", "nobody follows it", "it also gave rights". |
| `audience_address` | Speaks directly to a specific audience (lower-caste viewer, women, the sceptic). |
| `shock_specificity` | Uses vivid concrete detail or numbers (cruel punishments, amounts, counts). |
| `irony_or_sarcasm` | Mocks or uses irony to puncture a claim. |
| `moral_framing_and_close` | Closes on a moral or value statement (humanity, equality) or a call to action. |
| `personal_testimony` | Uses the speaker's own experience, or a story or incident. |
| `comparative_religion_polemic` | Attacks one religion by contrast with another (**not to be imitated**). |
| `whataboutery_or_deflection` | Deflects to other religions' or communities' texts (an opposing move, to be anticipated). |
