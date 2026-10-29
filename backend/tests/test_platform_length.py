"""The platform the user picks decides a post's length, and the post fits it."""
from backend.pipeline.generator import fit_to_platform, platform_content_length, tidy_hashtags
from backend.pipeline.post_validation import _word_ceiling
from backend.services.posts_service import _apply_platform_length

LONG_HI = (
    "महंगाई पर सरकार चुप है। रसोई गैस के दाम फिर बढ़े हैं और आम परिवार का बजट बिगड़ गया है। "
    "विपक्ष ने संसद में जवाब माँगा, पर मंत्री ने आँकड़े गिनाकर बात टाल दी। "
    "गाँवों में मज़दूरी नहीं बढ़ी, पर खर्च हर महीने बढ़ रहा है। "
    "किसानों को खाद समय पर नहीं मिली और लाइनों में घंटों खड़ा रहना पड़ा। "
    "जनता अब वादे नहीं, राहत चाहती है।\n\n#महंगाई #जवाब_दो #राहत"
)


def test_each_platform_has_a_length_with_a_word_ceiling():
    for label in ("Twitter / X", "Reddit", "WhatsApp"):
        length = platform_content_length(label)
        assert length
        assert _word_ceiling(length) > 0
    assert platform_content_length("Instagram") is None
    assert platform_content_length("") is None


def test_platform_length_replaces_the_preference():
    profile = {"target_platform": "Twitter / X", "content_length": "Extended (300 words)"}
    _apply_platform_length(profile)
    assert "280 characters" in profile["content_length"]

    untouched = {"content_length": "Short"}
    _apply_platform_length(untouched)
    assert untouched["content_length"] == "Short"


def test_a_tweet_over_280_is_cut_at_a_sentence_end():
    assert len(LONG_HI) > 280
    out = fit_to_platform(LONG_HI, "Twitter / X")
    assert len(out) <= 280
    assert out.endswith("।")


def test_shorten_is_tried_first_and_trimming_catches_a_long_answer():
    short = "महंगाई पर सरकार चुप है। जनता राहत चाहती है।\n\n#महंगाई"
    assert fit_to_platform(LONG_HI, "Twitter / X", shorten=lambda t, n: short) == short
    still_long = fit_to_platform(LONG_HI, "Twitter / X", shorten=lambda t, n: LONG_HI + LONG_HI)
    assert len(still_long) <= 280

    def broken(t, n):
        raise RuntimeError("down")

    assert len(fit_to_platform(LONG_HI, "Twitter / X", shorten=broken)) <= 280


def test_platforms_with_room_are_left_alone():
    assert fit_to_platform(LONG_HI, "WhatsApp") == LONG_HI
    assert fit_to_platform(LONG_HI, "Reddit") == LONG_HI
    assert fit_to_platform(LONG_HI, None) == LONG_HI


POST = "ईवीएम हटाओ\n\nकांग्रेस का सवाल सीधा है।\n\n#ऐक्य #SaveDemocracy #VoterRights #मतदाता_अधिकार"


def test_a_hindi_post_keeps_only_hindi_hashtags():
    assert tidy_hashtags(POST, "WhatsApp", "hi").endswith("#ऐक्य #मतदाता_अधिकार")


def test_a_line_of_english_hashtags_goes_entirely():
    out = tidy_hashtags("ईवीएम हटाओ\n\nसवाल सीधा है।\n\n#SaveDemocracy #Congress", "Twitter / X", "hi")
    assert out == "ईवीएम हटाओ\n\nसवाल सीधा है।"


def test_reddit_takes_no_hashtags():
    out = tidy_hashtags("शीर्षक\n\nयह #लोकतंत्र_बचाओ की बात है।\n\n#ऐक्य #Congress", "Reddit", "hi")
    assert "#" not in out
    assert out == "शीर्षक\n\nयह लोकतंत्र बचाओ की बात है।"


def test_an_english_translation_keeps_english_hashtags():
    text = "Remove EVMs\n\nThe question is simple.\n\n#SaveDemocracy"
    assert tidy_hashtags(text, "WhatsApp", "en") == text
