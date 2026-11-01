"""One user can generate five posts from one story, in all."""
import pytest
from fastapi import HTTPException

from backend.services.posts_service import MAX_POSTS_PER_STORY, PostsService

USER = "64b000000000000000000001"
NEWS = "64b000000000000000000002"


class _Repo:
    def __init__(self, written):
        self.written = written

    def count_for_story(self, user_id, news_id):
        return self.written


def _service(written):
    svc = PostsService.__new__(PostsService)  # no __init__: only the repo is used
    svc.repo = _Repo(written)
    return svc


def test_the_limit_is_five():
    assert MAX_POSTS_PER_STORY == 5


@pytest.mark.parametrize("written", [0, 1, 4])
def test_each_post_takes_the_next_slot(written):
    assert _service(written)._next_story_slot(USER, NEWS) == written + 1


def test_a_sixth_post_is_refused():
    with pytest.raises(HTTPException) as caught:
        _service(5)._next_story_slot(USER, NEWS)
    assert caught.value.status_code == 409
    assert caught.value.detail["error"] == "story_limit"
    assert "5 posts" in caught.value.detail["message"]
