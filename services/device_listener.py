"""
RFID Device Listener Service
=============================
Manages connections to RFID scanner devices and processes attendance.

Communication strategies:
1. **Push Receiver (preferred)**: ZKTeco devices push attendance data to our
   ``/api/devices/push/cdata`` endpoint using the standard ADMS protocol.
2. **Health Monitor**: Periodically pings each device to track online/offline
   status and update heartbeats.
3. **Raw TCP** (legacy fallback): Maintains a persistent TCP socket for non-HTTP
   devices that stream raw RFID card IDs.
"""
import asyncio
import logging
import threading
from collections import deque
from datetime import datetime, date, time
from typing import Dict, List, Optional
from sqlalchemy.orm import Session, joinedload
from database import SessionLocal
from models import AttendanceDevice, AttendanceLog, Student, Staff, Class
import socket

try:
    from zk import ZK as _ZKLib
    _PYZK_AVAILABLE = True
except ImportError:
    _PYZK_AVAILABLE = False

logger = logging.getLogger(__name__)


# ======================================================================
# Diagnostic Logger  (scan-only, no attendance marking)
# ======================================================================
class DiagnosticLogger:
    """In-memory buffer for live scan logs when a device is in diagnostic mode."""

    def __init__(self, max_logs: int = 200):
        self._lock = threading.Lock()
        self._active: set = set()          # device_ids in diagnostic mode
        self._logs: Dict[int, deque] = {}  # device_id -> recent scan entries
        self._counter = 0
        self._max_logs = max_logs

    # -- mode control --
    def start(self, device_id: int):
        with self._lock:
            self._active.add(device_id)
            if device_id not in self._logs:
                self._logs[device_id] = deque(maxlen=self._max_logs)

    def stop(self, device_id: int):
        with self._lock:
            self._active.discard(device_id)

    def is_active(self, device_id: int) -> bool:
        return device_id in self._active

    # -- logging --
    def log_scan(self, device_id: int, rfid_id: str,
                 scan_time: Optional[datetime] = None,
                 raw_line: str = "",
                 owner_name: str = "", owner_id: Optional[int] = None,
                 owner_type: str = "") -> dict:
        with self._lock:
            self._counter += 1
            now = datetime.now()
            entry = {
                "id": self._counter,
                "device_id": device_id,
                "rfid_id": rfid_id,
                "scan_time": (scan_time or now).isoformat(),
                "raw_line": raw_line,
                "owner_name": owner_name,
                "owner_id": owner_id,
                "owner_type": owner_type,
                "logged_at": now.isoformat(),
            }
            if device_id not in self._logs:
                self._logs[device_id] = deque(maxlen=self._max_logs)
            self._logs[device_id].append(entry)
            return entry

    def get_logs(self, device_id: int, since_id: int = 0) -> list:
        with self._lock:
            logs = self._logs.get(device_id, deque())
            return [e for e in logs if e["id"] > since_id]

    def clear_logs(self, device_id: int):
        with self._lock:
            if device_id in self._logs:
                self._logs[device_id].clear()


diagnostic_logger = DiagnosticLogger()


# ======================================================================
# Attendance Processing (shared by all strategies)
# ======================================================================
_rfid_locks: dict = {}          # per-student lock to prevent race conditions
_rfid_locks_guard = threading.Lock()  # guard for the dict itself


def _get_student_lock(rfid_id: str) -> threading.Lock:
    """Return a per-RFID lock (created lazily)."""
    with _rfid_locks_guard:
        if rfid_id not in _rfid_locks:
            _rfid_locks[rfid_id] = threading.Lock()
        return _rfid_locks[rfid_id]


def process_rfid_scan(rfid_id: str, device_id: Optional[int] = None,
                      scan_time: Optional[datetime] = None) -> dict:
    """
    Process an RFID scan -- create or update attendance.
    Returns a dict with result details.
    """
    lock = _get_student_lock(rfid_id)
    with lock:
        return _process_rfid_scan_inner(rfid_id, device_id, scan_time)


