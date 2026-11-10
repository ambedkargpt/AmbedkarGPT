import time
from collections import defaultdict
from threading import Lock

from fastapi import APIRouter, Header, HTTPException, Request, status

from backend.schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    GoogleLoginRequest,
    GuestLoginRequest,
    LoginRequest,
    LogoutRequest,
    MessageResponse,
    RefreshRequest,
    ResendOtpRequest,
    ResendOtpResponse,
    SendPhoneOtpRequest,
    SignupRequest,
    UpdateProfileRequest,
    UserPublic,
    VerifyOtpRequest,
)
from backend.schemas.common import ErrorResponse
from backend.services.auth_service import AuthService


router = APIRouter(prefix="/auth", tags=["auth"])
service = AuthService()

# Simple in-process rate limiter: max 10 attempts per IP per 60 seconds
_rate_store: dict[str, list[float]] = defaultdict(list)
_rate_lock = Lock()
_RATE_LIMIT = 10
_RATE_WINDOW = 60


def _check_rate_limit(ip: str, endpoint: str) -> None:
    key = f"{ip}:{endpoint}"
    now = time.time()
    with _rate_lock:
        timestamps = [t for t in _rate_store[key] if now - t < _RATE_WINDOW]
        if len(timestamps) >= _RATE_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts. Please wait 60 seconds before trying again.",
            )
        timestamps.append(now)
        _rate_store[key] = timestamps


@router.post("/signup", response_model=AuthResponse, responses={400: {"model": ErrorResponse}, 409: {"model": ErrorResponse}})
def signup(payload: SignupRequest, request: Request) -> AuthResponse:
    _check_rate_limit(request.client.host if request.client else "unknown", "signup")
    return service.signup(
        username=payload.username.strip(),
        password=payload.password,
        email=payload.email.lower() if payload.email else None,
        phone=payload.phone.strip() if payload.phone else None,
        political_party=payload.political_party.strip() if payload.political_party else None,
        party_position=payload.party_position,
        state=payload.state.strip() if payload.state else None,
        city=payload.city.strip() if payload.city else None,
        date_of_birth=payload.date_of_birth,
    )


@router.post("/verify-otp", response_model=AuthResponse, responses={400: {"model": ErrorResponse}})
def verify_otp(payload: VerifyOtpRequest, request: Request) -> AuthResponse:
    _check_rate_limit(request.client.host if request.client else "unknown", "verify-otp")
    result = service.verify_otp(
        target=payload.target.strip(),
        channel=payload.channel,
        otp_code=payload.otp_code.strip(),
        purpose=payload.purpose,
    )
    return result


@router.post("/login", response_model=AuthResponse, responses={401: {"model": ErrorResponse}})
def login(payload: LoginRequest, request: Request) -> AuthResponse:
    _check_rate_limit(request.client.host if request.client else "unknown", "login")
    return service.login(identifier=payload.identifier.strip(), password=payload.password)


@router.post("/forgot-password", response_model=ForgotPasswordResponse, responses={400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}})
def forgot_password(payload: ForgotPasswordRequest, request: Request) -> ForgotPasswordResponse:
    _check_rate_limit(request.client.host if request.client else "unknown", "forgot-password")
    result = service.forgot_password(payload.email.lower().strip())
    return ForgotPasswordResponse(**result)


@router.post("/send-phone-otp", response_model=AuthResponse, responses={404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}})
def send_phone_otp(payload: SendPhoneOtpRequest, request: Request) -> AuthResponse:
    _check_rate_limit(request.client.host if request.client else "unknown", "send-phone-otp")
    return service.send_phone_otp(
        phone=payload.phone.strip(),
        purpose=payload.purpose,
        username=payload.username.strip() if payload.username else None,
        political_party=payload.political_party.strip() if payload.political_party else None,
        party_position=payload.party_position,
        state=payload.state.strip() if payload.state else None,
        city=payload.city.strip() if payload.city else None,
        date_of_birth=payload.date_of_birth,
    )


@router.post("/resend-otp", response_model=ResendOtpResponse, responses={404: {"model": ErrorResponse}})
def resend_otp(payload: ResendOtpRequest, request: Request) -> ResendOtpResponse:
    _check_rate_limit(request.client.host if request.client else "unknown", "resend-otp")
    result = service.resend_otp(
        target=payload.target.strip(),
        channel=payload.channel,
        purpose=payload.purpose,
    )
    return ResendOtpResponse(**result)


@router.post("/google-login", response_model=AuthResponse, responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}})
def google_login(payload: GoogleLoginRequest) -> AuthResponse:
    return service.google_login(payload.access_token, payload.political_party)


@router.post("/guest", response_model=AuthResponse, responses={429: {"model": ErrorResponse}})
def guest_login(payload: GuestLoginRequest, request: Request) -> AuthResponse:
    """"Continue as guest": a ready-made account for one party, no sign-up."""
    ip = request.client.host if request.client else "unknown"
    _check_rate_limit(ip, "guest")
    return service.guest_login(payload.party, payload.device_id, ip)


@router.post("/refresh", response_model=AuthResponse, responses={401: {"model": ErrorResponse}})
def refresh(payload: RefreshRequest, request: Request) -> AuthResponse:
    _check_rate_limit(request.client.host if request.client else "unknown", "refresh")
    return service.refresh(payload.refresh_token)


@router.post("/logout", response_model=MessageResponse, responses={404: {"model": ErrorResponse}})
def logout(payload: LogoutRequest) -> MessageResponse:
    result = service.logout(payload.refresh_token)
    return MessageResponse(**result)


@router.get("/me", response_model=UserPublic, responses={401: {"model": ErrorResponse}})
def me(authorization: str = Header(default="")) -> UserPublic:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token.")
    token = authorization.replace("Bearer ", "", 1).strip()
    return service.me(token)


@router.patch("/me", response_model=UserPublic, responses={401: {"model": ErrorResponse}, 409: {"model": ErrorResponse}})
def update_profile(payload: UpdateProfileRequest, authorization: str = Header(default="")) -> UserPublic:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token.")
    token = authorization.replace("Bearer ", "", 1).strip()
    return service.update_profile(
        token, payload.full_name, payload.username,
        payload.political_party, payload.party_position,
        payload.email, payload.phone, payload.state, payload.city, payload.date_of_birth,
    )
