"""
Attendance Processor (shared module)
=====================================
Single entry point used by **both** the FastAPI app and the external
ws_sink (running as a systemd service on the VPS).

Given an (rfid_card, scan_time, terminal_sn) triple, it:

1. Resolves the RFID -> Student or Staff in the SchoolERP SQL Server.
2. Creates / updates the daily AttendanceLog (or StaffAttendance) row,
   determining check-in vs. check-out using the same rules as the
   original code path:
     - first scan of the day  -> check-in (status = "late" if after 09:00)
     - subsequent scans       -> check-out (60s debounce)
3. Sends the appropriate SMS (Twilio / Fast2SMS / MSG91 / generic) to
   the parent/staff using the active default SMSConfig + matching
   SMSTemplate. Falls back to a built-in template if none is configured.
4. Logs the SMS in SMSLog with deduplication (no duplicate SMS within
   5 minutes for the same person and event).

Pure synchronous, thread-safe, uses ``SessionLocal`` per call.
"""
from __future__ import annotations

import logging
import threading
from datetime import date, datetime, time as dt_time, timedelta
from typing import Optional, Tuple

import requests
from sqlalchemy.orm import Session, joinedload

from database import SessionLocal
from models import (
    AttendanceDevice,
    AttendanceLog,
    SMSConfig,
    SMSLog,
    SMSTemplate,
    Staff,
    StaffAttendance,
    Student,
)

logger = logging.getLogger(__name__)

SCHOOL_START_TIME = dt_time(9, 0, 0)
DUPLICATE_SCAN_GAP_SECONDS = 60       # ignore re-scan of same card within this window
SMS_DEDUP_WINDOW_MINUTES = 5          # safety net only; per-day uniqueness is the real guard
# Maximum age of a swipe (relative to "now") for which we will still send
# an SMS. Older events still update the attendance row but stay silent --
# this is what stops 48h backfill / catch-up bursts from spamming parents.
SMS_FRESHNESS_SECONDS = 10 * 60       # 10 minutes

# Per-RFID lock to serialize concurrent scans for the same card
_rfid_locks: dict[str, threading.Lock] = {}
_rfid_locks_guard = threading.Lock()


def _get_rfid_lock(rfid: str) -> threading.Lock:
    with _rfid_locks_guard:
        lock = _rfid_locks.get(rfid)
        if lock is None:
            lock = threading.Lock()
            _rfid_locks[rfid] = lock
        return lock


# ----------------------------------------------------------------------------
# Public API
# ----------------------------------------------------------------------------

def process_realtime_swipe(
    rfid_card: str,
    scan_time: datetime,
    terminal_sn: Optional[str] = None,
    allow_sms: Optional[bool] = None,
) -> dict:
    """
    Process a single swipe end-to-end.

    ``allow_sms`` overrides the freshness check:
      * None (default) -> SMS is sent only if scan_time is within
        SMS_FRESHNESS_SECONDS of now (prevents backfill spam).
      * True  -> force SMS (use only for guaranteed-real-time paths).
      * False -> never send SMS for this call (e.g. 48h backfill replay).

    Returns a dict describing what happened. Never raises -- all errors
    are logged and returned in ``status``/``message``.
    """
    rfid_card = (rfid_card or "").strip()
    if not rfid_card:
        return {"status": "error", "message": "empty rfid_card"}
    if scan_time is None:
        scan_time = datetime.now()

    if allow_sms is None:
        age = abs((datetime.now() - scan_time).total_seconds())
        sms_enabled = age <= SMS_FRESHNESS_SECONDS
    else:
        sms_enabled = bool(allow_sms)

    lock = _get_rfid_lock(rfid_card)
    with lock:
        return _process_inner(rfid_card, scan_time, terminal_sn, sms_enabled)


# ----------------------------------------------------------------------------
# Internals
# ----------------------------------------------------------------------------

