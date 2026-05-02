#!/usr/bin/env python3
"""
WebSocket sink for the AiFace attendance device, with direct
write to the easyTimePro Postgres database AND fan-out to the
SchoolERP application (SQL Server + SMS via Twilio).

- Listens on 0.0.0.0:17788 (host iptables: 7788 -> 17788).
- Speaks the device's JSON-over-WebSocket protocol on /pub/chat.
- Each "sendlog" record is INSERTed into iclock_transaction.
- Idempotent: relies on the existing UNIQUE constraint
    (emp_code, punch_time, terminal_sn, company_id)
  so re-pushed records are silently ignored.
- New devices auto-register in iclock_terminal on first connect
  (zero-touch onboarding for additional AiFace units).
- On every (re)connection, the device is asked to replay attendance
  logs from the last 48 hours so transient outages don't lose data.
- For each swipe whose RFID is known, the SchoolERP attendance
  processor is called -- it marks check-in/out in SQL Server and
  sends the parent/staff SMS via Twilio.
"""
import base64
import hashlib
import json
import os
import socket
import struct
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    psycopg2 = None  # DB writes will be skipped with a log message

# ----- config ----------------------------------------------------------------
PORT = int(os.environ.get("WS_PORT", "17788"))
LOG = Path(__file__).with_name("device_messages.log")
GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

# Device sends timestamps in this local timezone.
DEVICE_TZ = timezone(timedelta(hours=5, minutes=30))  # IST

# Postgres (easyTimePro). Container exposes 5432 -> host 7496.
DB = {
    "host": os.environ.get("PGHOST", "127.0.0.1"),
    "port": int(os.environ.get("PGPORT", "7496")),
    "dbname": os.environ.get("PGDATABASE", "easytime"),
    "user": os.environ.get("PGUSER", "my_super_user"),
    "password": os.environ.get("PGPASSWORD", "mysecretpass"),
}

# Hard-coded company id pulled from existing rows in iclock_transaction.
COMPANY_ID = "6b969e80-f3ff-11e9-afc7-acde48001122"

# How far back to ask the device to replay on each (re)connection.
BACKFILL_HOURS = int(os.environ.get("BACKFILL_HOURS", "48"))

# Where the SchoolERP backend source lives on the VPS. The sink imports
# the attendance_processor module from there to fan out swipes into
# SchoolERP's SQL Server and trigger SMS notifications.
SCHOOLERP_PATH = os.environ.get("SCHOOLERP_PATH", "/home/ktsbnd/SMS/backend")
if SCHOOLERP_PATH and SCHOOLERP_PATH not in sys.path:
    sys.path.insert(0, SCHOOLERP_PATH)

_processor = None
_processor_load_attempted = False
_processor_lock = threading.Lock()


def get_processor():
    """Lazy-load services.attendance_processor from SchoolERP.

    Returns the module, or None if it can't be imported (e.g. SchoolERP
    is not installed on this machine). Errors are logged once.
    """
    global _processor, _processor_load_attempted
    if _processor is not None or _processor_load_attempted:
        return _processor
    with _processor_lock:
        if _processor is not None or _processor_load_attempted:
            return _processor
        _processor_load_attempted = True
        try:
            from services import attendance_processor as _p  # type: ignore
            _processor = _p
            log(f"SchoolERP attendance_processor loaded from {SCHOOLERP_PATH}")
        except Exception as e:
            log(f"SchoolERP attendance_processor NOT available ({type(e).__name__}: {e}) "
                f"-- swipes will be written to easyTimePro only")
        return _processor

# ----- logging ---------------------------------------------------------------

_log_lock = threading.Lock()


def log(msg):
    line = f"[{datetime.now(timezone.utc).isoformat(timespec='seconds')}] {msg}"
    with _log_lock:
        print(line, flush=True)
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")


# ----- DB --------------------------------------------------------------------

_db_lock = threading.Lock()
_db_conn = None
_terminal_cache = {}  # sn -> (terminal_id, alias)
_employee_cache = {}  # (name_lower, enrollid) -> (emp_code, emp_id)
_card_cache = {}      # (sn, enrollid) -> {"name":..., "cardno":..., "raw":{...}}

MODE_NAMES = {0: "PWD", 1: "FP", 2: "CARD", 3: "FACE", 4: "PWD",
              5: "PALM", 6: "FV", 8: "CARD", 10: "CARD", 50: "FACE"}