def _process_rfid_scan_inner(rfid_id: str, device_id: Optional[int] = None,
                      scan_time: Optional[datetime] = None) -> dict:
    """Inner implementation — always called under per-student lock."""
    db: Session = SessionLocal()
    try:
        student = (
            db.query(Student)
            .options(joinedload(Student.class_info))
            .filter(Student.rfid_id == rfid_id)
            .first()
        )
        if not student:
            logger.warning(f"[RFID] No student found with RFID: {rfid_id}")
            return {"status": "error", "message": f"No student with RFID {rfid_id}"}

        if scan_time is None:
            scan_time = datetime.now()
        today = scan_time.date()

        existing_log = (
            db.query(AttendanceLog)
            .filter(
                AttendanceLog.student_id == student.id,
                AttendanceLog.attendance_date == today,
            )
            .first()
        )

        if existing_log:
            if existing_log.check_in_time:
                # Prevent duplicate processing: ignore checkout if within 60s of checkin
                gap = (scan_time - existing_log.check_in_time).total_seconds()
                if gap < 60 and not existing_log.check_out_time:
                    logger.info(
                        f"[RFID] Duplicate scan ignored for {student.first_name} "
                        f"(RFID {rfid_id}), gap={gap:.0f}s"
                    )
                    return {
                        "status": "already_marked",
                        "student_id": student.id,
                        "student_name": f"{student.first_name} {student.surname or ''}".strip(),
                    }
                was_checked_out = existing_log.check_out_time is not None
                existing_log.check_out_time = scan_time
                existing_log.updated_at = datetime.utcnow()
                db.commit()
                action_label = "Re-checkout" if was_checked_out else "Check-out"
                logger.info(
                    f"[RFID] {action_label} for {student.first_name} {student.surname or ''} "
                    f"(RFID {rfid_id})"
                )
                return {
                    "status": "checkout",
                    "student_id": student.id,
                    "student_name": f"{student.first_name} {student.surname or ''}".strip(),
                    "log_id": existing_log.id,
                }

        # Determine late status
        school_start = time(9, 0, 0)
        status_val = "late" if scan_time.time() > school_start else "present"

        new_log = AttendanceLog(
            student_id=student.id,
            device_id=device_id,
            rfid_scanned=rfid_id,
            attendance_date=today,
            check_in_time=scan_time,
            status=status_val,
            is_manual_entry=False,
        )
        db.add(new_log)
        db.commit()
        db.refresh(new_log)

        label = " (Late)" if status_val == "late" else ""
        logger.info(
            f"[RFID] Check-in{label} for {student.first_name} {student.surname or ''} "
            f"(RFID {rfid_id})"
        )
        return {
            "status": "checkin",
            "student_id": student.id,
            "student_name": f"{student.first_name} {student.surname or ''}".strip(),
            "log_id": new_log.id,
            "attendance_status": status_val,
        }
    except Exception:
        db.rollback()
        logger.exception(f"[RFID] Error processing scan '{rfid_id}'")
        return {"status": "error", "message": f"DB error for RFID {rfid_id}"}
    finally:
        db.close()


