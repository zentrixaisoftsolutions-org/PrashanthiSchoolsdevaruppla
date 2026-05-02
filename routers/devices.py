from fastapi import APIRouter, Depends, HTTPException, status, Request, Response, Query
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models import AttendanceDevice, User, Student, Staff, AttendanceLog, StaffAttendance
from schemas import (
    AttendanceDeviceCreate, AttendanceDeviceUpdate, AttendanceDeviceResponse,
    DeviceConnectionRequest, DeviceConnectionResponse
)
from auth import get_current_user, require_role
from typing import List, Optional
from datetime import datetime
from services.device_listener import device_listener_manager, process_rfid_scan, diagnostic_logger
from services.easytimepro import get_client, sync_devices_from_server
import socket
import asyncio
import logging
import errno

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/devices", tags=["Attendance Devices"])


async def check_device_connection(ip_address: str, port: int, timeout: float = 5.0) -> bool:
    """
    Attempt to connect to the device via TCP/IP.
    Returns True if connection successful, False otherwise.
    """
    try:
        # Create socket with timeout
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((ip_address, port))
        sock.close()
        return result == 0
    except Exception:
        return False


@router.post("/", response_model=AttendanceDeviceResponse, status_code=status.HTTP_201_CREATED)
async def create_device(
    device_data: AttendanceDeviceCreate,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db)
):
    """Create a new attendance device."""
    # Check if serial number already exists
    if device_data.serial_number:
        existing = db.query(AttendanceDevice).filter(
            AttendanceDevice.serial_number == device_data.serial_number
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Device with this serial number already exists"
            )
    
    device = AttendanceDevice(**device_data.model_dump())
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


@router.get("/", response_model=List[AttendanceDeviceResponse])
async def list_devices(
    is_active: bool = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all attendance devices."""
    # Sync EasyTimePro devices before listing
    try:
        sync_devices_from_server()
    except Exception:
        logger.warning("[Devices] EasyTimePro sync failed, returning cached data")

    query = db.query(AttendanceDevice)
    if is_active is not None:
        query = query.filter(AttendanceDevice.is_active == is_active)
    return query.order_by(AttendanceDevice.device_name).all()

@router.get("/{device_id}", response_model=AttendanceDeviceResponse)
async def get_device(
    device_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific device by ID."""
    device = db.query(AttendanceDevice).filter(AttendanceDevice.id == device_id).first()
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found"
        )
    return device


@router.put("/{device_id}", response_model=AttendanceDeviceResponse)
async def update_device(
    device_id: int,
    device_data: AttendanceDeviceUpdate,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db)
):
    """Update a device."""
    device = db.query(AttendanceDevice).filter(AttendanceDevice.id == device_id).first()
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found"
        )
    
    update_data = device_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(device, field, value)
    
    device.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(device)
    return device


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(
    device_id: int,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db)
):
    """Delete a device."""
    device = db.query(AttendanceDevice).filter(AttendanceDevice.id == device_id).first()
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found"
        )
    
    db.delete(device)
    db.commit()


@router.post("/{device_id}/connect", response_model=DeviceConnectionResponse)
async def connect_device(
    device_id: int,
    request: DeviceConnectionRequest,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db)
):
    """
    Connect to or disconnect from a device.
    For connect: attempts TCP/IP connection to verify device is reachable.
    """
    device = db.query(AttendanceDevice).filter(AttendanceDevice.id == device_id).first()
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found"
        )
    
    if request.action == "connect":
        # Try to connect to the device
        is_connected = await check_device_connection(device.ip_address, device.port)
        
        if is_connected:
            device.status = "connected"
            device.last_connected_at = datetime.utcnow()
            device.last_heartbeat_at = datetime.utcnow()
            db.commit()
            # Start health monitor + push registration for RFID scans
            await device_listener_manager.start_listener(
                device.id, device.ip_address, device.port, device.device_name,
                connection_type=device.connection_type or "TCP/IP",
                serial_number=device.serial_number,
                comm_key=device.comm_key or 0,
            )
            return DeviceConnectionResponse(
                device_id=device.id,
                status="connected",
                message=f"Successfully connected to device at {device.ip_address}:{device.port}. Health monitor active, listening for RFID push data.",
                connected_at=device.last_connected_at
            )
        else:
            device.status = "error"
            db.commit()
            return DeviceConnectionResponse(
                device_id=device.id,
                status="error",
                message=f"Unable to connect to device at {device.ip_address}:{device.port}. Please verify device is online and IP/Port is correct.",
                connected_at=None
            )
    
    elif request.action == "disconnect":
        # Stop background TCP listener
        await device_listener_manager.stop_listener(device.id)
        device.status = "disconnected"
        db.commit()
        return DeviceConnectionResponse(
            device_id=device.id,
            status="disconnected",
            message="Device disconnected",
            connected_at=None
        )
    
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid action. Use 'connect' or 'disconnect'"
        )