BACKUPNUM_NAMES = {10: "card", 11: "password", 50: "face"}
# fingerprint slots are 0..9


def db_connect():
    global _db_conn
    if psycopg2 is None:
        return None
    try:
        _db_conn = psycopg2.connect(**DB, connect_timeout=5)
        _db_conn.autocommit = True
        log(f"DB connected to {DB['host']}:{DB['port']}/{DB['dbname']}")
        return _db_conn
    except Exception as e:
        log(f"DB connect FAILED: {type(e).__name__}: {e}")
        _db_conn = None
        return None


def db_get():
    global _db_conn
    with _db_lock:
        if _db_conn is None:
            return db_connect()
        try:
            with _db_conn.cursor() as c:
                c.execute("SELECT 1")
            return _db_conn
        except Exception:
            log("DB connection stale, reconnecting...")
            try:
                _db_conn.close()
            except Exception:
                pass
            _db_conn = None
            return db_connect()


def lookup_terminal(sn):
    if sn in _terminal_cache:
        return _terminal_cache[sn]
    conn = db_get()
    if conn is None:
        return (None, None)
    try:
        with conn.cursor() as c:
            c.execute("SELECT id, alias FROM iclock_terminal WHERE sn=%s", (sn,))
            row = c.fetchone()
            if row:
                _terminal_cache[sn] = (row[0], row[1])
                return _terminal_cache[sn]
    except Exception as e:
        log(f"lookup_terminal({sn}) failed: {e}")
    _terminal_cache[sn] = (None, None)
    return (None, None)


def auto_register_terminal(sn, info, peer_ip):
    """Insert a new iclock_terminal row for an unknown SN.

    Called on the first 'reg' from a device we've never seen before.
    Uses sensible defaults so the row is immediately usable; the
    subsequent update_terminal_status() call fills in counts and state.
    Idempotent thanks to ON CONFLICT (sn) DO NOTHING.
    """
    conn = db_get()
    if conn is None:
        return
    info = info or {}
    now_utc = datetime.now(timezone.utc)
    sql = """
        INSERT INTO iclock_terminal (
            create_time, change_time, status, sn, alias, ip_address, real_ip,
            state, terminal_tz, heartbeat, transfer_mode, transfer_interval,
            transfer_time, is_attendance, is_registration, authentication,
            push_protocol, push_ver, is_tft, terminal_name, fw_ver,
            user_count, user_capacity, transaction_count, transaction_capacity,
            face_count, face_capacity, fp_count, fp_capacity, fp_alg_ver,
            photo_func_on, fp_func_on, face_func_on, fv_func_on, palm_func_on,
            lock_func, is_access, last_activity, upload_time, push_time,
            company_id
        ) VALUES (
            %s, %s, 0, %s, %s, %s, %s,
            1, 33, 30, 1, 60,
            '00:00;01:00', 1, 1, 0,
            'aiface-ws', '1.0', TRUE, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s, %s,
            FALSE, %s, TRUE, FALSE, FALSE,
            0, 0, %s, %s, %s,
            %s
        )
        ON CONFLICT (sn) DO NOTHING
        RETURNING id, alias
    """
    params = (
        now_utc, now_utc, sn, sn, peer_ip, peer_ip,
        info.get("modelname") or sn, info.get("firmware", ""),
        info.get("useduser"), info.get("usersize"),
        info.get("usedlog"), info.get("logsize"),
        info.get("usedface"), info.get("facesize"),
        info.get("usedfp"), info.get("fpsize"), info.get("fpalgo", ""),
        (info.get("fpsize") or 0) > 0,
        now_utc, now_utc, now_utc,
        COMPANY_ID,
    )
    try:
        with _db_lock, conn.cursor() as c:
            c.execute(sql, params)
            row = c.fetchone()
            if row:
                _terminal_cache[sn] = (row[0], row[1])
                log(f"  AUTO-REGISTERED new terminal sn={sn} id={row[0]}")
                # Also register in SchoolERP if available
                proc = get_processor()
                if proc is not None and hasattr(proc, "register_device"):
                    try:
                        proc.register_device(sn, peer_ip, info.get("modelname") or "AiFace")
                    except Exception as e:
                        log(f"  SchoolERP register_device failed: {e}")
    except Exception as e:
        log(f"  auto_register_terminal({sn}) failed: {type(e).__name__}: {e}")