# ======================================================================
# Device Health Monitor
# ======================================================================
class DeviceHealthMonitor:
    """
    Periodically checks device reachability via TCP connection test
    and updates heartbeat/status in the database.
    """

    def __init__(self, device_id: int, ip_address: str, port: int,
                 device_name: str, check_interval: int = 30):
        self.device_id = device_id
        self.ip_address = ip_address
        self.port = port
        self.device_name = device_name
        self.check_interval = check_interval  # seconds
        self._task: Optional[asyncio.Task] = None
        self._running = False
        self.last_status: Optional[str] = None

    async def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._monitor_loop())
        logger.info(
            f"[HealthMonitor] Started for '{self.device_name}' "
            f"({self.ip_address}:{self.port}), interval={self.check_interval}s"
        )

    async def stop(self):
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None
        logger.info(f"[HealthMonitor] Stopped for '{self.device_name}'")

    async def _monitor_loop(self):
        """Periodically ping the device and update database status."""
        while self._running:
            try:
                reachable = await self._check_reachable()
                new_status = "connected" if reachable else "disconnected"

                if new_status != self.last_status:
                    logger.info(
                        f"[HealthMonitor] {self.device_name}: "
                        f"{self.last_status} -> {new_status}"
                    )
                self.last_status = new_status
                self._update_device_status(new_status)

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.exception(
                    f"[HealthMonitor] Error for {self.device_name}: {exc}"
                )

            if self._running:
                await asyncio.sleep(self.check_interval)

        self._update_device_status("disconnected")

    async def _check_reachable(self) -> bool:
        """Test TCP reachability with a short timeout."""
        loop = asyncio.get_event_loop()
        try:
            result = await asyncio.wait_for(
                loop.run_in_executor(None, self._tcp_ping),
                timeout=5.0,
            )
            return result
        except asyncio.TimeoutError:
            return False

    def _tcp_ping(self) -> bool:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(3)
            result = sock.connect_ex((self.ip_address, self.port))
            sock.close()
            return result == 0
        except Exception:
            return False

    def _update_device_status(self, status: str):
        db: Session = SessionLocal()
        try:
            device = (
                db.query(AttendanceDevice)
                .filter(AttendanceDevice.id == self.device_id)
                .first()
            )
            if device:
                device.status = status
                if status == "connected":
                    device.last_heartbeat_at = datetime.utcnow()
                    device.last_connected_at = datetime.utcnow()
                db.commit()
        except Exception:
            db.rollback()
            logger.exception(
                f"[HealthMonitor] DB update failed for {self.device_name}"
            )
        finally:
            db.close()


# ======================================================================
# Raw TCP Listener (for non-HTTP devices that stream RFID data)
# ======================================================================
class RawTCPListener:
    """
    Maintains a persistent TCP connection to a device that sends raw
    RFID card IDs (one per line).  Only suitable for devices that expose
    a raw TCP socket (NOT HTTP servers).
    """

    def __init__(self, device_id: int, ip_address: str, port: int,
                 device_name: str):
        self.device_id = device_id
        self.ip_address = ip_address
        self.port = port
        self.device_name = device_name
        self._task: Optional[asyncio.Task] = None
        self._running = False
        self._reader: Optional[asyncio.StreamReader] = None
        self._writer: Optional[asyncio.StreamWriter] = None

    async def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._listen_loop())
        logger.info(
            f"[RawTCP] Started for '{self.device_name}' "
            f"({self.ip_address}:{self.port})"
        )

    async def stop(self):
        self._running = False
        if self._writer:
            try:
                self._writer.close()
                await self._writer.wait_closed()
            except Exception:
                pass
            self._writer = None
            self._reader = None
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None
        logger.info(f"[RawTCP] Stopped for '{self.device_name}'")

    async def _listen_loop(self):
        retry_delay = 2
        while self._running:
            try:
                logger.info(
                    f"[RawTCP] Connecting to {self.device_name} "
                    f"at {self.ip_address}:{self.port}..."
                )
                self._reader, self._writer = await asyncio.wait_for(
                    asyncio.open_connection(self.ip_address, self.port),
                    timeout=10.0,
                )
                logger.info(f"[RawTCP] Connected to {self.device_name}")
                self._update_status("connected")
                retry_delay = 2

                buffer = b""
                while self._running:
                    try:
                        data = await asyncio.wait_for(
                            self._reader.read(1024), timeout=60.0
                        )
                    except asyncio.TimeoutError:
                        self._update_status("connected")
                        continue

                    if not data:
                        logger.warning(
                            f"[RawTCP] {self.device_name} closed connection"
                        )
                        break

                    buffer += data
                    while b"\n" in buffer or b"\r" in buffer:
                        line, _, buffer = buffer.partition(b"\n")
                        line = line.strip(b"\r\n\r ")
                        if line:
                            rfid = line.decode("utf-8", errors="ignore").strip()
                            if rfid:
                                logger.info(
                                    f"[RawTCP] Scan on {self.device_name}: '{rfid}'"
                                )
                                if diagnostic_logger.is_active(self.device_id):
                                    owner_name, owner_id, owner_type = "", None, ""
                                    db_d = SessionLocal()
                                    try:
                                        stu = db_d.query(Student).filter(Student.rfid_id == rfid).first()
                                        if stu:
                                            owner_name = f"{stu.first_name} {stu.surname or ''}".strip()
                                            owner_id, owner_type = stu.id, "Student"
                                        else:
                                            stf = db_d.query(Staff).filter(Staff.rfid == rfid).first()
                                            if stf:
                                                owner_name = f"{stf.first_name} {stf.last_name or ''}".strip()
                                                owner_id, owner_type = stf.id, "Staff"
                                    finally:
                                        db_d.close()
                                    diagnostic_logger.log_scan(
                                        self.device_id, rfid,
                                        owner_name=owner_name,
                                        owner_id=owner_id,
                                        owner_type=owner_type,
                                    )
                                else:
                                    process_rfid_scan(rfid, self.device_id)

            except asyncio.CancelledError:
                break
            except (ConnectionRefusedError, ConnectionResetError,
                    OSError, asyncio.TimeoutError) as exc:
                logger.warning(
                    f"[RawTCP] {self.device_name}: {exc}. Retry in {retry_delay}s"
                )
                self._update_status("disconnected")
            except Exception as exc:
                logger.exception(
                    f"[RawTCP] Unexpected error for {self.device_name}: {exc}"
                )

            if self._writer:
                try:
                    self._writer.close()
                    await self._writer.wait_closed()
                except Exception:
                    pass
                self._writer = None
                self._reader = None

            if self._running:
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, 30)

        self._update_status("disconnected")

    def _update_status(self, status: str):
        db: Session = SessionLocal()
        try:
            device = (
                db.query(AttendanceDevice)
                .filter(AttendanceDevice.id == self.device_id)
                .first()
            )
            if device:
                device.status = status
                if status == "connected":
                    device.last_heartbeat_at = datetime.utcnow()
                db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()


