"""
Who counts as an admin.

Admins are listed by user id in the ADMIN_USER_IDS environment variable,
comma separated, for example:

    ADMIN_USER_IDS=6712ab34cd56ef7890123456,6712ab34cd56ef7890654321

An env var rather than a field on the user, because nobody can make
themselves an admin through the API, and taking access away is one config
change. If the variable is empty, nobody is an admin (fail closed).
"""
import os

from fastapi import Depends, HTTPException, status

from backend.core.dependencies import get_current_user_id


def admin_user_ids() -> set[str]:
    raw = os.getenv("ADMIN_USER_IDS", "")
    return {part.strip() for part in raw.split(",") if part.strip()}


def is_admin(user_id: str) -> bool:
    return user_id in admin_user_ids()


def require_admin(current_user_id: str = Depends(get_current_user_id)) -> str:
    """FastAPI dependency: the signed-in user's id, or 403 if they are not an admin."""
    if not is_admin(current_user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins only.")
    return current_user_id