def lookup_employee(name, enrollid):
    """Resolve device user -> easyTimePro (emp_code, emp_id).

    1. Match by first_name (case-insensitive) since the device's enrollid
       does NOT necessarily equal easyTimePro emp_code.
    2. Fall back to emp_code == str(enrollid).
    3. Else return (str(enrollid), None) so the row is still inserted.
    """
    key = ((name or "").strip().lower(), str(enrollid))
    if key in _employee_cache:
        return _employee_cache[key]
    conn = db_get()
    if conn is None:
        return (str(enrollid), None)
    result = (str(enrollid), None)
    try:
        with conn.cursor() as c:
            if name:
                c.execute(
                    "SELECT emp_code, id FROM personnel_employee "
                    "WHERE LOWER(first_name)=LOWER(%s) LIMIT 1",
                    (name.strip(),),
                )
                row = c.fetchone()
                if row:
                    result = (row[0], row[1])
            if result[1] is None:
                c.execute(
                    "SELECT emp_code, id FROM personnel_employee "
                    "WHERE emp_code=%s LIMIT 1",
                    (str(enrollid),),
                )
                row = c.fetchone()
                if row:
                    result = (row[0], row[1])
    except Exception as e:
        log(f"lookup_employee(name={name!r}, enrollid={enrollid}) failed: {e}")
    _employee_cache[key] = result
    return result


def insert_records(sn, records):
    """records: list of dicts from device's sendlog payload.

    Inserts into iclock_transaction (easyTimePro) and, for every record
    with a known card number, fans out to the SchoolERP attendance
    processor (which marks check-in/out in SQL Server + sends SMS).
    """
    conn = db_get()
    if conn is None:
        log(f"DB unavailable, dropping {len(records)} records for {sn}")
        return 0
    terminal_id, terminal_alias = lookup_terminal(sn)
    rows = []
    fanout = []  # list of (cardno, scan_time_local, sn) for SchoolERP
    now_utc = datetime.now(timezone.utc)
    for r in records:
        enrollid = r.get("enrollid")
        if enrollid in (None, ""):
            continue
        try:
            naive = datetime.strptime(r["time"], "%Y-%m-%d %H:%M:%S")
            scan_time_local = naive  # device-local (IST), used for SchoolERP
            punch_time = naive.replace(tzinfo=DEVICE_TZ).astimezone(timezone.utc)
        except Exception as e:
            log(f"  bad time '{r.get('time')}': {e}")
            continue
        emp_code, emp_id = lookup_employee(r.get("name"), enrollid)
        log(f"     -> mapped enrollid={enrollid} name={r.get('name')!r} "
            f"-> emp_code={emp_code} emp_id={emp_id}")
        rows.append((
            emp_code,
            punch_time,
            str(r.get("inout", 0)),       # punch_state
            int(r.get("mode", 0)),         # verify_type
            "0",                           # work_code
            sn,                            # terminal_sn
            terminal_alias,                # terminal_alias
            1,                             # source = device
            now_utc,                       # upload_time
            emp_id,                        # emp_id (may be NULL)
            terminal_id,                   # terminal_id (may be NULL)
            COMPANY_ID,                    # company_id
        ))
        cached = _card_cache.get((sn, enrollid), {})
        cardno = cached.get("cardno")
        if cardno:
            fanout.append((str(cardno), scan_time_local, sn))
    if not rows:
        return 0
    sql = """
        INSERT INTO iclock_transaction
            (emp_code, punch_time, punch_state, verify_type, work_code,
             terminal_sn, terminal_alias, source, upload_time,
             emp_id, terminal_id, company_id)
        VALUES %s
        ON CONFLICT (emp_code, punch_time, terminal_sn, company_id) DO NOTHING
    """
    try:
        with _db_lock, conn.cursor() as c:
            execute_values(c, sql, rows)
            inserted = c.rowcount
        log(f"  DB inserted {inserted}/{len(rows)} record(s)")
        # Fan out to SchoolERP for SMS / SQL Server attendance marking.
        # Run in a background thread so we ack the device fast.
        if fanout:
            threading.Thread(
                target=_fanout_to_schoolerp, args=(fanout,), daemon=True
            ).start()
        return inserted
    except Exception as e:
        log(f"  DB insert FAILED: {type(e).__name__}: {e}")
        return 0


