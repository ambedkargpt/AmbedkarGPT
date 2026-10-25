from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, model_validator


class SignupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, min_length=8, max_length=20)
    political_party: Optional[str] = Field(default=None, min_length=1, max_length=120)
    # A key from backend.pipeline.party_roles. Optional: a signup should not be
    # gated on someone knowing their exact title.
    party_position: Optional[str] = Field(default=None, max_length=60)
    # state/city are mandatory (the frontend's city list cascades off the
    # chosen state); a phone given alongside an email signup — or vice versa —
    # and date_of_birth stay optional, stored unverified like any other detail
    # supplied here.
    state: str = Field(min_length=1, max_length=100)
    city: str = Field(min_length=1, max_length=100)
    date_of_birth: Optional[str] = Field(default=None, max_length=10, description="YYYY-MM-DD")

    @model_validator(mode="after")
    def validate_contact(self) -> "SignupRequest":
        if not self.email and not self.phone:
            raise ValueError("At least one of email or phone is required.")
        if self.email and not self.password:
            raise ValueError("Password is required for email signup.")
        return self


class VerifyOtpRequest(BaseModel):
    target: str
    channel: Literal["email", "phone"]
    otp_code: str = Field(min_length=4, max_length=8)
    purpose: Literal["signup_verify", "login_verify", "reset_password", "change_contact"] = "signup_verify"


class LoginRequest(BaseModel):
    identifier: str = Field(description="Username, email, or phone")
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)


class SendPhoneOtpRequest(BaseModel):
    phone: str = Field(min_length=8, max_length=20)
    purpose: Literal["signup_verify", "login_verify"]
    username: Optional[str] = Field(default=None, min_length=3, max_length=50)
    political_party: Optional[str] = Field(default=None, min_length=1, max_length=120)
    # Signup by phone creates the account here rather than in signup(), so the
    # position has to travel this path too or it is lost for phone users.
    party_position: Optional[str] = Field(default=None, max_length=60)
    # Optional at the field level because login_verify reuses this schema and
    # never creates a user; validate_signup_fields below requires state/city
    # when purpose is actually signup_verify, matching SignupRequest.
    state: Optional[str] = Field(default=None, max_length=100)
    city: Optional[str] = Field(default=None, max_length=100)
    date_of_birth: Optional[str] = Field(default=None, max_length=10, description="YYYY-MM-DD")

    @model_validator(mode="after")
    def validate_signup_fields(self) -> "SendPhoneOtpRequest":
        if self.purpose == "signup_verify":
            if not self.state or not self.state.strip():
                raise ValueError("State is required.")
            if not self.city or not self.city.strip():
                raise ValueError("City is required.")
        return self


class SendPhoneOtpResponse(BaseModel):
    message: str
    otp_required: bool = True
    otp_target: Optional[str] = None
    dev_otp: Optional[str] = None


class ResendOtpRequest(BaseModel):
    target: str
    channel: Literal["email", "phone"]
    purpose: Literal["signup_verify", "login_verify", "reset_password", "change_contact"]


class ResendOtpResponse(BaseModel):
    message: str
    dev_otp: Optional[str] = None


class GoogleLoginRequest(BaseModel):
    access_token: str
    political_party: Optional[str] = None


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class UserPublic(BaseModel):
    id: str
    username: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    political_party: Optional[str] = None
    party_position: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    date_of_birth: Optional[str] = None
    is_email_verified: bool
    is_phone_verified: bool
    auth_providers: list[str]
    created_at: datetime


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    username: Optional[str] = Field(default=None, min_length=3, max_length=50)
    political_party: Optional[str] = Field(default=None, min_length=1, max_length=120)
    # A key from backend.pipeline.party_roles, not a display title. Empty string
    # is meaningful here: it is how someone clears the position they set.
    party_position: Optional[str] = Field(default=None, max_length=60)
    # Filling in whichever of email/phone a signup didn't collect. Unverified
    # until someone builds the OTP round-trip for it — same trust level as a
    # secondary contact supplied at signup.
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, min_length=8, max_length=20)
    # Optional here even though signup now requires both: editing an existing
    # profile shouldn't force someone to re-supply fields unrelated to what
    # they're actually changing.
    state: Optional[str] = Field(default=None, max_length=100)
    city: Optional[str] = Field(default=None, max_length=100)
    date_of_birth: Optional[str] = Field(default=None, max_length=10, description="YYYY-MM-DD")


class AuthTokens(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    access_expires_at: datetime
    refresh_expires_at: datetime


class AuthResponse(BaseModel):
    # Both are absent while an OTP is pending. A session is issued only once
    # the code is verified, and the account's details are not handed to
    # whoever typed a phone number or an email into the form.
    user: Optional[UserPublic] = None
    tokens: Optional[AuthTokens] = None
    message: Optional[str] = None
    otp_required: bool = False
    otp_target: Optional[str] = None
    dev_otp: Optional[str] = None


class MessageResponse(BaseModel):
    message: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str
    dev_otp: Optional[str] = None
