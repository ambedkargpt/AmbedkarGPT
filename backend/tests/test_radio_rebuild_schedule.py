"""When the radio bulletin is rebuilt. Each rebuild re-mixes the whole
bulletin, so small changes wait a little instead of costing one each."""
from datetime import datetime, timedelta, timezone

from backend.worker.radio_live.build import should_rebuild

NOW = datetime(2026, 11, 9, 12, 0, tzinfo=timezone.utc)
TODAY = "2026-11-09"


def _last(ids, minutes_ago, date=TODAY):
    return {"story_ids": ids, "date": date, "at": (NOW - timedelta(minutes=minutes_ago)).isoformat()}


def test_the_same_stories_never_rebuild():
    assert should_rebuild(_last(["a", "b"], 600), ["b", "a"], TODAY, NOW)[0] is False


def test_a_new_story_rebuilds_once_the_bulletin_is_30_minutes_old():
    assert should_rebuild(_last(["a"], 45), ["a", "b"], TODAY, NOW)[0] is True


def test_a_new_story_waits_while_the_bulletin_is_fresh():
    rebuild, reason = should_rebuild(_last(["a"], 10), ["a", "b"], TODAY, NOW)
    assert rebuild is False and "1 new" in reason


def test_stories_only_aging_out_wait_hours_not_minutes():
    assert should_rebuild(_last(["a", "b"], 120), ["a"], TODAY, NOW)[0] is False
    assert should_rebuild(_last(["a", "b"], 7 * 60), ["a"], TODAY, NOW)[0] is True


def test_a_new_day_and_force_always_rebuild():
    assert should_rebuild(_last(["a"], 5, date="2026-11-08"), ["a"], TODAY, NOW)[0] is True
    assert should_rebuild(_last(["a"], 5), ["a"], TODAY, NOW, force=True)[0] is True
    assert should_rebuild({}, ["a"], TODAY, NOW)[0] is True


def test_zero_restores_rebuilding_on_every_change(monkeypatch):
    monkeypatch.setenv("RADIO_MIN_REBUILD_MINUTES", "0")
    monkeypatch.setenv("RADIO_DROP_ONLY_HOURS", "0")
    assert should_rebuild(_last(["a"], 1), ["a", "b"], TODAY, NOW)[0] is True
    assert should_rebuild(_last(["a", "b"], 1), ["a"], TODAY, NOW)[0] is True


def test_a_bulletin_without_a_time_counts_as_old():
    last = {"story_ids": ["a"], "date": TODAY}
    assert should_rebuild(last, ["a", "b"], TODAY, NOW)[0] is True
