import sys; sys.path.insert(0, '.')
from database import SessionLocal
from models import Student, Staff

db = SessionLocal()
students = db.query(Student).filter(Student.rfid_id.isnot(None), Student.rfid_id != '').all()
staff = db.query(Staff).filter(Staff.rfid.isnot(None), Staff.rfid != '').all()

print("Students with RFID:")
for s in students:
    print(f"  id={s.id} name={s.first_name} {s.surname or ''} rfid={s.rfid_id}")

print(f"\nStaff with RFID:")
for s in staff:
    print(f"  id={s.id} name={s.first_name} {s.last_name or ''} rfid={s.rfid}")

db.close()
