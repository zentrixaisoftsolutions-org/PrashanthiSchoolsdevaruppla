from database import engine
from sqlalchemy import text
with engine.connect() as conn:
    r = conn.execute(text("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='mobile_push_tokens'"))
    row = r.fetchone()
    if row:
        print("Table mobile_push_tokens exists")
    else:
        print("Table NOT found, creating...")
        from models import Base
        Base.metadata.create_all(bind=engine)
        print("Created.")
