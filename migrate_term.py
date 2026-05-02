"""Add term columns to fee_structures and fee_payments tables."""
from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    # Check if term column exists in fee_structures
    result = conn.execute(text(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_NAME='fee_structures' AND COLUMN_NAME='term'"
    ))
    if not result.fetchone():
        conn.execute(text("ALTER TABLE fee_structures ADD term INT NOT NULL DEFAULT 1"))
        print("Added term column to fee_structures")
    else:
        print("term column already exists in fee_structures")

    # Check if term column exists in fee_payments
    result = conn.execute(text(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_NAME='fee_payments' AND COLUMN_NAME='term'"
    ))
    if not result.fetchone():
        conn.execute(text("ALTER TABLE fee_payments ADD term INT NULL"))
        print("Added term column to fee_payments")
    else:
        print("term column already exists in fee_payments")

    conn.commit()
    print("Migration complete.")
