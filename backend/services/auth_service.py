import jwt
from fastapi import HTTPException, status

from backend.core.auth_constants import (
    AUTH_PROVIDER_GOOGLE,
    AUTH_PROVIDER_PASSWORD,
    AUTH_PROVIDER_PHONE,
    OTP_PURPOSE_LOGIN_VERIFY,
    OTP_PURPOSE_RESET_PASSWORD,
    OTP_PURPOSE_SIGNUP_VERIFY,
)
from backend.core.config import settings
from backend.repositories.otp_repo import OtpRepository
from backend.repositories.sessions_repo import SessionsRepository
from backend.repositories.users_repo import UsersRepository
from backend.schemas.auth import AuthResponse, AuthTokens, UserPublic
from backend.services.google_auth import fetch_google_userinfo
from backend.services.otp_service import build_hashed_otp, otp_expiry_time
from backend.services.security import hash_password, verify_otp_hash, verify_password
from backend.services.email_service import try_send_otp_email


def _ROLE_KEYS() -> set:
    from backend.pipeline.party_roles import ROLES

    return set(ROLES)

from backend.services.sms_service import try_send_otp_sms
from backend.services.token_service import create_access_token, create_refresh_token, decode_token


class AuthService:
    def __init__(self) -> None:
        self.users_repo = UsersRepository()
        self.otp_repo = OtpRepository()
        self.sessions_repo = SessionsRepository()

    def signup(
        self,
        username: str,
        password: str | None,
        email: str | None,
        phone: str | None,
        political_party: str | None,
        party_position: str | None = None,
        state: str | None = None,
        city: str | None = None,
        date_of_birth: str | None = None,
    ) -> AuthResponse:
        if self.users_repo.find_by_username(username):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists.")
        if email and self.users_repo.find_by_email(email):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists.")
        if phone and self.users_repo.find_by_phone(phone):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phone already exists.")

        auth_providers = [AUTH_PROVIDER_PASSWORD] if email else [AUTH_PROVIDER_PHONE]
        user = self.users_repo.create_user(
            username=username,
            password_hash=hash_password(password) if password else None,
            email=email,
            phone=phone,
            political_party=political_party,
            # Unknown keys are dropped rather than stored: a stale id resolves
            # to no guidance later and looks like the setting doing nothing.
            party_position=(party_position or "").strip() if (party_position or "").strip() in _ROLE_KEYS() else "",
            auth_providers=auth_providers,
            state=state,
            city=city,
            date_of_birth=date_of_birth,
        )

        channel = "email" if email else "phone"
        target = email or phone
        otp_code, otp_hash = build_hashed_otp()
        self.otp_repo.create_otp(
            user_id=user["_id"],
            channel=channel,
            target=target or "",
            otp_hash=otp_hash,
            purpose=OTP_PURPOSE_SIGNUP_VERIFY,
            max_attempts=settings.otp_max_attempts,
            expires_at=otp_expiry_time(),
        )

        # Deliver it. Without this the code existed only in the database, and
        # only development ever saw it, via the debug field below.
        if channel == "email" and target:
            try_send_otp_email(target, otp_code, kind="signup")
        else:
            try_send_otp_sms(target or "", otp_code)

        auth_response = self._issue_session(user, otp_required=True, otp_target=target)
        if settings.auth_debug_return_otp and settings.app_env in {"development", "dev", "test", "testing"}:
            auth_response.dev_otp = otp_code
        return auth_response

    def send_phone_otp(
        self,
        phone: str,
        purpose: str,
        username: str | None = None,
        political_party: str | None = None,
        party_position: str | None = None,
        state: str | None = None,
        city: str | None = None,
        date_of_birth: str | None = None,
    ) -> AuthResponse:
        """Create/find phone user, generate OTP in MongoDB, issue session tokens, attempt SMS."""
        if purpose == OTP_PURPOSE_SIGNUP_VERIFY:
            existing = self.users_repo.find_by_phone(phone)
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An account with this phone number already exists.",
                )
            _username = username or ("user_" + phone.replace("+", "").replace(" ", "")[-8:])
            while self.users_repo.find_by_username(_username):
                _username = _username + "_1"
            user = self.users_repo.create_user(
                username=_username,
                password_hash=None,
                email=None,
                phone=phone,
                political_party=political_party,
                party_position=(party_position or "").strip() if (party_position or "").strip() in _ROLE_KEYS() else "",
                auth_providers=[AUTH_PROVIDER_PHONE],
                state=state,
                city=city,
                date_of_birth=date_of_birth,
            )
        else:
            user = self.users_repo.find_by_phone(phone)
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="No account found with this phone number.",
                )

        otp_code, otp_hash = build_hashed_otp()
        self.otp_repo.create_otp(
            user_id=user["_id"],
            channel="phone",
            target=phone,
            otp_hash=otp_hash,
            purpose=purpose,
            max_attempts=settings.otp_max_attempts,
            expires_at=otp_expiry_time(),
        )

        try_send_otp_sms(phone, otp_code)

        auth_response = self._issue_session(user, otp_required=True, otp_target=phone)
        if settings.auth_debug_return_otp and settings.app_env in {"development", "dev", "test", "testing"}:
            auth_response.dev_otp = otp_code
        return auth_response

    def resend_otp(self, target: str, channel: str, purpose: str) -> dict:
        """Delete any existing OTP for this target/channel/purpose and issue a fresh one."""
        user = self.users_repo.find_by_identifier(target)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No account found.")

        self.otp_repo.delete_for_target(target=target, channel=channel, purpose=purpose)

        otp_code, otp_hash = build_hashed_otp()
        self.otp_repo.create_otp(
            user_id=user["_id"],
            channel=channel,
            target=target,
            otp_hash=otp_hash,
            purpose=purpose,
            max_attempts=settings.otp_max_attempts,
            expires_at=otp_expiry_time(),
        )

        if channel == "phone":
            try_send_otp_sms(target, otp_code)
        else:
            kind = "reset" if purpose == OTP_PURPOSE_RESET_PASSWORD else "signup"
            try_send_otp_email(target, otp_code, kind=kind)

        result: dict = {"message": "A new verification code has been sent."}
        if settings.auth_debug_return_otp and settings.app_env in {"development", "dev", "test", "testing"}:
            result["dev_otp"] = otp_code
        return result

    def verify_otp(self, target: str, channel: str, otp_code: str, purpose: str) -> dict:
        otp_doc = self.otp_repo.get_active_otp(target=target, channel=channel, purpose=purpose)
        if not otp_doc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OTP not found or expired.")

        if otp_doc.get("attempt_count", 0) >= otp_doc.get("max_attempts", settings.otp_max_attempts):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OTP max attempts exceeded.")

        if not verify_otp_hash(otp_code, otp_doc["otp_hash"]):
            self.otp_repo.increment_attempt(otp_doc["_id"])
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OTP.")

        self.otp_repo.consume(otp_doc["_id"])
        user_id = otp_doc.get("user_id")
        if user_id:
            self.users_repo.verify_channel(user_id, channel)
        return {"message": "OTP verified successfully."}

    def login(self, identifier: str, password: str | None) -> AuthResponse:
        if not password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="phone_otp_required",
            )
        user = self.users_repo.find_by_identifier(identifier)
        if not user or not user.get("password_hash"):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

        if not verify_password(password, user["password_hash"]):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

        if not (user.get("is_email_verified") or user.get("is_phone_verified")):
            channel = "email" if user.get("email") else "phone"
            target = user.get("email") or user.get("phone")
            otp_code, otp_hash = build_hashed_otp()
            self.otp_repo.create_otp(
                user_id=user["_id"],
                channel=channel,
                target=target or "",
                otp_hash=otp_hash,
                purpose=OTP_PURPOSE_LOGIN_VERIFY,
                max_attempts=settings.otp_max_attempts,
                expires_at=otp_expiry_time(),
            )
            auth_response = self._issue_session(user, otp_required=True, otp_target=target)
            if settings.auth_debug_return_otp and settings.app_env in {"development", "dev", "test", "testing"}:
                auth_response.dev_otp = otp_code
            return auth_response

        return self._issue_session(user)

    def forgot_password(self, email: str) -> dict:
        user = self.users_repo.find_by_email(email)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No account found with this email.")

        providers = user.get("auth_providers", [])
        if AUTH_PROVIDER_PASSWORD not in providers:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="google_account",
            )

        otp_code, otp_hash = build_hashed_otp()
        self.otp_repo.create_otp(
            user_id=user["_id"],
            channel="email",
            target=email,
            otp_hash=otp_hash,
            purpose=OTP_PURPOSE_RESET_PASSWORD,
            max_attempts=settings.otp_max_attempts,
            expires_at=otp_expiry_time(),
        )
        try_send_otp_email(email, otp_code, kind="reset")

        result: dict = {"message": "Verification code sent to your email."}
        if settings.auth_debug_return_otp and settings.app_env in {"development", "dev", "test", "testing"}:
            result["dev_otp"] = otp_code
        return result

    def google_login(self, access_token: str, political_party: str | None = None) -> AuthResponse:
        payload = fetch_google_userinfo(access_token)
        email = payload.get("email")
        if not email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google account email missing.")
        user = self.users_repo.upsert_google_user(
            email=email,
            username_seed=payload.get("name") or email.split("@")[0],
            political_party=political_party,
        )
        if AUTH_PROVIDER_GOOGLE not in user.get("auth_providers", []):
            user["auth_providers"] = sorted(set(user.get("auth_providers", []) + [AUTH_PROVIDER_GOOGLE]))
        return self._issue_session(user)

    def refresh(self, refresh_token: str) -> AuthResponse:
        session_doc = self.sessions_repo.find_active_by_refresh(refresh_token)
        if not session_doc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token.")
        payload = self._decode_or_401(refresh_token, "refresh")
        user = self.users_repo.find_by_id(str(session_doc["user_id"]))
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

        access_token, access_expires_at = create_access_token(str(user["_id"]))
        new_refresh_token, refresh_expires_at = create_refresh_token(str(user["_id"]))
        self.sessions_repo.rotate_tokens(
            session_doc["_id"], access_token, new_refresh_token, access_expires_at, refresh_expires_at
        )
        return self._build_auth_response(user, access_token, new_refresh_token, access_expires_at, refresh_expires_at)

    def logout(self, refresh_token: str) -> dict:
        revoked = self.sessions_repo.revoke_by_refresh(refresh_token)
        if not revoked:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
        return {"message": "Logged out successfully."}

    def _decode_or_401(self, token: str, expected_type: str) -> dict:
        """
        Decode a token, converting JWT library errors into 401s.

        decode_token raises jwt exceptions. Uncaught, an expired token surfaces
        as a 500, which a client cannot tell apart from a server fault — so it
        never knows to refresh the session or send the user back to login.
        """
        try:
            payload = decode_token(token)
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired."
            ) from None
        except jwt.InvalidTokenError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token."
            ) from None
        if payload.get("type") != expected_type:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid {expected_type} token.",
            )
        return payload

    def me(self, bearer_token: str) -> UserPublic:
        payload = self._decode_or_401(bearer_token, "access")
        user = self.users_repo.find_by_id(payload["sub"])
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
        return self._to_user_public(user)

    def _issue_session(self, user: dict, otp_required: bool = False, otp_target: str | None = None) -> AuthResponse:
        access_token, access_expires_at = create_access_token(str(user["_id"]))
        refresh_token, refresh_expires_at = create_refresh_token(str(user["_id"]))
        self.sessions_repo.create_session(
            user_id=user["_id"],
            access_token=access_token,
            refresh_token=refresh_token,
            access_expires_at=access_expires_at,
            refresh_expires_at=refresh_expires_at,
        )
        self.users_repo.update_last_login(user["_id"])
        return self._build_auth_response(
            user, access_token, refresh_token, access_expires_at, refresh_expires_at, otp_required, otp_target
        )

    def update_profile(
        self,
        bearer_token: str,
        full_name: str | None,
        username: str | None,
        political_party: str | None = None,
        party_position: str | None = None,
        email: str | None = None,
        phone: str | None = None,
        state: str | None = None,
        city: str | None = None,
        date_of_birth: str | None = None,
    ) -> UserPublic:
        payload = self._decode_or_401(bearer_token, "access")
        user = self.users_repo.find_by_id(payload["sub"])
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

        fields: dict = {}
        if full_name is not None:
            fields["full_name"] = full_name.strip()
        if username is not None:
            username = username.strip()
            existing = self.users_repo.find_by_username(username)
            if existing and str(existing["_id"]) != str(user["_id"]):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken.")
            fields["username"] = username
        # Party and position are both set once and then fixed.
        #
        # Every answer is stored against an id that names the party -
        # party_inc_q1, pos_inc_national_q3 - so moving to another party leaves
        # all fifteen behind at once and the posts quietly change character
        # with nothing on screen to explain it. The position is the same story
        # one level down: the five answers are written for one level, so
        # changing it silently retires them and the writing shifts without
        # anything on screen saying why.
        #
        # Re-sending the same value is allowed, so saving the form again is not
        # an error. Setting one that was never set is allowed too: this locks a
        # choice, it does not force one. Correcting a genuine mistake is a
        # database edit, deliberately - it should involve someone who can also
        # clear the answers left behind.
        #
        # Both screens say so before the choice is made, because a lock the
        # user only meets as a 409 is a trap rather than a rule.
        if political_party is not None:
            new_party = political_party.strip()
            current_party = str(user.get("political_party") or "").strip()
            if current_party and new_party != current_party:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Your party is already set and cannot be changed.",
                )
            fields["political_party"] = new_party
        if party_position is not None:
            # Unknown keys are dropped rather than stored: a stale id would sit
            # on the user forever and resolve to no guidance at generation time,
            # which looks like the setting silently doing nothing.
            from backend.pipeline.party_roles import ROLES

            pos = party_position.strip()
            pos = pos if pos in ROLES else ""
            current_pos = str(user.get("party_position") or "").strip()
            # An unknown key arriving as "" must not read as "clear it": that
            # would unlock the field for anyone who can send a bad id.
            if current_pos and pos != current_pos:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Your role is already set and cannot be changed.",
                )
            fields["party_position"] = pos
        if email is not None:
            email = email.strip().lower()
            if email and (existing := self.users_repo.find_by_email(email)) and str(existing["_id"]) != str(user["_id"]):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists.")
            fields["email"] = email or None
        if phone is not None:
            phone = phone.strip()
            if phone and (existing := self.users_repo.find_by_phone(phone)) and str(existing["_id"]) != str(user["_id"]):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phone already exists.")
            fields["phone"] = phone or None
        if state is not None:
            fields["state"] = state.strip()
        if city is not None:
            fields["city"] = city.strip()
        if date_of_birth is not None:
            fields["date_of_birth"] = date_of_birth.strip()

        if fields:
            user = self.users_repo.update_profile(user["_id"], fields)
        return self._to_user_public(user)

    def _to_user_public(self, user: dict) -> UserPublic:
        return UserPublic(
            id=str(user["_id"]),
            username=user["username"],
            full_name=user.get("full_name"),
            email=user.get("email"),
            phone=user.get("phone"),
            political_party=user.get("political_party"),
            party_position=user.get("party_position"),
            state=user.get("state"),
            city=user.get("city"),
            date_of_birth=user.get("date_of_birth"),
            is_email_verified=bool(user.get("is_email_verified")),
            is_phone_verified=bool(user.get("is_phone_verified")),
            auth_providers=user.get("auth_providers", []),
            created_at=user["created_at"],
        )

    def _build_auth_response(
        self,
        user: dict,
        access_token: str,
        refresh_token: str,
        access_expires_at,
        refresh_expires_at,
        otp_required: bool = False,
        otp_target: str | None = None,
    ) -> AuthResponse:
        return AuthResponse(
            user=self._to_user_public(user),
            tokens=AuthTokens(
                access_token=access_token,
                refresh_token=refresh_token,
                access_expires_at=access_expires_at,
                refresh_expires_at=refresh_expires_at,
            ),
            otp_required=otp_required,
            otp_target=otp_target,
        )