def _process_inner(rfid_card: str, scan_time: datetime,
                   terminal_sn: Optional[str], sms_enabled: bool) -> dict:
    db: Session = SessionLocal()
    try:
        device_id = _resolve_device_id(db, terminal_sn)

        student = (
            db.query(Student)
            .options(joinedload(Student.class_info))
            .filter(Student.rfid_id == rfid_card)
            .first()
        )
        if student:
            return _process_student(db, student, device_id, rfid_card,
                                    scan_time, sms_enabled)

        staff = db.query(Staff).filter(Staff.rfid == rfid_card).first()
        if staff:
            return _process_staff(db, staff, device_id, scan_time, sms_enabled)

        logger.warning(
            "[AttendanceProcessor] Card %s not matched to any student or staff "
            "(terminal_sn=%s)", rfid_card, terminal_sn
        )
        return {"status": "no_match", "message": f"No student/staff with RFID {rfid_card}"}
    except Exception as exc:
        logger.exception("[AttendanceProcessor] error processing card %s: %s", rfid_card, exc)
        try:
            db.rollback()
        except Exception:
            pass
        return {"status": "error", "message": str(exc)}
    finally:
        db.close()


def _resolve_device_id(db: Session, terminal_sn: Optional[str]) -> Optional[int]:
    if not terminal_sn:
        return None
    dev = (
        db.query(AttendanceDevice)
        .filter(AttendanceDevice.serial_number == terminal_sn)
        .first()
    )
    return dev.id if dev else None


def register_device(serial_number: str, ip_address: str = "0.0.0.0",
                    model: str = "AiFace") -> Optional[int]:
    """Idempotently insert an AttendanceDevice row for a newly-seen serial.

    Called by ws_sink when the AiFace device first registers. Safe to
    call repeatedly -- existing rows are left untouched.
    Returns the device id or None on error.
    """
    db: Session = SessionLocal()
    try:
        dev = (
            db.query(AttendanceDevice)
            .filter(AttendanceDevice.serial_number == serial_number)
            .first()
        )
        if dev:
            return dev.id
        dev = AttendanceDevice(
            device_name=serial_number,
            device_model=model,
            serial_number=serial_number,
            ip_address=ip_address or "0.0.0.0",
            port=0,
            comm_key=0,
            connection_type="EasyTimePro",
            location="",
            status="connected",
            is_active=True,
            last_connected_at=datetime.utcnow(),
            last_heartbeat_at=datetime.utcnow(),
        )
        db.add(dev)
        db.commit()
        db.refresh(dev)
        logger.info("[AttendanceProcessor] auto-registered AttendanceDevice "
                    "sn=%s id=%s", serial_number, dev.id)
        return dev.id
    except Exception as exc:
        logger.exception("[AttendanceProcessor] register_device(%s) failed: %s",
                         serial_number, exc)
        try:
            db.rollback()
        except Exception:
            pass
        return None
    finally:
        db.close()


# ----- Student --------------------------------------------------------------