def _fanout_to_schoolerp(events):
    """events: list of (cardno, scan_time_local, sn). Calls the SchoolERP
    attendance_processor for each one. Errors per-event are isolated."""
    proc = get_processor()
    if proc is None:
        return
    for cardno, scan_time_local, sn in events:
        try:
            result = proc.process_realtime_swipe(cardno, scan_time_local, sn)
            log(f"     SchoolERP cardno={cardno}: {result}")
        except Exception as e:
            log(f"     SchoolERP fanout FAILED for cardno={cardno}: "
                f"{type(e).__name__}: {e}")


def cache_user(sn, u):
    """Store one user record from the device in memory and try to
    persist the card number into personnel_employee.card_no."""
    eid = u.get("enrollid")
    if eid is None:
        return
    name = u.get("name")
    cardno = u.get("cardno") or u.get("card") or u.get("cardId")
    info = {"name": name, "cardno": cardno, "raw": u}
    _card_cache[(sn, eid)] = info
    log(f"     user enrollid={eid} name={name!r} cardno={cardno!r} raw={u}")
    # Persist card number into personnel_employee for matching
    if cardno:
        emp_code, _ = lookup_employee(name, eid)
        conn = db_get()
        if conn is None:
            return
        try:
            with _db_lock, conn.cursor() as c:
                c.execute(
                    "UPDATE personnel_employee SET card_no=%s "
                    "WHERE emp_code=%s AND (card_no IS NULL OR card_no='')",
                    (str(cardno), emp_code),
                )
                if c.rowcount:
                    log(f"     -> saved cardno={cardno} for emp_code={emp_code}")
        except Exception as e:
            log(f"     cardno save failed: {e}")


def update_terminal_status(sn, info, peer_ip):
    """Update iclock_terminal so easyTimePro shows the device as live."""
    if not info:
        return
    conn = db_get()
    if conn is None:
        return
    now_utc = datetime.now(timezone.utc)
    sql = """
        UPDATE iclock_terminal SET
            state = 1,
            status = 0,
            last_activity = %s,
            upload_time = %s,
            push_time = %s,
            real_ip = %s,
            ip_address = COALESCE(ip_address, %s),
            fw_ver = COALESCE(NULLIF(%s, ''), fw_ver),
            push_protocol = COALESCE(NULLIF(push_protocol, ''), 'aiface-ws'),
            push_ver = COALESCE(NULLIF(push_ver, ''), '1.0'),
            user_count = %s,
            user_capacity = %s,
            transaction_count = %s,
            transaction_capacity = %s,
            face_count = %s,
            face_capacity = %s,
            fp_count = %s,
            fp_capacity = %s,
            fp_alg_ver = COALESCE(NULLIF(%s, ''), fp_alg_ver),
            face_func_on = TRUE,
            fp_func_on = (%s > 0)
        WHERE sn = %s
    """
    params = (
        now_utc, now_utc, now_utc,
        peer_ip, peer_ip,
        info.get("firmware", ""),
        info.get("useduser"), info.get("usersize"),
        info.get("usedlog"), info.get("logsize"),
        info.get("usedface"), info.get("facesize"),
        info.get("usedfp"), info.get("fpsize"),
        info.get("fpalgo", ""),
        info.get("fpsize") or 0,
        sn,
    )
    try:
        with _db_lock, conn.cursor() as c:
            c.execute(sql, params)
        log(f"  terminal {sn} status updated")
    except Exception as e:
        log(f"  terminal status update FAILED: {type(e).__name__}: {e}")


# ----- WebSocket plumbing ----------------------------------------------------


def hexdump(data, limit=512):
    data = data[:limit]
    out = []
    for i in range(0, len(data), 16):
        chunk = data[i:i + 16]
        hx = " ".join(f"{b:02x}" for b in chunk).ljust(48)
        ascii_ = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
        out.append(f"  {i:04x}  {hx}  |{ascii_}|")
    return "\n".join(out)


def recv_exact(sock, n):
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            return None
        buf += chunk
    return buf


def read_http_request(sock):
    buf = b""
    while b"\r\n\r\n" not in buf:
        chunk = sock.recv(4096)
        if not chunk:
            return None
        buf += chunk
        if len(buf) > 65536:
            return None
    head, _, rest = buf.partition(b"\r\n\r\n")
    return head.decode("latin-1"), rest


def ws_accept_key(client_key):
    sha1 = hashlib.sha1((client_key + GUID).encode()).digest()
    return base64.b64encode(sha1).decode()


