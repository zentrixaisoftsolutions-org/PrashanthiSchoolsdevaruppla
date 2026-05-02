"""
ZKTeco ADMS Push Protocol Receiver
====================================
Implements the ``/iclock/cdata`` and ``/iclock/getrequest`` endpoints that
ZKTeco devices use to push attendance data.

Protocol overview:
1. Device sends GET  /iclock/cdata?SN=xxx  -> server returns config or "OK"
2. Device sends POST /iclock/cdata?SN=xxx&table=ATTLOG&Stamp=xxx -> attendance rows
3. Device sends GET  /iclock/getrequest?SN=xxx -> server returns pending commands

Configure your ZKTeco device to push to:
    http://<your-server>:8000/iclock/cdata
"""
import asyncio
import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Request, Query, Response
from services.device_listener import device_listener_manager, process_rfid_scan, diagnostic_logger
from database import SessionLocal
from models import AttendanceDevice, Student, Staff

logger = logging.getLogger(__name__)

router = APIRouter(tags=["ZKTeco Push Receiver"])


def _resolve_device(serial_number: str) -> Optional[int]:
    """
    Look up a device by serial number.  First check the in-memory registry,
    then fall back to the database.  Auto-registers in memory on DB hit.
    """
    device_id = device_listener_manager.get_push_device_id(serial_number)
    if device_id is not None:
        return device_id

    # Fallback: look up in DB
    db = SessionLocal()
    try:
        device = (
            db.query(AttendanceDevice)
            .filter(AttendanceDevice.serial_number == serial_number,
                    AttendanceDevice.is_active == True)
            .first()
        )
        if device:
            device_listener_manager.register_push_device(serial_number, device.id)
            # Update status
            device.status = "connected"
            device.last_heartbeat_at = datetime.utcnow()
            device.last_connected_at = datetime.utcnow()
            db.commit()
            return device.id
    except Exception:
        db.rollback()
        logger.exception(f"[Push] DB lookup failed for SN={serial_number}")
    finally:
        db.close()

    return None


@router.get("/iclock/cdata", response_class=Response)
async def iclock_cdata_get(
    SN: str = Query(default="", alias="SN"),
    options: str = Query(default="", alias="options"),
    pushver: str = Query(default="", alias="pushver"),
    language: str = Query(default="", alias="language"),
):
    """
    ZKTeco device handshake / registration.
    Device sends this on boot to register with the server.
    """
    if not SN:
        return Response(content="UNKNOWN Device", media_type="text/plain")

    device_id = _resolve_device(SN)
    if device_id is None:
        logger.warning(f"[Push] Unknown device SN={SN} (not in our DB)")
        # Still accept it -- log for diagnostics
        return Response(content="OK", media_type="text/plain")

    logger.info(f"[Push] Device handshake: SN={SN}, device_id={device_id}, pushver={pushver}")

    # Return server configuration for the device
    # The device expects key=value pairs separated by \r\n
    config_lines = [
        "GET OPTION FROM: " + SN,
        "ATTLOGStamp=0",
        "OPERLOGStamp=0",
        "ATTPHOTOStamp=0",
        "ErrorDelay=60",
        "Delay=5",
        "TransTimes=00:00;23:59",
        "TransInterval=1",
        "TransFlag=TransData AttLog\tOpLog",
        "Realtime=1",
        "TimeZone=5.5",
        "ServerVer=2.4.1",
        "PushProtVer=2.4.1",
    ]
    return Response(content="\r\n".join(config_lines), media_type="text/plain")


