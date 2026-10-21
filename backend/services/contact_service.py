"""
Delivery for landing-page contact submissions.

Plain SMTP rather than a provider SDK, so the account behind it is an env-file
change rather than a code change. It runs on Gmail with an App Password, which
caps at roughly 500 messages a day: fine for a contact form, and the reason to
move to SES if this ever fronts something busier or needs to send from the
ambedkargpt.in domain.

Watch for hosts that accept mail and never deliver it, such as
``sandbox.smtp.mailtrap.io``, which this was pointed at first. Everything looks
successful and nothing arrives. ``backend.scripts.check_contact_email`` names
those hosts rather than reporting a clean send.
"""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from fastapi import HTTPException, status

from backend.core.config import settings
from backend.schemas.contact import ContactMessageRequest

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 20


def _body(payload: ContactMessageRequest) -> str:
    lines = [
        f"Name:    {payload.name}",
        f"Email:   {payload.email}",
    ]
    if payload.phone:
        lines.append(f"Phone:   {payload.phone}")
    if payload.address:
        lines.append(f"Address: {payload.address}")
    lines.append("")
    lines.append(payload.message.strip())
    lines.append("")
    lines.append("-- ")
    lines.append("Sent from the AmbedkarGPT contact form.")
    return "\n".join(lines)


def send_contact_message(payload: ContactMessageRequest) -> None:
    """
    Email one submission to the configured recipient.

    Raises HTTPException so the caller does not have to translate SMTP errors.
    """
    # A bot filled the hidden field. Accept the request so it sees success and
    # does not retry with a different shape, but send nothing.
    if payload.website:
        logger.info("[contact] honeypot filled, dropping submission from %s", payload.email)
        return

    if not settings.smtp_host or not settings.smtp_user:
        # Losing a prospective client's message silently is worse than a visible
        # failure, so refuse rather than pretend it was sent.
        logger.error("[contact] SMTP is not configured; refusing to accept the message")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Messages cannot be sent right now. Please email us directly.",
        )

    deliver(f"AmbedkarGPT contact form: {payload.name}", _body(payload), str(payload.email))
    logger.info(
        "[contact] message from %s delivered to %s via %s",
        payload.email,
        settings.contact_recipient_email,
        settings.smtp_host,
    )


def deliver(subject: str, body: str, reply_to: str) -> None:
    """Send one email to the configured recipient, or raise an HTTPException."""
    if not settings.smtp_host or not settings.smtp_user:
        logger.error("[contact] SMTP is not configured; refusing to accept the message")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Messages cannot be sent right now. Please email us directly.",
        )
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.contact_from_email
    msg["To"] = settings.contact_recipient_email
    # So hitting reply in the inbox answers the visitor rather than the sender
    # account the provider made us authenticate as.
    msg["Reply-To"] = reply_to
    msg.set_content(body)

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=_TIMEOUT_SECONDS) as smtp:
            smtp.ehlo()
            if settings.smtp_port != 465:
                smtp.starttls()
                smtp.ehlo()
            if settings.smtp_password:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)
    except smtplib.SMTPAuthenticationError as exc:
        logger.error("[contact] SMTP rejected the credentials: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Messages cannot be sent right now. Please email us directly.",
        ) from exc
    except Exception as exc:  # noqa: BLE001 - the visitor needs one clear answer
        logger.error("[contact] send failed via %s: %s", settings.smtp_host, exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Messages cannot be sent right now. Please email us directly.",
        ) from exc