def _process_student(db: Session, student: Student, device_id: Optional[int],
                     rfid_card: str, scan_time: datetime,
                     sms_enabled: bool) -> dict:
    today = scan_time.date()
    existing = (
        db.query(AttendanceLog)
        .filter(
            AttendanceLog.student_id == student.id,
            AttendanceLog.attendance_date == today,
        )
        .first()
    )

    student_name = f"{student.first_name} {student.surname or ''}".strip()

    # Special case: an absent row was created by the 10 AM job. If the
    # student turns up later, reset the row to a normal check-in. Per the
    # SMS spec the absent SMS already counted as both check-in & check-out
    # for the day -> NO further SMS today.
    if existing and existing.status == "absent" and not existing.check_in_time:
        existing.status = "present" if scan_time.time() <= SCHOOL_START_TIME else "late"
        existing.check_in_time = scan_time
        existing.rfid_scanned = rfid_card
        existing.device_id = device_id
        existing.sms_sent = True   # absent SMS already counted as check-in
        existing.whatsapp_sent = True  # ... and as check-out
        existing.updated_at = datetime.utcnow()
        db.commit()
        logger.info("[AttendanceProcessor] Late arrival after absent SMS: %s -- "
                    "row reset to '%s', NO further SMS sent today",
                    student_name, existing.status)
        return {
            "status": "checkin_after_absent",
            "student_id": student.id,
            "student_name": student_name,
            "log_id": existing.id,
        }

    if existing and existing.check_in_time:
        gap = (scan_time - existing.check_in_time).total_seconds()
        if gap < DUPLICATE_SCAN_GAP_SECONDS and not existing.check_out_time:
            logger.info(
                "[AttendanceProcessor] Duplicate scan ignored for %s (gap=%.0fs)",
                student_name, gap,
            )
            return {"status": "duplicate", "student_name": student_name}

        # Always roll forward the check-out time so the latest swipe wins,
        # but only fire the SMS once per day.
        existing.check_out_time = scan_time
        existing.updated_at = datetime.utcnow()
        db.commit()
        logger.info("[AttendanceProcessor] Check-out: %s @ %s", student_name, scan_time)
        if sms_enabled and not existing.whatsapp_sent:
            sent = _send_student_sms(db, student, existing, "check_out", scan_time)
            if sent:
                existing.whatsapp_sent = True   # repurposed as "check-out SMS sent" flag
                try:
                    db.commit()
                except Exception:
                    db.rollback()
        return {
            "status": "checkout",
            "student_id": student.id,
            "student_name": student_name,
            "log_id": existing.id,
            "sms_sent": bool(sms_enabled and existing.whatsapp_sent),
        }

    # Check-in (new log). Status is just metadata; SMS template stays "check_in".
    status_val = "late" if scan_time.time() > SCHOOL_START_TIME else "present"
    new_log = AttendanceLog(
        student_id=student.id,
        device_id=device_id,
        rfid_scanned=rfid_card,
        attendance_date=today,
        check_in_time=scan_time,
        status=status_val,
        is_manual_entry=False,
    )
    db.add(new_log)
    db.commit()
    db.refresh(new_log)
    logger.info("[AttendanceProcessor] Check-in (%s): %s @ %s",
                status_val, student_name, scan_time)
    if sms_enabled:
        # Late students get an EXTRA "late arrival" alert SMS in addition
        # to the regular check-in SMS. Per-day SMSLog dedup inside
        # _send_student_sms ensures it never fires twice for the same day.
        if status_val == "late":
            _send_student_sms(db, student, new_log, "late", scan_time)
        if not new_log.sms_sent:
            sent = _send_student_sms(db, student, new_log, "check_in", scan_time)
            if sent:
                new_log.sms_sent = True
                try:
                    db.commit()
                except Exception:
                    db.rollback()
    return {
        "status": "checkin",
        "student_id": student.id,
        "student_name": student_name,
        "log_id": new_log.id,
        "attendance_status": status_val,
        "sms_sent": bool(sms_enabled and new_log.sms_sent),
    }


# ----- Staff ----------------------------------------------------------------

def _process_staff(db: Session, staff: Staff, device_id: Optional[int],
                   scan_time: datetime, sms_enabled: bool) -> dict:
    today = scan_time.date()
    existing = (
        db.query(StaffAttendance)
        .filter(
            StaffAttendance.staff_id == staff.id,
            StaffAttendance.attendance_date == today,
        )
        .first()
    )
    staff_name = f"{staff.first_name} {staff.last_name or ''}".strip()

    if existing and existing.check_in_time:
        gap = (scan_time - existing.check_in_time).total_seconds()
        if gap < DUPLICATE_SCAN_GAP_SECONDS and not existing.check_out_time:
            return {"status": "duplicate", "staff_name": staff_name}

        existing.check_out_time = scan_time
        existing.updated_at = datetime.utcnow()
        db.commit()
        logger.info("[AttendanceProcessor] Staff check-out: %s @ %s", staff_name, scan_time)
        if sms_enabled:
            _send_staff_sms(staff, "check_out", scan_time, existing.check_in_time)
        return {
            "status": "checkout",
            "staff_id": staff.id,
            "staff_name": staff_name,
        }

    status_val = "late" if scan_time.time() > SCHOOL_START_TIME else "present"
    new_att = StaffAttendance(
        staff_id=staff.id,
        attendance_date=today,
        check_in_time=scan_time,
        status=status_val,
        is_manual_entry=False,
    )
    db.add(new_att)
    db.commit()
    db.refresh(new_att)
    logger.info("[AttendanceProcessor] Staff check-in (%s): %s @ %s",
                status_val, staff_name, scan_time)
    if sms_enabled:
        # Late staff get an EXTRA late-arrival SMS in addition to the
        # regular check-in. Per-day SMSLog dedup inside _send_staff_sms
        # ensures it never fires twice for the same day.
        if status_val == "late":
            _send_staff_sms(staff, "late", scan_time, None)
        _send_staff_sms(staff, "check_in", scan_time, None)
    return {
        "status": "checkin",
        "staff_id": staff.id,
        "staff_name": staff_name,
    }