# ======================================================================
# ZKTeco ZK-Protocol Listener (pyzk — live_capture / polling fallback)
# ======================================================================
class ZKTecoListener:
    """
    Connects to a ZKTeco device using the ZK protocol (pyzk library).
    Attempts live_capture first; falls back to polling every POLL_INTERVAL
    seconds if the device doesn't support live events.

    Runs the blocking pyzk calls in a background thread so the asyncio
    event loop is never blocked.
    """

    POLL_INTERVAL = 2  # seconds between polls in fallback mode

    def __init__(self, device_id: int, ip_address: str, port: int,
                 device_name: str, comm_key: int = 0):
        self.device_id = device_id
        self.ip_address = ip_address
        self.port = port
        self.device_name = device_name
        self.comm_key = comm_key or 0

        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._zk_conn = None  # live pyzk connection (for cleanup)
        self._loop = None  # main asyncio event loop (captured in start())

    # ------------------------------------------------------------------ start/stop
    async def start(self):
        if self._thread and self._thread.is_alive():
            return
        if not _PYZK_AVAILABLE:
            logger.error(
                "[ZKTeco] pyzk is not installed — cannot start ZKTeco listener. "
                "Run: pip install pyzk"
            )
            return
        self._loop = asyncio.get_event_loop()  # capture main loop while on asyncio thread
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._run, name=f"zkteco-{self.device_id}", daemon=True
        )
        self._thread.start()
        logger.info(
            f"[ZKTeco] Started listener for '{self.device_name}' "
            f"({self.ip_address}:{self.port}  comm_key={self.comm_key})"
        )

    async def stop(self):
        self._stop_event.set()
        # Signal the live_capture loop to exit
        if self._zk_conn:
            try:
                self._zk_conn.end_live_capture = True
            except Exception:
                pass
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=8)
        self._thread = None
        logger.info(f"[ZKTeco] Stopped listener for '{self.device_name}'")

    # ------------------------------------------------------------------ internals
    def _run(self):
        """Thread entry point — connects and listens with auto-retry."""
        retry_delay = 5
        while not self._stop_event.is_set():
            zk = _ZKLib(
                self.ip_address,
                port=self.port,
                timeout=5,
                password=self.comm_key,
            )
            conn = None
            try:
                logger.info(
                    f"[ZKTeco] Connecting to '{self.device_name}' "
                    f"at {self.ip_address}:{self.port} …"
                )
                conn = zk.connect()
                self._zk_conn = conn
                self._update_status("connected")
                retry_delay = 5  # reset on successful connect

                logger.info(f"[ZKTeco] Connected to '{self.device_name}'")

                # Disable device briefly to read users cleanly
                conn.disable_device()
                user_lookup = self._build_user_lookup(conn)
                conn.enable_device()

                # Attempt live capture (blocking)
                try:
                    self._live_capture(conn, user_lookup)
                except Exception as exc:
                    logger.warning(
                        f"[ZKTeco] Live capture ended for '{self.device_name}': {exc}. "
                        "Falling back to polling …"
                    )
                    if not self._stop_event.is_set():
                        try:
                            conn.enable_device()
                        except Exception:
                            pass
                        self._poll_loop(conn, user_lookup)

            except Exception as exc:
                logger.warning(
                    f"[ZKTeco] '{self.device_name}': {exc}. "
                    f"Retry in {retry_delay}s …"
                )
                self._update_status("disconnected")
            finally:
                if conn:
                    try:
                        conn.end_live_capture = True
                        conn.disconnect()
                    except Exception:
                        pass
                self._zk_conn = None

            if not self._stop_event.is_set():
                self._stop_event.wait(retry_delay)
                retry_delay = min(retry_delay * 2, 60)

        self._update_status("disconnected")

    def _build_user_lookup(self, conn) -> dict:
        """Build user_id -> (name, card) mapping."""
        lookup = {}
        try:
            for u in (conn.get_users() or []):
                card = str(u.card) if u.card else ""
                lookup[str(u.user_id)] = (u.name, card)
        except Exception as exc:
            logger.warning(f"[ZKTeco] Could not load users: {exc}")
        return lookup

    def _live_capture(self, conn, user_lookup: dict):
        """Block on live_capture and process each swipe event."""
        logger.info(f"[ZKTeco] '{self.device_name}': starting live capture …")
        for attendance in conn.live_capture():
            if self._stop_event.is_set():
                break
            if attendance is None:
                # Heartbeat / keep-alive
                continue
            self._handle_event(attendance, user_lookup)

    def _poll_loop(self, conn, user_lookup: dict):
        """Polling fallback: check get_attendance() every POLL_INTERVAL s."""
        logger.info(f"[ZKTeco] '{self.device_name}': starting poll loop …")
        last_seen = datetime.now()
        while not self._stop_event.is_set():
            try:
                records = conn.get_attendance() or []
                for rec in records:
                    if rec.timestamp and rec.timestamp > last_seen:
                        self._handle_event(rec, user_lookup)
                        last_seen = rec.timestamp
            except Exception as exc:
                logger.warning(f"[ZKTeco] Poll error for '{self.device_name}': {exc}")
                break
            self._stop_event.wait(self.POLL_INTERVAL)

    def _handle_event(self, attendance, user_lookup: dict):
        """Map a zk attendance event to an RFID scan and process it."""
        uid = str(attendance.user_id)
        name, card = user_lookup.get(uid, (uid, ""))
        rfid = card if card else uid
        dt = attendance.timestamp

        logger.info(
            f"[ZKTeco] Swipe on '{self.device_name}': "
            f"uid={uid}  name={name}  rfid={rfid}  time={dt}"
        )

        if diagnostic_logger.is_active(self.device_id):
            diagnostic_logger.log_scan(
                self.device_id, rfid,
                scan_time=dt,
                raw_line=f"uid={uid} name={name}",
                owner_name=name,
            )
        else:
            result = process_rfid_scan(rfid, self.device_id, scan_time=dt)
            # Trigger SMS/WhatsApp notification on successful checkin/checkout
            if result.get("status") in ("checkin", "checkout"):
                try:
                    from routers.attendance import send_attendance_notification_bg
                    event_type = "check_in" if result["status"] == "checkin" else "check_out"
                    asyncio.run_coroutine_threadsafe(
                        send_attendance_notification_bg(
                            student_id=result["student_id"],
                            attendance_log_id=result["log_id"],
                            event_type=event_type,
                            check_in_time=dt if event_type == "check_in" else None,
                            check_out_time=dt if event_type == "check_out" else None,
                        ),
                        self._loop,
                    )
                    logger.info(
                        f"[ZKTeco] Notification queued for "
                        f"{result.get('student_name', rfid)} ({event_type})"
                    )
                except Exception as e:
                    logger.error(f"[ZKTeco] Failed to queue notification: {e}")

    def _update_status(self, status: str):
        db: Session = SessionLocal()
        try:
            device = (
                db.query(AttendanceDevice)
                .filter(AttendanceDevice.id == self.device_id)
                .first()
            )
            if device:
                device.status = status
                if status == "connected":
                    device.last_heartbeat_at = datetime.utcnow()
                    device.last_connected_at = datetime.utcnow()
                db.commit()
        except Exception:
            db.rollback()
            logger.exception(f"[ZKTeco] DB status update failed for '{self.device_name}'")
        finally:
            db.close()


