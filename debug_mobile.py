from database import SessionLocal
from models import User, Student

db = SessionLocal()

# Check user
user = db.query(User).filter(User.phone == '9533555661').first()
if user:
    print(f'User: id={user.id}, phone={user.phone}, full_name={user.full_name}, email={user.email}')
else:
    print('No user with phone 9533555661')

# Check student with exact match
students = db.query(Student).filter(Student.mobile_number == '9533555661').all()
print(f'Students with mobile_number == 9533555661: {len(students)}')
for s in students:
    print(f'  Student: id={s.id}, name={s.first_name} {s.surname}, user_id={s.user_id}, mobile={s.mobile_number}')

# Check with LIKE
students2 = db.query(Student).filter(Student.mobile_number.like('%9533555661%')).all()
print(f'Students LIKE 9533555661: {len(students2)}')
for s in students2:
    print(f'  Student: id={s.id}, name={s.first_name} {s.surname}, mobile_number="{s.mobile_number}", user_id={s.user_id}')

# Show a sample of mobile numbers to see the format
samples = db.query(Student.id, Student.mobile_number).filter(Student.mobile_number != None).limit(10).all()
print(f'\nSample mobile numbers:')
for s in samples:
    print(f'  id={s.id}, mobile_number="{s.mobile_number}"')

db.close()