# ----------------------------------------------------------------------------
# SMS
# ----------------------------------------------------------------------------

_DEFAULT_TEMPLATES = {
    "check_in": "Dear Parent, your ward {student_name} ({class_name}) "
                "has arrived at school on {date} at {check_in_time}.",
    "late": "Dear Parent, your ward {student_name} ({class_name}) "
            "arrived LATE to school on {date} at {check_in_time}. "
            "Please ensure timely arrival going forward. - School Admin",
    "attendance_late": "Dear Parent, your ward {student_name} ({class_name}) "
                       "was late to school on {date}. Check-in time: {check_in_time}.",
    "check_out": "Dear Parent, your ward {student_name} ({class_name}) has left "
                 "school on {date}. Check-in: {check_in_time}, Check-out: {check_out_time}.",
    "staff_check_in": "Hello {staff_name}, your attendance has been marked. "
                      "Check-IN recorded on {date} at {check_in_time}. "
                      "Have a productive day. - School Admin",
    "staff_late": "Hello {staff_name}, you arrived LATE on {date} at "
                  "{check_in_time}. Please ensure timely arrival going "
                  "forward. - School Admin",
    "staff_check_out": "Hello {staff_name}, your Check-OUT has been recorded "
                       "on {date} at {check_out_time} "
                       "(Check-in was at {check_in_time}). "
                       "Thank you for your service today. - School Admin",
}


def _resolve_template_type(event_type: str, log_status: Optional[str]) -> str:
    # Per spec:
    #   - on-time student   -> 2 SMS/day: check_in, check_out
    #   - late student      -> 3 SMS/day: late, check_in, check_out
    #   - check_in SMS uses the standard "check_in" template (row is still
    #     flagged status='late' for attendance reports)
    if event_type == "late":
        return "late"
    if event_type == "check_out":
        return "check_out"
    return "check_in"


def _format_student_message(template_text: str, student: Student, log: AttendanceLog,
                            scan_time: datetime) -> str:
    name = f"{student.first_name} {student.surname or ''}".strip()
    cls = "N/A"
    if student.class_info:
        cls = f"{student.class_info.class_name} - {student.class_info.section_name}"
    cin = log.check_in_time.strftime("%I:%M %p") if log.check_in_time else "-"
    cout = log.check_out_time.strftime("%I:%M %p") if log.check_out_time else "-"
    return template_text.format(
        student_name=name,
        date=(log.attendance_date or scan_time.date()).strftime("%d-%m-%Y"),
        admission_number=student.admission_number,
        check_in_time=cin,
        check_out_time=cout,
        class_name=cls,
    )


def _format_staff_message(template_text: str, staff: Staff, scan_time: datetime,
                          check_in_time: Optional[datetime]) -> str:
    name = f"{staff.first_name} {staff.last_name or ''}".strip()
    cin = check_in_time.strftime("%I:%M %p") if check_in_time else scan_time.strftime("%I:%M %p")
    return template_text.format(
        staff_name=name,
        date=scan_time.date().strftime("%d-%m-%Y"),
        check_in_time=cin,
        check_out_time=scan_time.strftime("%I:%M %p"),
    )