# ======================================================================
# Device Listener Manager (singleton)
# ======================================================================
class DeviceListenerManager:
    """
    Central manager that tracks health monitors, raw-TCP listeners,
    and push-registered devices.
    """

    def __init__(self):
        self._monitors: Dict[int, DeviceHealthMonitor] = {}
        self._raw_listeners: Dict[int, RawTCPListener] = {}
        self._zkteco_listeners: Dict[int, ZKTecoListener] = {}
        # Track push-registered device serial numbers -> device_id
        self._push_devices: Dict[str, int] = {}

    # ------------------------------------------------------------------
    # Health monitor management
    # ------------------------------------------------------------------
    async def start_monitor(self, device_id: int, ip_address: str,
                            port: int, device_name: str,
                            check_interval: int = 30):
        """Start health monitoring for a device."""
        if device_id in self._monitors:
            await self._monitors[device_id].stop()
        monitor = DeviceHealthMonitor(
            device_id, ip_address, port, device_name, check_interval
        )
        self._monitors[device_id] = monitor
        await monitor.start()

    async def stop_monitor(self, device_id: int):
        monitor = self._monitors.pop(device_id, None)
        if monitor:
            await monitor.stop()

    # ------------------------------------------------------------------
    # Raw TCP listener management (for non-HTTP devices)
    # ------------------------------------------------------------------
    async def start_raw_listener(self, device_id: int, ip_address: str,
                                 port: int, device_name: str):
        """Start a raw TCP listener for a device."""
        if device_id in self._raw_listeners:
            await self._raw_listeners[device_id].stop()
        listener = RawTCPListener(device_id, ip_address, port, device_name)
        self._raw_listeners[device_id] = listener
        await listener.start()

    async def stop_raw_listener(self, device_id: int):
        listener = self._raw_listeners.pop(device_id, None)
        if listener:
            await listener.stop()

    # ------------------------------------------------------------------
    # ZKTeco listener management
    # ------------------------------------------------------------------
    async def start_zkteco_listener(self, device_id: int, ip_address: str,
                                    port: int, device_name: str,
                                    comm_key: int = 0):
        """Start a ZKTeco ZK-protocol listener for a device."""
        if device_id in self._zkteco_listeners:
            await self._zkteco_listeners[device_id].stop()
        listener = ZKTecoListener(device_id, ip_address, port, device_name, comm_key)
        self._zkteco_listeners[device_id] = listener
        await listener.start()

    async def stop_zkteco_listener(self, device_id: int):
        listener = self._zkteco_listeners.pop(device_id, None)
        if listener:
            await listener.stop()

    # ------------------------------------------------------------------
    # Push device registration
    # ------------------------------------------------------------------
    def register_push_device(self, serial_number: str, device_id: int):
        """Register a device serial for push-based attendance."""
        self._push_devices[serial_number] = device_id
        logger.info(
            f"[Manager] Registered push device SN={serial_number} -> device {device_id}"
        )

    def get_push_device_id(self, serial_number: str) -> Optional[int]:
        return self._push_devices.get(serial_number)

    # ------------------------------------------------------------------
    # Combined start / stop for a device
    # ------------------------------------------------------------------
    async def start_listener(self, device_id: int, ip_address: str,
                             port: int, device_name: str,
                             connection_type: str = "TCP/IP",
                             serial_number: Optional[str] = None,
                             comm_key: int = 0):
        """
        Start appropriate listeners for a device based on connection type.
        - ZKTeco: starts ZKTecoListener (ZK protocol via pyzk)
        - RAW_TCP: starts RawTCPListener + health monitor
        - Others: starts health monitor and registers for push
        """
        ct = (connection_type or "TCP/IP").upper()

        # Always start health monitor for all device types
        await self.start_monitor(device_id, ip_address, port, device_name)

        # Always register for push if serial_number is available
        # (ZKTeco devices may use ADMS HTTP push instead of ZK protocol)
        if serial_number:
            self.register_push_device(serial_number, device_id)

        if ct == "ZKTECO":
            # Also try ZK protocol via pyzk (live_capture / polling)
            await self.start_zkteco_listener(
                device_id, ip_address, port, device_name, comm_key
            )
        elif ct == "RAW_TCP":
            # Start raw TCP listener for devices that use raw socket protocol
            await self.start_raw_listener(
                device_id, ip_address, port, device_name
            )

    async def stop_listener(self, device_id: int):
        """Stop all listeners for a device."""
        await self.stop_monitor(device_id)
        await self.stop_raw_listener(device_id)
        await self.stop_zkteco_listener(device_id)
        # Remove from push registry
        to_remove = [
            sn for sn, did in self._push_devices.items() if did == device_id
        ]
        for sn in to_remove:
            del self._push_devices[sn]

    async def stop_all(self):
        """Stop everything (call on app shutdown)."""
        for device_id in list(self._monitors.keys()):
            await self.stop_monitor(device_id)
        for device_id in list(self._raw_listeners.keys()):
            await self.stop_raw_listener(device_id)
        for device_id in list(self._zkteco_listeners.keys()):
            await self.stop_zkteco_listener(device_id)
        self._push_devices.clear()
        logger.info("[Manager] All device listeners stopped")

    def is_listening(self, device_id: int) -> bool:
        return (
            device_id in self._monitors
            or device_id in self._raw_listeners
            or device_id in self._zkteco_listeners
        )

    def get_status(self, device_id: int) -> dict:
        """Get the current listener status for a device."""
        return {
            "monitor_active": device_id in self._monitors,
            "raw_tcp_active": device_id in self._raw_listeners,
            "zkteco_active": device_id in self._zkteco_listeners,
            "push_registered": any(
                did == device_id for did in self._push_devices.values()
            ),
        }

    async def resume_active_devices(self):
        """
        On app startup, start listeners for ALL active devices --
        regardless of their last known status.  This ensures devices
        are monitored even after server restarts.
        """
        db: Session = SessionLocal()
        try:
            devices = (
                db.query(AttendanceDevice)
                .filter(AttendanceDevice.is_active == True)
                .all()
            )
            for device in devices:
                logger.info(
                    f"[Manager] Starting listeners for '{device.device_name}' "
                    f"({device.ip_address}:{device.port}) "
                    f"[type={device.connection_type}]"
                )
                await self.start_listener(
                    device.id,
                    device.ip_address,
                    device.port,
                    device.device_name,
                    connection_type=device.connection_type or "TCP/IP",
                    serial_number=device.serial_number,
                    comm_key=device.comm_key or 0,
                )
            logger.info(
                f"[Manager] Resumed listeners for {len(devices)} active device(s)"
            )
        except Exception:
            logger.exception("[Manager] Failed to resume active devices")
        finally:
            db.close()


# Module-level singleton
device_listener_manager = DeviceListenerManager()
