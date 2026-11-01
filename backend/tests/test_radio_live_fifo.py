"""The bulletin keeps every channel's last 48 hours, and repeats only within a channel."""
from datetime import datetime, timedelta, timezone

from backend.worker.radio_live.build import _same_channel_groups, _window


def test_the_window_is_the_last_48_hours_up_to_now():
    now = datetime(2026, 11, 2, 0, 57, tzinfo=timezone.utc)
    start, end = _window(now)
    assert end == now
    assert start == now - timedelta(hours=48)


def test_a_story_leaves_when_it_turns_48_hours_old_not_at_midnight():
    published = datetime(2026, 10, 31, 0, 5, tzinfo=timezone.utc)
    start, _ = _window(published + timedelta(hours=47))
    assert start <= published
    start, _ = _window(published + timedelta(hours=49))
    assert start > published


def test_one_rally_on_two_channels_is_two_stories():
    channel_of = {"c1": "congress", "c2": "congress", "b1": "bjp", "g1": "general"}
    # The model put a whole rally day, every channel, in one group.
    groups = _same_channel_groups([["c1", "c2", "b1", "g1"]], channel_of)
    assert groups == [["c1", "c2"]]


def test_a_group_left_with_one_story_is_no_group():
    channel_of = {"c1": "congress", "b1": "bjp"}
    assert _same_channel_groups([["c1", "b1"]], channel_of) == []


def test_ids_the_bulletin_does_not_carry_are_ignored():
    channel_of = {"c1": "congress", "c2": "congress"}
    assert _same_channel_groups([["c1", "c2", "gone"]], channel_of) == [["c1", "c2"]]


def _sim(pairs, ids):
    pos = {i: k for k, i in enumerate(ids)}
    m = [[0.0] * len(ids) for _ in ids]
    for (a, b), v in pairs.items():
        m[pos[a]][pos[b]] = m[pos[b]][pos[a]] = v
    return pos, m


def test_a_group_holds_only_stories_whose_words_overlap():
    from backend.worker.radio_live.build import _confirmed_repeats

    ids = ["rally1", "rally2", "mehbooba", "farooq"]
    pos, sim = _sim({("rally1", "rally2"): 0.6, ("mehbooba", "farooq"): 0.1,
                     ("rally1", "mehbooba"): 0.12}, ids)
    # The model called the whole rally one event; only the two write-ups of
    # the same report are repeats.
    assert _confirmed_repeats([ids], pos, sim) == [["rally1", "rally2"]]


def test_overlap_joins_transitively():
    from backend.worker.radio_live.build import _confirmed_repeats

    ids = ["a", "b", "c"]
    pos, sim = _sim({("a", "b"): 0.4, ("b", "c"): 0.35, ("a", "c"): 0.1}, ids)
    assert sorted(_confirmed_repeats([ids], pos, sim)[0]) == ["a", "b", "c"]