def _send_student_sms(db: Session, student: Student, log: AttendanceLog,
                      event_type: str, scan_time: datetime) -> bool:
    """Returns True iff an SMS was actually dispatched successfully."""
    phone = (student.mobile_number or "").strip() or (student.phone_number or "").strip()
    if not phone:
        logger.info("[SMS] no phone for student %s -- skipping", student.id)
        return False

    template_type = _resolve_template_type(event_type, log.status)
    msg_type = f"attendance_{template_type}"

    # Hard guarantee: at most ONE successful SMS per (student, msg_type, day).
    today = (log.attendance_date or scan_time.date())
    day_start = datetime.combine(today, dt_time(0, 0, 0))
    day_end = day_start + timedelta(days=1)
    already = (
        db.query(SMSLog)
        .filter(
            SMSLog.student_id == student.id,
            SMSLog.message_type == msg_type,
            SMSLog.status == "sent",
            SMSLog.created_at >= day_start,
            SMSLog.created_at < day_end,
        )
        .first()
    )
    if already:
        logger.info("[SMS] %s already sent today for student %s (sms_log id=%s) -- "
                    "skipping", msg_type, student.id, already.id)
        return False

    config = _get_active_sms_config(db)
    template = _get_template(db, template_type)
    template_text = template.message_template if template else _DEFAULT_TEMPLATES[template_type]

    try:
        message = _format_student_message(template_text, student, log, scan_time)
    except Exception as fmt_err:
        logger.warning("[SMS] template format failed (%s) -- using default", fmt_err)
        message = _format_student_message(
            _DEFAULT_TEMPLATES[template_type], student, log, scan_time)

    sent_ok, response_text = _dispatch_sms(config, phone, message)
    _record_sms_log(db, config, student.id, phone, message, msg_type, sent_ok, response_text)
    return bool(sent_ok)


def _send_staff_sms(staff: Staff, event_type: str, scan_time: datetime,
                    check_in_time: Optional[datetime]) -> bool:
    phone = (staff.mobile or "").strip()
    if not phone:
        logger.info("[SMS] no phone for staff %s -- skipping", staff.id)
        return False

    template_type = "staff_check_out" if event_type == "check_out" else (
        "staff_late" if event_type == "late" else "staff_check_in"
    )
    msg_type = f"attendance_{template_type}"

    db: Session = SessionLocal()
    try:
        # Per-day uniqueness for staff (no FK to staff in sms_logs, so match
        # by phone + message_type + today).
        today = scan_time.date()
        day_start = datetime.combine(today, dt_time(0, 0, 0))
        day_end = day_start + timedelta(days=1)
        already = (
            db.query(SMSLog)
            .filter(
                SMSLog.phone_number == phone,
                SMSLog.message_type == msg_type,
                SMSLog.status == "sent",
                SMSLog.created_at >= day_start,
                SMSLog.created_at < day_end,
            )
            .first()
        )
        if already:
            logger.info("[SMS] %s already sent today for staff %s -- skipping",
                        msg_type, staff.id)
            return False

        config = _get_active_sms_config(db)
        template = _get_template(db, template_type)
        template_text = template.message_template if template else _DEFAULT_TEMPLATES[template_type]

        try:
            message = _format_staff_message(template_text, staff, scan_time, check_in_time)
        except Exception as fmt_err:
            logger.warning("[SMS] template format failed (%s) -- using default", fmt_err)
            message = _format_staff_message(
                _DEFAULT_TEMPLATES[template_type], staff, scan_time, check_in_time)

        sent_ok, response_text = _dispatch_sms(config, phone, message)
        _record_sms_log(db, config, None, phone, message, msg_type, sent_ok, response_text)
        return bool(sent_ok)
    finally:
        db.close()


def _get_active_sms_config(db: Session) -> Optional[SMSConfig]:
    return (
        db.query(SMSConfig)
        .filter(SMSConfig.is_active == True, SMSConfig.is_default == True)  # noqa: E712
        .first()
    )


