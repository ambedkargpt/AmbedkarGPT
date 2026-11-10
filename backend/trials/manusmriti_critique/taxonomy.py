"""The vocabulary shared by the per-video analyses, the validator and the playbook.

One place, so a method counted in one video is the same method counted in another. A method that
fits none of these is recorded as "new:<short_name>" and reviewed when the playbook is synthesized.
"""

METHODS = {
    "verse_citation": "Cites a specific chapter/verse (or a specific rule) and says what it prescribes.",
    "punishment_asymmetry": "Shows the same offence carrying different penalties depending on the varna of offender or victim.",
    "reverse_the_equation": "Flips the roles ('now reverse it...') to expose the unfairness.",
    "attribution_shield": "Distances the speaker from the claim: 'I am not saying this, the book says it', or invites the viewer to check.",
    "contrast_with_other_text": "Sets the text against another text or tradition (Gita, Buddha, Constitution, another law code).",
    "authority_appeal": "Invokes Ambedkar, Phule, Periyar, Buddha, courts or scholars as authority.",
    "association_with_modern_leaders": "Ties the text to modern leaders or organisations who praised or promote it.",
    "origin_history_narrative": "Tells how varna, caste or untouchability arose historically.",
    "gender_rules": "Uses the rules on women (guardianship, property, marriage, widowhood) as evidence.",
    "economic_and_ritual_exclusion": "Shows exclusion from wealth, property, education, ritual or public life.",
    "constitution_vs_text": "Sets constitutional equality and rights against the text's rules.",
    "present_day_consequence": "Links today's discrimination or incidents to the text's legacy.",
    "rebuttal_of_apologetics": "Answers defenders: interpolation, 'varna is not caste', 'nobody follows it', 'it also gave rights'.",
    "audience_address": "Speaks directly to a specific audience (lower-caste viewer, women, the sceptic).",
    "shock_specificity": "Uses vivid concrete detail or numbers (cruel punishments, amounts, counts).",
    "irony_or_sarcasm": "Mocks or uses irony to puncture a claim.",
    "moral_framing_and_close": "Closes on a moral or value statement (humanity, equality) or a call to action.",
    "personal_testimony": "Uses the speaker's own experience, or a story or incident.",
    # Moves that appear in the material but are not to be copied, or that come from the other side:
    "comparative_religion_polemic": "Attacks one religion by contrast with another (NOT to be imitated).",
    "whataboutery_or_deflection": "Deflects to other religions' or communities' texts (an opposing move; to be anticipated).",
}

CONTEXTS = [
    "historical", "legal_penal", "gender", "economic", "political_modern", "constitutional",
    "religious_reform_movements", "contemporary_incident", "comparative_religion",
    "philosophical_ethical", "textual_criticism",
]

BEATS = [
    "hook", "setup", "evidence", "escalation", "reversal", "authority", "turn_to_present",
    "rebuttal", "moral_close", "cta", "signoff", "tangent",
]

STANCES = ["critical", "defends", "mixed", "counter_critique", "not_about_manusmriti"]

EVIDENCE_KINDS = [
    "verse", "law_code_comparison", "historical_fact", "statistic", "person_quote",
    "incident", "constitution", "legal_case",
]