@router.post("/iclock/cdata", response_class=Response)
async def iclock_cdata_post(
    request: Request,
    SN: str = Query(default="", alias="SN"),
    table: str = Query(default="", alias="table"),
    Stamp: str = Query(default="", alias="Stamp"),
):
    """
    Receive attendance data pushed from a ZKTeco device.
    The device POSTs rows of attendance transactions.

    Body format (one record per line, tab-separated):
        <card_no>\t<timestamp>\t<verify_type>\t<in_out_mode>\t<work_code>
    """
    body = await request.body()
    body_text = body.decode("utf-8", errors="ignore").strip()

    device_id = _resolve_device(SN)
    logger.info(
        f"[Push] POST cdata: SN={SN}, table={table}, device_id={device_id}, "
        f"body_len={len(body_text)}"
    )

    if table.upper() == "ATTLOG" and body_text:
        processed = 0
        seen = set()  # deduplicate within a single push
        for line in body_text.splitlines():
            line = line.strip()
            if not line:
                continue
            # Parse ATTLOG format:  card_no \t datetime \t verify \t inout \t workcode
            parts = line.split("\t")
            if len(parts) >= 2:
                card_no = parts[0].strip()
                timestamp_str = parts[1].strip()

                # Parse timestamp
                scan_time = None
                for fmt in ("%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S",
                            "%d-%m-%Y %H:%M:%S", "%m/%d/%Y %H:%M:%S"):
                    try:
                        scan_time = datetime.strptime(timestamp_str, fmt)
                        break
                    except ValueError:
                        continue

                if scan_time is None:
                    scan_time = datetime.now()
                    logger.warning(
                        f"[Push] Could not parse timestamp '{timestamp_str}', "
                        f"using current time"
                    )

                # Deduplicate: skip if we already processed this card+time
                dedup_key = (card_no, timestamp_str)
                if dedup_key in seen:
                    logger.debug(f"[Push] Skipping duplicate: {card_no} {timestamp_str}")
                    continue
                seen.add(dedup_key)

                # If device is in diagnostic mode, log only — no attendance
                if diagnostic_logger.is_active(device_id):
                    owner_name, owner_id, owner_type = "", None, ""
                    db_diag = SessionLocal()
                    try:
                        stu = db_diag.query(Student).filter(Student.rfid_id == card_no).first()
                        if stu:
                            owner_name = f"{stu.first_name} {stu.surname or ''}".strip()
                            owner_id, owner_type = stu.id, "Student"
                        else:
                            stf = db_diag.query(Staff).filter(Staff.rfid == card_no).first()
                            if stf:
                                owner_name = f"{stf.first_name} {stf.last_name or ''}".strip()
                                owner_id, owner_type = stf.id, "Staff"
                    finally:
                        db_diag.close()
                    diagnostic_logger.log_scan(
                        device_id, card_no, scan_time,
                        raw_line=line,
                        owner_name=owner_name,
                        owner_id=owner_id,
                        owner_type=owner_type,
                    )
                    logger.info(f"[Push][Diag] Logged scan: card={card_no}, owner={owner_name or 'unknown'}")
                else:
                    result = process_rfid_scan(card_no, device_id, scan_time)
                    logger.info(f"[Push] Processed: card={card_no}, result={result}")

                    # Auto-send SMS/WhatsApp notification on successful checkin/checkout
                    if result.get("status") in ("checkin", "checkout"):
                        try:
                            from routers.attendance import send_attendance_notification_bg
                            event_type = "check_in" if result["status"] == "checkin" else "check_out"
                            await send_attendance_notification_bg(
                                student_id=result["student_id"],
                                attendance_log_id=result["log_id"],
                                event_type=event_type,
                                check_in_time=scan_time if event_type == "check_in" else None,
                                check_out_time=scan_time if event_type == "check_out" else None,
                            )
                            logger.info(f"[Push] Notification sent for {result['student_name']} ({event_type})")
                        except Exception as e:
                            logger.error(f"[Push] Failed to send notification: {e}")
                processed += 1
            else:
                logger.warning(f"[Push] Unparseable ATTLOG line: {line}")

        logger.info(f"[Push] Processed {processed} transaction(s) from SN={SN}")
    elif table.upper() == "OPERLOG":
        logger.info(f"[Push] OPERLOG from SN={SN}: {body_text[:200]}")
    else:
        logger.info(f"[Push] Unknown table '{table}' from SN={SN}: {body_text[:200]}")

    return Response(content="OK", media_type="text/plain")


@router.get("/iclock/getrequest", response_class=Response)
async def iclock_getrequest(
    SN: str = Query(default="", alias="SN"),
):
    """
    ZKTeco device polls this endpoint for pending commands.
    Returning empty or 'OK' means no commands.
    """
    if not SN:
        return Response(content="UNKNOWN Device", media_type="text/plain")

    device_id = _resolve_device(SN)
    if device_id is not None:
        # Update heartbeat on every poll
        db = SessionLocal()
        try:
            device = (
                db.query(AttendanceDevice)
                .filter(AttendanceDevice.id == device_id)
                .first()
            )
            if device:
                device.status = "connected"
                device.last_heartbeat_at = datetime.utcnow()
                db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()

    # Return OK (no pending commands)
    return Response(content="OK", media_type="text/plain")


@router.get("/iclock/devicecmd", response_class=Response)
async def iclock_devicecmd(
    SN: str = Query(default="", alias="SN"),
):
    """Device command endpoint -- returns OK for now."""
    return Response(content="OK", media_type="text/plain")