def _get_template(db: Session, template_type: str) -> Optional[SMSTemplate]:
    return (
        db.query(SMSTemplate)
        .filter(SMSTemplate.template_type == template_type,
                SMSTemplate.is_active == True)  # noqa: E712
        .first()
    )


def _record_sms_log(db: Session, config: Optional[SMSConfig], student_id: Optional[int],
                    phone: str, message: str, msg_type: str,
                    sent_ok: bool, response_text: str) -> None:
    log = SMSLog(
        config_id=config.id if config else None,
        student_id=student_id,
        phone_number=phone,
        message=message,
        message_type=msg_type,
        status="sent" if sent_ok else "failed",
        sent_at=datetime.utcnow() if sent_ok else None,
        provider_response=(response_text or "")[:500],
    )
    db.add(log)
    try:
        db.commit()
    except Exception:
        db.rollback()


# ----- Provider dispatch (sync) ---------------------------------------------

def _normalize_phone(phone: str) -> str:
    phone = (phone or "").strip()
    if not phone:
        return phone
    if phone.startswith("+"):
        return phone
    if phone.startswith("0"):
        phone = phone[1:]
    if len(phone) == 10:
        return "+91" + phone
    return phone


def _dispatch_sms(config: Optional[SMSConfig], phone: str, message: str) -> Tuple[bool, str]:
    if not config:
        return False, "no_active_sms_config"
    phone = _normalize_phone(phone)
    if not phone:
        return False, "empty_phone"
    provider = (config.provider_name or "").lower()
    try:
        if provider == "twilio":
            return _send_twilio(config, phone, message)
        if provider == "fast2sms":
            return _send_fast2sms(config, phone, message)
        if provider == "msg91":
            return _send_msg91(config, phone, message)
        return _send_generic(config, phone, message)
    except Exception as exc:
        return False, f"{type(exc).__name__}: {exc}"


def _send_twilio(config: SMSConfig, phone: str, message: str) -> Tuple[bool, str]:
    url = f"https://api.twilio.com/2010-04-01/Accounts/{config.api_key}/Messages.json"
    payload = {"To": phone, "From": config.sender_id, "Body": message}
    auth = (config.api_key, config.api_secret or "")
    r = requests.post(url, data=payload, auth=auth, timeout=30)
    return (r.status_code in (200, 201)), r.text


def _send_fast2sms(config: SMSConfig, phone: str, message: str) -> Tuple[bool, str]:
    url = "https://www.fast2sms.com/dev/bulkV2"
    headers = {"authorization": config.api_key, "Content-Type": "application/json"}
    payload = {
        "route": "q",
        "message": message,
        "language": "english",
        "flash": 0,
        "numbers": phone.replace("+91", ""),
    }
    r = requests.post(url, json=payload, headers=headers, timeout=30)
    try:
        ok = bool(r.json().get("return"))
    except Exception:
        ok = False
    return ok, r.text


def _send_msg91(config: SMSConfig, phone: str, message: str) -> Tuple[bool, str]:
    url = "https://api.msg91.com/api/v5/flow/"
    headers = {"authkey": config.api_key, "content-type": "application/json"}
    payload = {
        "sender": config.sender_id,
        "route": "4",
        "country": "91",
        "sms": [{"message": message, "to": [phone.replace("+91", "")]}],
    }
    r = requests.post(url, json=payload, headers=headers, timeout=30)
    return (r.status_code == 200), r.text


def _send_generic(config: SMSConfig, phone: str, message: str) -> Tuple[bool, str]:
    if not config.base_url:
        return False, "no base_url for generic provider"
    params = {
        "apikey": config.api_key,
        "sender": config.sender_id,
        "numbers": phone,
        "message": message,
    }
    r = requests.get(config.base_url, params=params, timeout=30)
    return (r.status_code == 200), r.text


# ----------------------------------------------------------------------------
# Daily absent job (run by a 10:00 IST systemd timer)
# ----------------------------------------------------------------------------

