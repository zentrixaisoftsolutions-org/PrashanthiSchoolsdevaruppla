"""Diagnose why EasyTimePro punches aren't matching students.

Checks:
1. EasyTimePro personnel API -> what emp_codes have what card_no
2. Recent EasyTimePro transactions -> what emp_codes are punching
3. Local DB -> which students/staff have rfid set, do any match?
"""
import json
import sys
from services.easytimepro import get_client
from database import SessionLocal
from models import Student, Staff

TARGET_RFID = sys.argv[1] if len(sys.argv) > 1 else "3250871"

client = get_client()

print(f"=== Looking up RFID '{TARGET_RFID}' ===\n")

# 1. EasyTimePro personnel
print("--- EasyTimePro personnel (emp_code -> card_no) ---")
employees = client.get_employees()
print(f"Total employees: {len(employees)}")
matching_emp = []
for emp in employees:
    code = str(emp.get("emp_code", "")).strip()
    card = str(emp.get("card_no") or "").strip()
    name = f"{emp.get('first_name','')} {emp.get('last_name','')}".strip()
    print(f"  emp_code={code!r:>10}  card_no={card!r:>12}  name={name}")
    if card == TARGET_RFID:
        matching_emp.append(emp)

if matching_emp:
    print(f"\n  -> EasyTimePro employee found with card_no={TARGET_RFID}: emp_code={matching_emp[0].get('emp_code')}")
else:
    print(f"\n  -> NO EasyTimePro employee has card_no={TARGET_RFID}")
    print("     Fix: open EasyTimePro -> Personnel -> edit user -> set Card No to this RFID")

# 2. Recent transactions
print("\n--- Last 5 EasyTimePro transactions ---")
resp = client.get_transactions(page_size=5)
for t in resp.get("data", [])[:5]:
    print(f"  id={t.get('id')}  emp_code={t.get('emp_code')!r}  punch_time={t.get('punch_time')}  terminal_sn={t.get('terminal_sn')}")

# 3. Local DB
print("\n--- Local DB: students/staff with this rfid ---")
db = SessionLocal()
try:
    s = db.query(Student).filter(Student.rfid_id == TARGET_RFID).first()
    if s:
        print(f"  Student MATCH: id={s.id} name={s.first_name} {s.surname or ''} rfid_id={s.rfid_id!r}")
    else:
        print(f"  No Student with rfid_id={TARGET_RFID!r}")

    st = db.query(Staff).filter(Staff.rfid == TARGET_RFID).first()
    if st:
        print(f"  Staff MATCH: id={st.id} name={st.first_name} {st.last_name or ''} rfid={st.rfid!r}")
    else:
        print(f"  No Staff with rfid={TARGET_RFID!r}")

    # Show a few non-null rfid_id values to spot formatting issues
    print("\n  Sample of students that DO have rfid_id set:")
    sample = db.query(Student).filter(Student.rfid_id.isnot(None), Student.rfid_id != "").limit(10).all()
    for s in sample:
        print(f"    id={s.id} {s.first_name} {s.surname or ''}  rfid_id={s.rfid_id!r}")
    if not sample:
        print("    (none — no student has rfid_id set in DB)")
finally:
    db.close()