@router.post("/{device_id}/heartbeat", response_model=DeviceConnectionResponse)
async def device_heartbeat(
    device_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update device heartbeat - can be called periodically to check device status.
    """
    device = db.query(AttendanceDevice).filter(AttendanceDevice.id == device_id).first()
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found"
        )
    
    # Check if device is still reachable
    is_connected = await check_device_connection(device.ip_address, device.port)
    
    if is_connected:
        device.status = "connected"
        device.last_heartbeat_at = datetime.utcnow()
        message = "Device is online"
    else:
        device.status = "disconnected"
        message = "Device is offline"
    
    db.commit()
    db.refresh(device)
    
    return DeviceConnectionResponse(
        device_id=device.id,
        status=device.status,
        message=message,
        connected_at=device.last_connected_at
    )


@router.get("/status/all", response_model=List[dict])
async def get_all_device_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get status of all active devices."""
    devices = db.query(AttendanceDevice).filter(AttendanceDevice.is_active == True).all()
    
    results = []
    for device in devices:
        # Update heartbeat status
        is_connected = await check_device_connection(device.ip_address, device.port, timeout=2.0)
        
        if is_connected:
            device.status = "connected"
            device.last_heartbeat_at = datetime.utcnow()
        else:
            device.status = "disconnected"
        
        results.append({
            "id": device.id,
            "device_name": device.device_name,
            "ip_address": device.ip_address,
            "port": device.port,
            "location": device.location,
            "status": device.status,
            "last_heartbeat_at": device.last_heartbeat_at
        })
    
    db.commit()
    return results

@router.get("/listener/status", response_model=List[dict])
async def get_listener_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get the status of all device RFID listeners."""
    devices = db.query(AttendanceDevice).filter(AttendanceDevice.is_active == True).all()
    results = []
    for device in devices:
        info = device_listener_manager.get_status(device.id)
        results.append({
            "id": device.id,
            "device_name": device.device_name,
            "ip_address": device.ip_address,
            "port": device.port,
            "status": device.status,
            "listener_active": device_listener_manager.is_listening(device.id),
            "monitor_active": info["monitor_active"],
            "raw_tcp_active": info["raw_tcp_active"],
            "push_registered": info["push_registered"],
        })
    return results


@router.post("/{device_id}/simulate-scan", response_model=dict)
async def simulate_rfid_scan(
    device_id: int,
    rfid_id: str,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db)
):
    """
    Simulate an RFID scan on a device (for testing).
    Processes attendance as if the card was physically swiped.
    """
    device = db.query(AttendanceDevice).filter(AttendanceDevice.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    result = process_rfid_scan(rfid_id, device.id)
    return {
        "message": f"Simulated RFID scan for '{rfid_id}' on device '{device.device_name}'",
        "result": result,
    }


@router.post("/{device_id}/test", response_model=dict)
async def test_device(
    device_id: int,
    rfid_id: Optional[str] = Query(None, description="RFID to test scan with (optional)"),
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db)
):
    """
    Run a comprehensive diagnostic test on a device.
    Checks: device existence, config, network reachability, port connectivity,
    listener status, and optionally simulates an RFID scan.
    """
    checks = []

    # ---- 1. Device lookup ----
    device = db.query(AttendanceDevice).filter(AttendanceDevice.id == device_id).first()
    if not device:
        return {
            "overall": "fail",
            "checks": [{"name": "Device Lookup", "status": "fail",
                        "message": f"Device with ID {device_id} not found in database."}],
        }
    checks.append({"name": "Device Lookup", "status": "pass",
                   "message": f"Found device '{device.device_name}' (ID {device.id})"})

    # ---- 2. Configuration validation ----
    config_issues = []
    if not device.ip_address or device.ip_address.strip() == '':
        config_issues.append("IP address is empty.")
    if not device.port or device.port <= 0 or device.port > 65535:
        config_issues.append(f"Port {device.port} is out of valid range (1-65535).")
    if not device.is_active:
        config_issues.append("Device is marked inactive.")
    if not device.serial_number:
        config_issues.append("Serial number is empty — Push protocol will not work without it.")
    if config_issues:
        checks.append({"name": "Configuration", "status": "warn" if device.ip_address else "fail",
                       "message": " ".join(config_issues),
                       "details": {"ip_address": device.ip_address, "port": device.port,
                                   "serial_number": device.serial_number or None,
                                   "connection_type": device.connection_type,
                                   "is_active": device.is_active}})
    else:
        checks.append({"name": "Configuration", "status": "pass",
                       "message": f"IP {device.ip_address}:{device.port}, type={device.connection_type}, serial={device.serial_number}",
                       "details": {"ip_address": device.ip_address, "port": device.port,
                                   "serial_number": device.serial_number,
                                   "connection_type": device.connection_type,
                                   "is_active": device.is_active}})

    # ---- 3. DNS / IP resolution ----
    resolved_ip = None
    try:
        resolved_ip = socket.gethostbyname(device.ip_address)
        checks.append({"name": "DNS / IP Resolution", "status": "pass",
                       "message": f"{device.ip_address} resolves to {resolved_ip}"})
    except socket.gaierror as e:
        checks.append({"name": "DNS / IP Resolution", "status": "fail",
                       "message": f"Cannot resolve '{device.ip_address}': {e}. "
                                  "Check for typos or ensure the device is on the same network."})
        # Can't continue network tests
        return {"overall": "fail", "device": {"id": device.id, "name": device.device_name}, "checks": checks}

    # ---- 4. Network reachability (ICMP-style via TCP connect) ----
    target_ip = resolved_ip or device.ip_address
    sock = None
    port_open = False
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5.0)
        err_code = sock.connect_ex((target_ip, device.port))
        if err_code == 0:
            port_open = True
            checks.append({"name": "TCP Port Connectivity", "status": "pass",
                           "message": f"Port {device.port} on {target_ip} is open and accepting connections."})
        else:
            err_msg = errno.errorcode.get(err_code, f"OS error code {err_code}")
            suggestion = ""
            if err_code == errno.ECONNREFUSED:
                suggestion = " The device is reachable but nothing is listening on this port — verify the port number in the device settings."
            elif err_code in (errno.ETIMEDOUT, errno.EHOSTUNREACH, 10060):
                suggestion = " The device may be off, on a different subnet, or a firewall is blocking the connection."
            checks.append({"name": "TCP Port Connectivity", "status": "fail",
                           "message": f"Cannot connect to {target_ip}:{device.port} — {err_msg}.{suggestion}"})
    except socket.timeout:
        checks.append({"name": "TCP Port Connectivity", "status": "fail",
                       "message": f"Connection to {target_ip}:{device.port} timed out after 5 seconds. "
                                  "The device may be powered off, unreachable, or blocked by a firewall."})
    except OSError as e:
        checks.append({"name": "TCP Port Connectivity", "status": "fail",
                       "message": f"Network error connecting to {target_ip}:{device.port}: {e}"})
    finally:
        if sock:
            sock.close()

    # ---- 5. Device DB status ----
    checks.append({"name": "Device Status", "status": "pass" if device.status == "connected" else "warn",
                   "message": f"Database status is '{device.status}'. Last heartbeat: {device.last_heartbeat_at or 'never'}."})

    # ---- 6. Listener / monitor status ----
    listener_info = device_listener_manager.get_status(device.id)
    listener_ok = listener_info.get("monitor_active") or listener_info.get("push_registered")
    if listener_ok:
        parts = []
        if listener_info.get("monitor_active"):
            parts.append("Health monitor active")
        if listener_info.get("push_registered"):
            parts.append("Push protocol registered")
        if listener_info.get("raw_tcp_active"):
            parts.append("Raw TCP listener active")
        checks.append({"name": "Listener Status", "status": "pass",
                       "message": ". ".join(parts) + "."})
    else:
        checks.append({"name": "Listener Status", "status": "warn",
                       "message": "No listener or health monitor is running for this device. "
                                  "Click 'Connect' on the device first to start listeners."})

    # ---- 7. RFID scan test (optional) ----
    rfid_result = None
    if rfid_id and rfid_id.strip():
        rfid_id = rfid_id.strip()
        # Check if this RFID belongs to a student or staff
        student = db.query(Student).filter(Student.rfid_id == rfid_id).first()
        staff = db.query(Staff).filter(Staff.rfid == rfid_id).first()

        if not student and not staff:
            checks.append({"name": "RFID Lookup", "status": "fail",
                           "message": f"RFID '{rfid_id}' is not assigned to any student or staff member. "
                                      "Register this RFID in a student or staff profile first."})
        else:
            owner_type = "Student" if student else "Staff"
            if student:
                owner_name = f"{student.first_name} {student.surname or ''}".strip()
                owner_id = student.id
            else:
                owner_name = f"{staff.first_name} {staff.last_name or ''}".strip()
                owner_id = staff.id

            checks.append({"name": "RFID Lookup", "status": "pass",
                           "message": f"RFID '{rfid_id}' belongs to {owner_type}: {owner_name} (ID {owner_id})"})

            # Log-only: do NOT mark attendance from the diagnostic test
            checks.append({"name": "RFID Scan Test", "status": "pass",
                           "message": f"Card recognised \u2014 {owner_type} {owner_name}. "
                                      "No attendance was marked (diagnostic mode).",
                           "details": {"rfid_id": rfid_id, "owner_type": owner_type,
                                       "owner_name": owner_name, "owner_id": owner_id}})

    # ---- Overall verdict ----
    statuses = [c["status"] for c in checks]
    if "fail" in statuses:
        overall = "fail"
    elif "warn" in statuses:
        overall = "warn"
    else:
        overall = "pass"

    return {
        "overall": overall,
        "device": {"id": device.id, "name": device.device_name,
                   "ip": device.ip_address, "port": device.port},
        "checks": checks,
        "rfid_result": rfid_result,
    }


# ======================================================================
# ZKTeco ADMS Push Protocol Receiver
# ======================================================================
# The device pushes attendance transactions to our server.
# These endpoints do NOT require JWT auth -- the device authenticates
# itself via its serial number (SN parameter).
# ======================================================================

@router.get("/push/cdata", response_class=Response)
async def push_cdata_get(request: Request, db: Session = Depends(get_db)):
    """
    ZKTeco ADMS handshake / initial registration.
    The device sends GET /iclock/cdata?SN=xxx on boot.
    We respond with configuration parameters.
    """
    params = dict(request.query_params)
    sn = params.get("SN", params.get("sn", ""))
    logger.info(f"[Push] GET cdata from SN={sn}, params={params}")

    if not sn:
        return Response(content="UNKNOWN Device", media_type="text/plain")

    # Look up device by serial number
    device = db.query(AttendanceDevice).filter(
        AttendanceDevice.serial_number == sn
    ).first()

    if not device:
        # Auto-register unknown device if SN is provided
        logger.warning(f"[Push] Unknown device SN={sn}, auto-registering")
        device = AttendanceDevice(
            device_name=f"Auto-{sn}",
            serial_number=sn,
            ip_address=request.client.host if request.client else "unknown",
            port=0,
            connection_type="PUSH",
            status="connected",
            is_active=True,
            last_connected_at=datetime.utcnow(),
            last_heartbeat_at=datetime.utcnow(),
        )
        db.add(device)
        db.commit()
        db.refresh(device)

    # Update device status
    device.status = "connected"
    device.last_connected_at = datetime.utcnow()
    device.last_heartbeat_at = datetime.utcnow()
    if request.client:
        device.ip_address = request.client.host
    db.commit()

    # Register in the push device map
    device_listener_manager.register_push_device(sn, device.id)

    # Return ADMS configuration
    # GET OPTION FROM: means the device should get its config from us
    # STAMP means the last transaction stamp we have (0 = send all)
    # ATTLOGSTAMP and OPERLOGSTAMP are transaction watermarks
    config_lines = [
        f"GET OPTION FROM: {sn}",
        "ATTLOGStamp=0",
        "OPERLOGStamp=0",
        "ATTPHOTOStamp=0",
        "ErrorDelay=60",
        "Delay=10",
        "TransTimes=00:00;23:59",
        "TransInterval=1",
        "TransFlag=TransData AttLog",
        "Realtime=1",
        "TimeZone=5.5",
    ]
    body = "\r\n".join(config_lines)
    return Response(content=body, media_type="text/plain")


@router.post("/push/cdata", response_class=Response)
async def push_cdata_post(request: Request, db: Session = Depends(get_db)):
    """
    ZKTeco ADMS attendance data push.
    The device POSTs attendance log lines like:
        ATTLOG: pin=<rfid>\ttime=2026-03-17 09:15:30\tstatus=0\tverify=1
    """
    params = dict(request.query_params)
    sn = params.get("SN", params.get("sn", ""))
    table = params.get("table", "")
    body = (await request.body()).decode("utf-8", errors="ignore")

    logger.info(f"[Push] POST cdata SN={sn}, table={table}, body_len={len(body)}")
    logger.debug(f"[Push] Body:\n{body[:2000]}")

    if not sn:
        return Response(content="UNKNOWN Device", media_type="text/plain")

    # Look up device
    device = db.query(AttendanceDevice).filter(
        AttendanceDevice.serial_number == sn
    ).first()

    device_id = device.id if device else None
    if device:
        device.last_heartbeat_at = datetime.utcnow()
        device.status = "connected"
        db.commit()

    processed = 0
    errors = 0

    if table.upper() in ("ATTLOG", ""):
        seen = set()  # deduplicate within a single push
        # Parse attendance log lines
        for line in body.strip().split("\n"):
            line = line.strip()
            if not line:
                continue

            try:
                # Format varies by firmware.  Common formats:
                # pin\ttime\tstatus\tverify\tworkcode\treserved
                # or: pin=xxx\ttime=xxx\tstatus=xxx...
                fields = {}
                parts = line.split("\t")

                if "=" in parts[0]:
                    # Key=value format
                    for part in parts:
                        if "=" in part:
                            k, v = part.split("=", 1)
                            fields[k.strip().lower()] = v.strip()
                else:
                    # Positional format: pin, time, status, verify, ...
                    if len(parts) >= 2:
                        fields["pin"] = parts[0].strip()
                        fields["time"] = parts[1].strip()
                        if len(parts) >= 3:
                            fields["status"] = parts[2].strip()

                rfid = fields.get("pin", "")
                time_str = fields.get("time", "")

                if not rfid:
                    logger.warning(f"[Push] No RFID in line: {line}")
                    continue

                # Deduplicate: skip if we already processed this rfid+time
                dedup_key = (rfid, time_str)
                if dedup_key in seen:
                    logger.debug(f"[Push] Skipping duplicate: {rfid} {time_str}")
                    continue
                seen.add(dedup_key)

                scan_time = None
                if time_str:
                    try:
                        scan_time = datetime.strptime(time_str, "%Y-%m-%d %H:%M:%S")
                    except ValueError:
                        try:
                            scan_time = datetime.strptime(time_str, "%Y-%m-%dT%H:%M:%S")
                        except ValueError:
                            logger.warning(f"[Push] Bad time format: {time_str}")

                # Diagnostic mode: log only, no attendance
                if device_id and diagnostic_logger.is_active(device_id):
                    owner_name, owner_id, owner_type = "", None, ""
                    stu = db.query(Student).filter(Student.rfid_id == rfid).first()
                    if stu:
                        owner_name = f"{stu.first_name} {stu.surname or ''}".strip()
                        owner_id, owner_type = stu.id, "Student"
                    else:
                        stf = db.query(Staff).filter(Staff.rfid == rfid).first()
                        if stf:
                            owner_name = f"{stf.first_name} {stf.last_name or ''}".strip()
                            owner_id, owner_type = stf.id, "Staff"
                    diagnostic_logger.log_scan(
                        device_id, rfid, scan_time,
                        raw_line=line,
                        owner_name=owner_name,
                        owner_id=owner_id,
                        owner_type=owner_type,
                    )
                    processed += 1
                else:
                    result = process_rfid_scan(rfid, device_id, scan_time)
                    if result["status"] != "error":
                        processed += 1
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
                                logger.info(f"[Push] Notification sent for {result.get('student_name', rfid)} ({event_type})")
                            except Exception as e:
                                logger.error(f"[Push] Failed to send notification: {e}")
                    else:
                        errors += 1
                        logger.warning(
                            f"[Push] RFID {rfid} error: {result.get('message', '')}"
                        )

            except Exception as exc:
                errors += 1
                logger.exception(f"[Push] Error parsing line: {line}")

    logger.info(f"[Push] SN={sn}: processed={processed}, errors={errors}")

    # Device expects "OK" response
    return Response(content=f"OK: {processed}", media_type="text/plain")


@router.get("/push/getrequest", response_class=Response)
async def push_getrequest(request: Request, db: Session = Depends(get_db)):
    """
    ZKTeco ADMS command queue.
    Device polls this endpoint to get pending commands.
    We return empty (no commands) to keep it happy and connected.
    """
    params = dict(request.query_params)
    sn = params.get("SN", params.get("sn", ""))
    logger.debug(f"[Push] GET getrequest SN={sn}")

    if sn:
        device = db.query(AttendanceDevice).filter(
            AttendanceDevice.serial_number == sn
        ).first()
        if device:
            device.last_heartbeat_at = datetime.utcnow()
            device.status = "connected"
            db.commit()

    # Return empty OK -- no pending commands
    return Response(content="OK", media_type="text/plain")


@router.post("/push/devicecmd", response_class=Response)
async def push_devicecmd(request: Request):
    """
    ZKTeco ADMS device command response endpoint.
    Device sends results of previously issued commands here.
    """
    params = dict(request.query_params)
    sn = params.get("SN", params.get("sn", ""))
    body = (await request.body()).decode("utf-8", errors="ignore")
    logger.info(f"[Push] POST devicecmd SN={sn}, body={body[:500]}")
    return Response(content="OK", media_type="text/plain")


# ======================================================================
# Device Diagnostic Mode  (live scan logs, no attendance marking)
# ======================================================================

@router.post("/{device_id}/diagnostic/start", response_model=dict)
async def diagnostic_start(
    device_id: int,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db),
):
    """Enable diagnostic mode for a device — scans are logged but attendance is NOT marked."""
    device = db.query(AttendanceDevice).filter(AttendanceDevice.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    diagnostic_logger.start(device_id)
    diagnostic_logger.clear_logs(device_id)
    return {"status": "started", "device_id": device_id,
            "message": f"Diagnostic mode started for '{device.device_name}'. Scans will be logged without marking attendance."}


@router.post("/{device_id}/diagnostic/stop", response_model=dict)
async def diagnostic_stop(
    device_id: int,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db),
):
    """Disable diagnostic mode — resume normal attendance processing."""
    device = db.query(AttendanceDevice).filter(AttendanceDevice.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    diagnostic_logger.stop(device_id)
    return {"status": "stopped", "device_id": device_id,
            "message": f"Diagnostic mode stopped for '{device.device_name}'. Attendance processing resumed."}


@router.get("/{device_id}/diagnostic/logs", response_model=dict)
async def diagnostic_logs(
    device_id: int,
    since_id: int = Query(0, description="Return logs with id greater than this value"),
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db),
):
    """Fetch recent diagnostic scan logs (polling endpoint)."""
    device = db.query(AttendanceDevice).filter(AttendanceDevice.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    logs = diagnostic_logger.get_logs(device_id, since_id)
    return {
        "device_id": device_id,
        "active": diagnostic_logger.is_active(device_id),
        "logs": logs,
    }


@router.delete("/{device_id}/diagnostic/logs", response_model=dict)
async def diagnostic_clear_logs(
    device_id: int,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db),
):
    """Clear the diagnostic scan log buffer for a device."""
    device = db.query(AttendanceDevice).filter(AttendanceDevice.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    diagnostic_logger.clear_logs(device_id)
    return {"message": "Diagnostic logs cleared", "device_id": device_id}