_ABSENT_TEMPLATE = (
    "Dear Parent, your ward {student_name} ({class_name}) is marked ABSENT "
    "for {date}. Please contact the school if this is incorrect."
)


def mark_absent_students(today: Optional[date] = None) -> dict:
    """Mark every active student with no attendance row for ``today`` as absent
    and send EXACTLY ONE absent SMS per parent.

    The freshly-created absent row has ``sms_sent=True`` and
    ``whatsapp_sent=True`` so the live RFID pipeline will treat both
    check-in and check-out as already notified -- the parent will not
    receive any further SMS today, even if the child arrives late
    (rule #3 in the SMS spec). The status will be reset to present/late
    if a swipe arrives later (handled in _process_student).
    """
    if today is None:
        today = date.today()

    db: Session = SessionLocal()
    sent_count = 0
    skipped_count = 0
    marked_count = 0
    try:
        # Find every active student that has NO attendance row for today.
        already = (
            db.query(AttendanceLog.student_id)
            .filter(AttendanceLog.attendance_date == today)
            .subquery()
        )
        absentees = (
            db.query(Student)
            .options(joinedload(Student.class_info))
            .filter(Student.is_active == True)  # noqa: E712
            .filter(~Student.id.in_(already))
            .all()
        )
        config = _get_active_sms_config(db)
        template = _get_template(db, "attendance_absent")
        template_text = (template.message_template
                         if template else _ABSENT_TEMPLATE)

        for student in absentees:
            # Idempotency: if an absent SMS already went out today, skip.
            day_start = datetime.combine(today, dt_time(0, 0, 0))
            day_end = day_start + timedelta(days=1)
            already_sent = (
                db.query(SMSLog)
                .filter(
                    SMSLog.student_id == student.id,
                    SMSLog.message_type == "attendance_absent",
                    SMSLog.status == "sent",
                    SMSLog.created_at >= day_start,
                    SMSLog.created_at < day_end,
                )
                .first()
            )

            absent_log = AttendanceLog(
                student_id=student.id,
                attendance_date=today,
                status="absent",
                is_manual_entry=False,
                # mark BOTH so a late arrival won't trigger any further SMS:
                sms_sent=True,
                whatsapp_sent=True,
            )
            db.add(absent_log)
            try:
                db.commit()
                marked_count += 1
            except Exception as e:
                db.rollback()
                logger.exception("[Absent] failed to insert absent row "
                                 "for student %s: %s", student.id, e)
                continue

            if already_sent:
                skipped_count += 1
                continue

            phone = ((student.mobile_number or "").strip()
                     or (student.phone_number or "").strip())
            if not phone:
                continue

            student_name = f"{student.first_name} {student.surname or ''}".strip()
            cls = "N/A"
            if student.class_info:
                cls = (f"{student.class_info.class_name} - "
                       f"{student.class_info.section_name}")
            try:
                message = template_text.format(
                    student_name=student_name,
                    class_name=cls,
                    date=today.strftime("%d-%m-%Y"),
                    admission_number=student.admission_number,
                )
            except Exception:
                message = _ABSENT_TEMPLATE.format(
                    student_name=student_name,
                    class_name=cls,
                    date=today.strftime("%d-%m-%Y"),
                    admission_number=student.admission_number,
                )

            sent_ok, response_text = _dispatch_sms(config, phone, message)
            _record_sms_log(
                db, config, student.id, phone, message,
                "attendance_absent", sent_ok, response_text,
            )
            if sent_ok:
                sent_count += 1

        logger.info("[Absent] marked=%s sms_sent=%s sms_skipped_dup=%s",
                    marked_count, sent_count, skipped_count)
        return {
            "date": today.isoformat(),
            "marked_absent": marked_count,
            "absent_sms_sent": sent_count,
            "absent_sms_skipped_duplicate": skipped_count,
        }
    finally:
        db.close()


if __name__ == "__main__":
    # Allow `python -m services.attendance_processor absent`
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "absent":
        print(mark_absent_students())
    else:
        print("usage: python -m services.attendance_processor absent")
