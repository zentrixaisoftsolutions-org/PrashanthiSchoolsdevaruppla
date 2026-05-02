"""
EasyTimePro (ZKTeco) Server Integration Service
=================================================
Connects to the EasyTimePro server to:
1. Fetch device (terminal) list and online/offline status
2. Poll attendance transaction logs and process them as RFID scans
3. Sync devices into the local AttendanceDevice table automatically

API base: {EASYTIMEPRO_BASE_URL}/iclock/api/
Auth: JWT via /jwt-api-token-auth/
"""

import asyncio
import logging
import threading
from datetime import datetime, timedelta
from typing import Dict, List, Optional

import requests
import urllib3

from config import settings
from database import SessionLocal
from models import AttendanceDevice, AttendanceLog, Student, Staff

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logger = logging.getLogger(__name__)


class EasyTimeProClient:
    """HTTP client for the EasyTimePro REST API."""

    def __init__(self):
        self.base_url = settings.EASYTIMEPRO_BASE_URL.rstrip("/")
        self.username = settings.EASYTIMEPRO_USERNAME
        self.password = settings.EASYTIMEPRO_PASSWORD
        self.verify_ssl = settings.EASYTIMEPRO_VERIFY_SSL
        self._access_token: Optional[str] = None
        self._token_expiry: Optional[datetime] = None
        self._lock = threading.Lock()

    # ------------------------------------------------------------------ auth
    def _authenticate(self):
        """Obtain a fresh JWT access token."""
        url = f"{self.base_url}/jwt-api-token-auth/"
        try:
            resp = requests.post(
                url,
                json={"username": self.username, "password": self.password},
                verify=self.verify_ssl,
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
            self._access_token = data["access"]
            # Token typically valid for 5 minutes; refresh at 4 min
            self._token_expiry = datetime.utcnow() + timedelta(minutes=4)
            logger.info("[EasyTimePro] Authenticated successfully")
        except Exception as exc:
            logger.error(f"[EasyTimePro] Authentication failed: {exc}")
            self._access_token = None
            self._token_expiry = None
            raise

    def _get_headers(self) -> dict:
        """Return authorization headers, refreshing the token if needed."""
        with self._lock:
            if (
                not self._access_token
                or not self._token_expiry
                or datetime.utcnow() >= self._token_expiry
            ):
                self._authenticate()
            return {"Authorization": f"Bearer {self._access_token}"}

    # ------------------------------------------------------------------ API helpers
    def _get(self, path: str, params: Optional[dict] = None) -> dict:
        url = f"{self.base_url}{path}"
        resp = requests.get(
            url,
            headers=self._get_headers(),
            params=params,
            verify=self.verify_ssl,
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()

    # ------------------------------------------------------------------ public API
    def get_terminals(self) -> List[dict]:
        """Fetch all terminals (devices) from the server."""
        data = self._get("/iclock/api/terminals/")
        return data.get("data", [])

    def get_transactions(
        self,
        page: int = 1,
        page_size: int = 100,
        start_time: Optional[str] = None,
        terminal_sn: Optional[str] = None,
    ) -> dict:
        """
        Fetch attendance transactions (punch logs).
        Returns the full paginated response: {count, next, previous, data: [...]}.
        """
        params: dict = {"page": page, "page_size": page_size}
        if start_time:
            params["start_time"] = start_time
        if terminal_sn:
            params["terminal_sn"] = terminal_sn
        return self._get("/iclock/api/transactions/", params=params)

    def is_server_online(self) -> bool:
        """Quick connectivity check."""
        try:
            self._get_headers()  # forces auth if needed
            return True
        except Exception:
            return False

    def get_employees(self) -> List[dict]:
        """Fetch all employees from the server (personnel API)."""
        data = self._get("/personnel/api/employees/")
        return data.get("data", [])

    def build_card_map(self) -> Dict[str, str]:
        """
        Build a mapping of emp_code -> card_no from the EasyTimePro personnel API.
        Only includes employees that have a card_no assigned.
        """
        employees = self.get_employees()
        card_map: Dict[str, str] = {}
        for emp in employees:
            emp_code = str(emp.get("emp_code", "")).strip()
            card_no = str(emp.get("card_no") or "").strip()
            if emp_code and card_no:
                card_map[emp_code] = card_no
        return card_map


# Singleton client
_client: Optional[EasyTimeProClient] = None


def get_client() -> EasyTimeProClient:
    global _client
    if _client is None:
        _client = EasyTimeProClient()
    return _client


# ======================================================================
# Device Sync — keeps local AttendanceDevice table in sync with server
# ======================================================================

def sync_devices_from_server() -> List[dict]:
    """
    Fetch terminals from EasyTimePro and upsert into local DB.
    Returns the list of terminal dicts from the server.
    """
    client = get_client()
    terminals = client.get_terminals()
    db = SessionLocal()
    try:
        for t in terminals:
            sn = t.get("sn", "")
            if not sn:
                continue

            device = (
                db.query(AttendanceDevice)
                .filter(AttendanceDevice.serial_number == sn)
                .first()
            )

            # Determine online status from EasyTimePro state field
            # state=1 means online in EasyTimePro
            is_online = t.get("state") == 1
            etp_status = "connected" if is_online else "disconnected"
            area = t.get("area", {})
            area_name = area.get("area_name", "") if isinstance(area, dict) else ""
            terminal_name = t.get("terminal_name", "")
            device_name = sn
            ip_addr = t.get("ip_address", "0.0.0.0")

            if device:
                # Update existing
                device.device_name = device_name
                device.device_model = terminal_name
                device.ip_address = ip_addr
                device.status = etp_status
                device.location = area_name or device.location
                device.connection_type = "EasyTimePro"
                if is_online:
                    device.last_heartbeat_at = datetime.utcnow()
                    device.last_connected_at = datetime.utcnow()
                device.updated_at = datetime.utcnow()
            else:
                # Create new
                device = AttendanceDevice(
                    device_name=device_name,
                    device_model=terminal_name,
                    serial_number=sn,
                    ip_address=ip_addr,
                    port=0,
                    comm_key=0,
                    connection_type="EasyTimePro",
                    location=area_name,
                    status=etp_status,
                    is_active=True,
                    last_connected_at=datetime.utcnow() if is_online else None,
                    last_heartbeat_at=datetime.utcnow() if is_online else None,
                )
                db.add(device)

        db.commit()
        logger.info(
            f"[EasyTimePro] Synced {len(terminals)} terminal(s) from server"
        )
    except Exception:
        db.rollback()
        logger.exception("[EasyTimePro] Failed to sync devices")
        raise
    finally:
        db.close()

    return terminals


# ======================================================================
# Transaction Poller — fetches new punch logs periodically
# ======================================================================

class TransactionPoller:
    """
    Background task that polls EasyTimePro for new attendance transactions
    and processes them through the existing RFID scan pipeline.
    """

    def __init__(self):
        self._task: Optional[asyncio.Task] = None
        self._running = False
        self._last_transaction_id: int = 0  # watermark
        self._poll_interval = settings.EASYTIMEPRO_POLL_INTERVAL
        self._card_map: Dict[str, str] = {}  # emp_code -> card_no (RFID)

    async def start(self):
        if self._running:
            return
        self._running = True
        # Initialise watermark from DB — find the highest processed transaction
        self._init_watermark()
        self._task = asyncio.create_task(self._poll_loop())
        logger.info(
            f"[EasyTimePro] Transaction poller started "
            f"(interval={self._poll_interval}s, watermark={self._last_transaction_id})"
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
        logger.info("[EasyTimePro] Transaction poller stopped")

    def _init_watermark(self):
        """Load the last processed EasyTimePro transaction ID from DB."""
        db = SessionLocal()
        try:
            # We store the EasyTimePro transaction ID in remarks as "etp:<id>"
            last = (
                db.query(AttendanceLog)
                .filter(AttendanceLog.remarks.like("etp:%"))
                .order_by(AttendanceLog.id.desc())
                .first()
            )
            if last and last.remarks:
                try:
                    self._last_transaction_id = int(last.remarks.split(":")[1])
                except (IndexError, ValueError):
                    pass
        except Exception:
            logger.exception("[EasyTimePro] Failed to init watermark")
        finally:
            db.close()

    async def _poll_loop(self):
        while self._running:
            try:
                await self._fetch_and_process()
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("[EasyTimePro] Error in poll loop")

            if self._running:
                await asyncio.sleep(self._poll_interval)

    async def _fetch_and_process(self):
        """Fetch new transactions and process them."""
        client = get_client()
        loop = asyncio.get_event_loop()

        # Refresh emp_code -> card_no (RFID) mapping from personnel API
        try:
            self._card_map = await loop.run_in_executor(
                None, client.build_card_map
            )
            logger.debug(f"[EasyTimePro] Card map refreshed: {len(self._card_map)} employee(s) with cards")
        except Exception as exc:
            logger.warning(f"[EasyTimePro] Failed to refresh card map: {exc}")

        try:
            resp = await loop.run_in_executor(
                None,
                lambda: client.get_transactions(page_size=200),
            )
        except Exception as exc:
            logger.warning(f"[EasyTimePro] Failed to fetch transactions: {exc}")
            return

        transactions = resp.get("data", [])
        if not transactions:
            return

        # Process only new transactions (id > watermark)
        new_txns = [
            t for t in transactions if t.get("id", 0) > self._last_transaction_id
        ]
        if not new_txns:
            return

        # Sort by id to process in order
        new_txns.sort(key=lambda t: t["id"])

        logger.info(
            f"[EasyTimePro] Processing {len(new_txns)} new transaction(s) "
            f"(from id {new_txns[0]['id']} to {new_txns[-1]['id']})"
        )

        for txn in new_txns:
            await self._process_transaction(txn)
            self._last_transaction_id = txn["id"]

    async def _process_transaction(self, txn: dict):
        """
        Process a single EasyTimePro transaction into our attendance system.
        We resolve emp_code -> card_no (RFID) via the personnel API card map,
        then match card_no against Student.rfid_id or Staff.rfid.
        """
        emp_code = str(txn.get("emp_code", "")).strip()
        punch_time_str = txn.get("punch_time", "")
        terminal_sn = txn.get("terminal_sn", "")
        txn_id = txn.get("id", 0)

        if not emp_code:
            return

        # Resolve emp_code to RFID card number
        rfid_card = self._card_map.get(emp_code)
        if not rfid_card:
            logger.warning(
                f"[EasyTimePro] emp_code '{emp_code}' has no card_no in personnel data (txn {txn_id})"
            )
            return

        # Parse punch time
        scan_time = None
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
            try:
                scan_time = datetime.strptime(punch_time_str, fmt)
                break
            except ValueError:
                continue

        if not scan_time:
            logger.warning(
                f"[EasyTimePro] Bad punch_time '{punch_time_str}' in txn {txn_id}"
            )
            return

        # Find device by serial number
        db = SessionLocal()
        try:
            device = (
                db.query(AttendanceDevice)
                .filter(AttendanceDevice.serial_number == terminal_sn)
                .first()
            )
            device_id = device.id if device else None

            # Check if we already processed this transaction
            existing = (
                db.query(AttendanceLog)
                .filter(AttendanceLog.remarks == f"etp:{txn_id}")
                .first()
            )
            if existing:
                return  # Already processed

            # Try to match card_no (RFID) to a student or staff
            student = db.query(Student).filter(Student.rfid_id == rfid_card).first()
            if student:
                await self._process_student_attendance(
                    db, student, device_id, rfid_card, scan_time, txn_id
                )
                return

            staff = db.query(Staff).filter(Staff.rfid == rfid_card).first()
            if staff:
                await self._process_staff_attendance(
                    db, staff, device_id, scan_time, txn_id
                )
                return

            logger.warning(
                f"[EasyTimePro] card_no '{rfid_card}' (emp_code '{emp_code}') not matched to any student or staff (txn {txn_id})"
            )
        except Exception:
            db.rollback()
            logger.exception(f"[EasyTimePro] Error processing txn {txn_id}")
        finally:
            db.close()

    async def _process_student_attendance(
        self, db, student, device_id, rfid, scan_time, txn_id
    ):
        """Create or update student attendance from an EasyTimePro transaction."""
        from datetime import time as dt_time

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
            # Check-out (update existing)
            if existing_log.check_in_time:
                gap = (scan_time - existing_log.check_in_time).total_seconds()
                if gap < 60 and not existing_log.check_out_time:
                    # Too close to check-in, skip
                    return
            existing_log.check_out_time = scan_time
            existing_log.remarks = f"etp:{txn_id}"
            existing_log.updated_at = datetime.utcnow()
            db.commit()
            event_type = "check_out"
            log_id = existing_log.id
            logger.info(
                f"[EasyTimePro] Check-out: {student.first_name} {student.surname or ''} "
                f"at {scan_time}"
            )
        else:
            # Check-in (new log)
            school_start = dt_time(9, 0, 0)
            status_val = "late" if scan_time.time() > school_start else "present"
            new_log = AttendanceLog(
                student_id=student.id,
                device_id=device_id,
                rfid_scanned=rfid,
                attendance_date=today,
                check_in_time=scan_time,
                status=status_val,
                is_manual_entry=False,
                remarks=f"etp:{txn_id}",
            )
            db.add(new_log)
            db.commit()
            db.refresh(new_log)
            event_type = "check_in"
            log_id = new_log.id
            logger.info(
                f"[EasyTimePro] Check-in: {student.first_name} {student.surname or ''} "
                f"({status_val}) at {scan_time}"
            )

        # Send notification
        try:
            from routers.attendance import send_attendance_notification_bg
            await send_attendance_notification_bg(
                student_id=student.id,
                attendance_log_id=log_id,
                event_type=event_type,
                check_in_time=scan_time if event_type == "check_in" else None,
                check_out_time=scan_time if event_type == "check_out" else None,
            )
        except Exception as exc:
            logger.error(f"[EasyTimePro] Notification error: {exc}")

    async def _process_staff_attendance(
        self, db, staff, device_id, scan_time, txn_id
    ):
        """Create or update staff attendance from an EasyTimePro transaction."""
        from models import StaffAttendance

        today = scan_time.date()

        existing = (
            db.query(StaffAttendance)
            .filter(
                StaffAttendance.staff_id == staff.id,
                StaffAttendance.attendance_date == today,
            )
            .first()
        )

        if existing:
            existing.check_out_time = scan_time
            existing.remarks = f"etp:{txn_id}"
            existing.updated_at = datetime.utcnow()
            db.commit()
            logger.info(
                f"[EasyTimePro] Staff check-out: {staff.first_name} {staff.last_name or ''} "
                f"at {scan_time}"
            )
        else:
            from datetime import time as dt_time

            school_start = dt_time(9, 0, 0)
            status_val = "late" if scan_time.time() > school_start else "present"
            new_att = StaffAttendance(
                staff_id=staff.id,
                attendance_date=today,
                check_in_time=scan_time,
                status=status_val,
                is_manual_entry=False,
                remarks=f"etp:{txn_id}",
            )
            db.add(new_att)
            db.commit()
            logger.info(
                f"[EasyTimePro] Staff check-in: {staff.first_name} {staff.last_name or ''} "
                f"({status_val}) at {scan_time}"
            )


# Module-level singleton
transaction_poller = TransactionPoller()