def send_ws_frame(sock, payload, opcode=0x1):
    if isinstance(payload, str):
        payload = payload.encode("utf-8")
    header = bytes([0x80 | opcode])
    n = len(payload)
    if n < 126:
        header += bytes([n])
    elif n < 65536:
        header += bytes([126]) + struct.pack(">H", n)
    else:
        header += bytes([127]) + struct.pack(">Q", n)
    sock.sendall(header + payload)


def read_ws_frame(sock):
    head = recv_exact(sock, 2)
    if not head:
        return None
    b1, b2 = head[0], head[1]
    fin = (b1 & 0x80) != 0
    opcode = b1 & 0x0F
    masked = (b2 & 0x80) != 0
    plen = b2 & 0x7F
    if plen == 126:
        ext = recv_exact(sock, 2)
        if not ext:
            return None
        plen = struct.unpack(">H", ext)[0]
    elif plen == 127:
        ext = recv_exact(sock, 8)
        if not ext:
            return None
        plen = struct.unpack(">Q", ext)[0]
    mask = b""
    if masked:
        mask = recv_exact(sock, 4)
        if not mask:
            return None
    payload = recv_exact(sock, plen) if plen else b""
    if payload is None:
        return None
    if masked and payload:
        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    return fin, opcode, payload


def handle(sock, addr):
    log(f"=== NEW CONNECTION from {addr[0]}:{addr[1]} ===")
    sn = "unknown"
    backfill_done = False  # 48h backfill is requested once per connection
    probe_done = False     # getuserlist is requested once per connection
    try:
        req = read_http_request(sock)
        if not req:
            return
        head, rest = req
        lines = head.split("\r\n")
        headers = {}
        for line in lines[1:]:
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()

        if "websocket" not in headers.get("upgrade", "").lower():
            log("not a websocket upgrade - replying 200 OK")
            sock.sendall(b"HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello")
            return

        accept = ws_accept_key(headers.get("sec-websocket-key", ""))
        sock.sendall((
            "HTTP/1.1 101 Switching Protocols\r\n"
            "Upgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
        ).encode("latin-1"))
        log("--- HANDSHAKE OK ---")

        sock.settimeout(120)
        last_ping = time.time()

        while True:
            frame = read_ws_frame(sock)
            if frame is None:
                log(f"connection closed by {sn}")
                return
            fin, op, data = frame

            if op == 0x9:
                send_ws_frame(sock, data, opcode=0xA)
                continue
            if op == 0xA:
                continue
            if op == 0x8:
                try:
                    send_ws_frame(sock, b"", opcode=0x8)
                except Exception:
                    pass
                return

            try:
                text = data.decode("utf-8")
                j = json.loads(text)
            except Exception:
                log(f"non-JSON frame ({len(data)}b):\n{hexdump(data)}")
                continue

            cmd = j.get("cmd") or j.get("ret")
            is_response = "ret" in j and "cmd" not in j
            sn = j.get("sn", sn)
            now = datetime.now(DEVICE_TZ).strftime("%Y-%m-%d %H:%M:%S")
            reply = None

            if is_response and cmd == "getuserlist":
                # Device returned credential slots. For each card slot ask for
                # the actual card number via getuserinfo.
                slots = j.get("record", []) or []
                log(f"USERLIST sn={sn} slots={len(slots)}")
                for slot in slots:
                    eid = slot.get("enrollid")
                    bn = slot.get("backupnum")
                    log(f"     enrollid={eid} backupnum={bn} "
                        f"({BACKUPNUM_NAMES.get(bn, 'fp/other')})")
                    if bn == 10:  # card slot -> ask for it
                        q = {"cmd": "getuserinfo", "sn": sn,
                             "enrollid": eid, "backupnum": bn}
                        send_ws_frame(sock, json.dumps(q), opcode=0x1)
                        log(f"     -> getuserinfo({eid},{bn})")
                continue

            if is_response and cmd == "getuserinfo":
                # Per-slot user info; cardno typically present for backupnum 10.
                cache_user(sn, j)
                continue

            if is_response and cmd == "getalllog":
                # Replay of historical attendance from backfill request.
                records = j.get("record", []) or []
                log(f"BACKFILL sn={sn} count={len(records)} "
                    f"(from={j.get('from')} to={j.get('to')})")
                if records:
                    insert_records(sn, records)
                continue

            if cmd == "reg":
                info = j.get("devinfo", {})
                log(f"REG sn={sn} model={info.get('modelname')} "
                    f"users={info.get('useduser')} logs={info.get('usedlog')} "
                    f"rt={info.get('usedrtlog')}")
                # Auto-register if this SN has never been seen.
                if lookup_terminal(sn) == (None, None):
                    auto_register_terminal(sn, info, addr[0])
                update_terminal_status(sn, info, addr[0])
                reply = {"ret": "reg", "result": True,
                         "cloudtime": now, "nosenduser": True}
                # After acking reg, ask the device to dump its user list so
                # we can learn the card numbers (once per connection).
                send_ws_frame(sock, json.dumps(reply), opcode=0x1)
                reply = None
                if not probe_done:
                    probe = {"cmd": "getuserlist", "sn": sn, "stn": True}
                    send_ws_frame(sock, json.dumps(probe), opcode=0x1)
                    log(f"  -> probe sent: {probe}")
                    probe_done = True
                # Ask for the last N hours of attendance logs so any swipes
                # that happened while the sink was down are replayed.
                # Idempotent: existing rows are skipped by the UNIQUE
                # constraint on iclock_transaction.
                if not backfill_done and BACKFILL_HOURS > 0:
                    end_dt = datetime.now(DEVICE_TZ)
                    start_dt = end_dt - timedelta(hours=BACKFILL_HOURS)
                    backfill = {
                        "cmd": "getalllog",
                        "sn": sn,
                        "stn": True,
                        "from": start_dt.strftime("%Y-%m-%d %H:%M:%S"),
                        "to": end_dt.strftime("%Y-%m-%d %H:%M:%S"),
                    }
                    send_ws_frame(sock, json.dumps(backfill), opcode=0x1)
                    log(f"  -> {BACKFILL_HOURS}h backfill requested: "
                        f"{backfill['from']} -> {backfill['to']}")
                    backfill_done = True
            elif cmd == "sendlog":
                records = j.get("record", []) or []
                log(f"SENDLOG sn={sn} count={len(records)}")
                for r in records:
                    eid = r.get("enrollid")
                    cached = _card_cache.get((sn, eid), {})
                    cardno = cached.get("cardno") or "?"
                    mname = MODE_NAMES.get(r.get("mode"), str(r.get("mode")))
                    log(f"  -> enrollid={eid} "
                        f"name={r.get('name')!r} "
                        f"cardno={cardno} "
                        f"time={r.get('time')} "
                        f"mode={mname} "
                        f"inout={r.get('inout')} "
                        f"event={r.get('event')}")
                insert_records(sn, records)
                reply = {"ret": "sendlog", "result": True,
                         "count": len(records),
                         "logindex": j.get("logindex", 0),
                         "cloudtime": now}
            elif cmd in ("senduser", "getuserlist", "getuserinfo"):
                # Device sending us user list / info. Cache cardno per enrollid.
                payload_keys = [k for k in j.keys() if k != "sn" and k != "cmd"]
                log(f"USERINFO cmd={cmd} sn={sn} keys={payload_keys}")
                # Two common shapes:
                #   {"cmd":"senduser","enrollid":2,"name":"ram","cardno":"...","backupnum":...}
                #   {"cmd":"getuserlist","count":N,"record":[{...},{...}]}
                if isinstance(j.get("record"), list):
                    for u in j["record"]:
                        cache_user(sn, u)
                else:
                    cache_user(sn, j)
                reply = {"ret": cmd, "result": True, "cloudtime": now}
            else:
                log(f"OTHER cmd={cmd} payload={text[:500]}")
                reply = {"ret": cmd, "result": True, "cloudtime": now}

            if reply is not None:
                send_ws_frame(sock, json.dumps(reply), opcode=0x1)

            if time.time() - last_ping > 30:
                send_ws_frame(sock, b"keepalive", opcode=0x9)
                last_ping = time.time()

    except Exception as e:
        log(f"handler error: {type(e).__name__}: {e}")
    finally:
        try:
            sock.close()
        except Exception:
            pass


def main():
    log(f"==== ws_sink starting on 0.0.0.0:{PORT} "
        f"(psycopg2={'OK' if psycopg2 else 'MISSING'}) ====")
    db_connect()
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("0.0.0.0", PORT))
    srv.listen(50)
    while True:
        client, addr = srv.accept()
        threading.Thread(target=handle, args=(client, addr), daemon=True).start()


if __name__ == "__main__":
    main()
