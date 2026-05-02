"""SMTP email sender — reuses settings from config.py (Gmail App Password)."""
from __future__ import annotations
import smtplib
import ssl
import logging
from email.message import EmailMessage
from typing import Optional, List
from config import settings

logger = logging.getLogger(__name__)


def send_email(
    to: str | List[str],
    subject: str,
    body_text: str,
    body_html: Optional[str] = None,
    from_name: str = "School ERP",
) -> bool:
    """Send an email via Gmail SMTP using the configured App Password.

    Returns True on success, False otherwise (errors are logged, not raised,
    so an OTP request can still be retried by the caller if needed).
    """
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.error("SMTP credentials missing — cannot send email")
        return False

    recipients = [to] if isinstance(to, str) else list(to)

    msg = EmailMessage()
    msg["From"] = f"{from_name} <{settings.SMTP_FROM_EMAIL or settings.SMTP_USER}>"
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = subject
    msg.set_content(body_text)
    if body_html:
        msg.add_alternative(body_html, subtype="html")

    try:
        ctx = ssl.create_default_context()
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as server:
            server.ehlo()
            server.starttls(context=ctx)
            server.ehlo()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
        logger.info("Email sent to %s — subject=%r", recipients, subject)
        return True
    except Exception as e:
        logger.exception("Failed to send email to %s: %s", recipients, e)
        return False


def send_otp_email(to_email: str, otp: str, valid_minutes: int = 5, recipient_name: str = "") -> bool:
    """Pre-formatted OTP email."""
    greeting = f"Hi {recipient_name}," if recipient_name else "Hi,"
    text = (
        f"{greeting}\n\n"
        f"Your one-time password (OTP) for the School ERP mobile app is:\n\n"
        f"    {otp}\n\n"
        f"This OTP is valid for {valid_minutes} minutes. Do not share it with anyone.\n\n"
        f"If you did not request this, please ignore this email.\n"
    )
    html = f"""
    <html><body style="font-family: Arial, sans-serif; padding: 20px;">
      <p>{greeting}</p>
      <p>Your one-time password (OTP) for the <b>School ERP mobile app</b> is:</p>
      <div style="font-size: 28px; font-weight: bold; letter-spacing: 6px;
                  background:#f4f4f5;border-radius:8px;padding:14px 18px;
                  display:inline-block;color:#0f766e;margin:8px 0;">{otp}</div>
      <p>This OTP is valid for <b>{valid_minutes} minutes</b>. Do not share it with anyone.</p>
      <p style="color:#6b7280;font-size:12px;">If you did not request this, please ignore this email.</p>
    </body></html>
    """
    return send_email(to_email, "Your School ERP OTP", text, html)
