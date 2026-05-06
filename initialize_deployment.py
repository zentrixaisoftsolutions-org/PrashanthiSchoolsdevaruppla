"""
Deployment initialization for SchoolERP (single-school build).

Creates all tables from the SQLAlchemy models, seeds the five base roles,
seeds a superadmin user, and seeds a default school_settings row so the
header / receipts have a name to render before the operator updates it.

Assumes the target database already exists — deploy-on-server.sh creates
it via sqlcmd before invoking this script. Connection details come from
the .env file via config.settings (DB_SERVER / DB_NAME / DB_USER / etc).

Usage:
    python initialize_deployment.py

Optional env vars:
    SUPERADMIN_EMAIL      default: superadmin@prashanthischools.com
    SUPERADMIN_USERNAME   default: superadmin
    SUPERADMIN_PASSWORD   default: superadmin@123
    SCHOOL_NAME           default: My School (used to seed school_settings)
"""

import os
import sys
from sqlalchemy.orm import Session
from database import SessionLocal, engine, Base
from models import Role, User, SchoolSettings
from auth import AuthService


SUPERADMIN_EMAIL    = os.environ.get("SUPERADMIN_EMAIL",    "superadmin@prashanthischools.com")
SUPERADMIN_USERNAME = os.environ.get("SUPERADMIN_USERNAME", "superadmin")
SUPERADMIN_PASSWORD = os.environ.get("SUPERADMIN_PASSWORD", "superadmin@123")
SCHOOL_NAME         = os.environ.get("SCHOOL_NAME",         "My School")


def create_tables() -> bool:
    print("\n[*] Creating database tables...")
    try:
        Base.metadata.create_all(bind=engine)
        print("[OK] Tables created (or already present)")
        return True
    except Exception as e:
        print(f"[ERROR] create_all failed: {e}")
        return False


def seed_roles(db: Session) -> None:
    roles = [
        ("super_admin", "Super Administrator - Full system access"),
        ("admin",       "School Administrator"),
        ("teacher",     "Teacher"),
        ("student",     "Student"),
        ("parent",      "Parent/Guardian"),
    ]
    for name, description in roles:
        if not db.query(Role).filter(Role.name == name).first():
            db.add(Role(name=name, description=description))
    db.commit()
    print("[OK] Roles seeded")


def seed_superadmin(db: Session) -> None:
    if db.query(User).filter(User.username == SUPERADMIN_USERNAME).first():
        print(f"[OK] Superadmin '{SUPERADMIN_USERNAME}' already exists")
        return

    super_admin_role = db.query(Role).filter(Role.name == "super_admin").first()
    if not super_admin_role:
        raise RuntimeError("super_admin role missing — seed_roles() must run first")

    db.add(User(
        email=SUPERADMIN_EMAIL,
        username=SUPERADMIN_USERNAME,
        full_name="Super Administrator",
        phone="0000000000",
        hashed_password=AuthService.hash_password(SUPERADMIN_PASSWORD),
        role_id=super_admin_role.id,
        is_active=True,
    ))
    db.commit()
    print(f"[OK] Superadmin created — username={SUPERADMIN_USERNAME}, email={SUPERADMIN_EMAIL}")


def seed_school_settings(db: Session) -> None:
    if db.query(SchoolSettings).first():
        print("[OK] school_settings row already exists")
        return
    db.add(SchoolSettings(school_name=SCHOOL_NAME))
    db.commit()
    print(f"[OK] school_settings seeded with school_name='{SCHOOL_NAME}'")


def main() -> int:
    print("=" * 60)
    print("   SCHOOLERP DEPLOYMENT INITIALIZATION")
    print("=" * 60)

    if not create_tables():
        return 1

    db = SessionLocal()
    try:
        seed_roles(db)
        seed_superadmin(db)
        seed_school_settings(db)
    except Exception as e:
        print(f"[ERROR] seeding failed: {e}")
        db.rollback()
        return 1
    finally:
        db.close()

    print("\n" + "=" * 60)
    print("   INITIALIZATION COMPLETE")
    print("=" * 60)
    print(f"\nLogin: {SUPERADMIN_USERNAME} / {SUPERADMIN_PASSWORD}")
    print("Change the superadmin password after first login.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
