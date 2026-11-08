"""
A writer can rate a generated post up or down, and nothing else.

The rating rides on the ordinary PATCH /posts/{id}; the service stores every
field it is given, so the schema is the guard.
"""
import pytest
from pydantic import ValidationError


def test_feedback_accepts_up_and_down():
    from backend.schemas.posts import PostUpdateRequest

    assert PostUpdateRequest(feedback="up").model_dump(exclude_unset=True) == {"feedback": "up"}
    assert PostUpdateRequest(feedback="down").feedback == "down"


def test_feedback_rejects_anything_else():
    from backend.schemas.posts import PostUpdateRequest

    with pytest.raises(ValidationError):
        PostUpdateRequest(feedback="meh")
