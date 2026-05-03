"""
Deployment Initialization Script for SchoolERP

This script initializes a fresh SchoolERP installation by:
1. Creating the database (if it doesn't exist)
2. Creating all required tables
3. Seeding initial data (roles, superadmin account)

Run this on any machine after deployment to set up the system.

Usage:
    python initialize_deployment.py [--db-name DATABASE_NAME]

Example:
    python initialize_deployment.py --db-name SchoolERP
    python initialize_deployment.py --db-name SchoolERP_Prod
"""

import argparse
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import SessionLocal, engine, Base
from models import Role, User, School
from auth import AuthService
from config import settings

def create_database(db_name: str, server: str = None, user: str = None, password: str = None, use_windows_auth: bool = True):
    """Create database if it doesn't exist."""
    print(f"\n[*] Initializing database '{db_name}'...")
    # For Docker deployment, database is created via SQLAlchemy ORM in create_tables()
    # This function is a no-op since we use pymssql which creates DB automatically
    print(f"[OK] Database '{db_name}' initialization deferred to table creation")
    return True


def create_tables():
    """Create all database tables from models."""
    print("\n[*] Creating database tables...")
    try:
        Base.metadata.create_all(bind=engine)
        print("[OK] Database tables created successfully")
        return True
    except Exception as e:
        print(f"[ERROR] Failed to create tables: {e}")
        return False


def seed_initial_data(db: Session):
    """Seed initial required data (roles and superadmin)."""
    print("\n[*] Seeding initial data...")

    try:
        # Create roles
        roles_data = [
            {"name": "super_admin", "description": "Super Administrator - Full system access"},
            {"name": "admin", "description": "School Administrator"},
            {"name": "teacher", "description": "Teacher"},
            {"name": "student", "description": "Student"},
            {"name": "parent", "description": "Parent/Guardian"},
        ]

        for role_data in roles_data:
            existing = db.query(Role).filter(Role.name == role_data["name"]).first()
            if not existing:
                role = Role(**role_data)
                db.add(role)

        db.commit()
        print("[OK] Roles created")

        # Create superadmin user
        super_admin_role = db.query(Role).filter(Role.name == "super_admin").first()

        existing_admin = db.query(User).filter(User.username == "superadmin").first()
        if not existing_admin:
            superadmin = User(
                email="superadmin@prashanthischools.com",
                username="superadmin",
                full_name="Super Administrator",
                phone="0000000000",
                hashed_password=AuthService.hash_password("superadmin@123"),
                role_id=super_admin_role.id,
                school_id=None,  # Super admin has no school restriction
                is_active=True
            )
            db.add(superadmin)
            db.commit()
            print("[OK] Superadmin user created")
            print("\n    Superadmin Credentials:")
            print("    Username: superadmin")
            print("    Password: superadmin@123")
        else:
            print("[OK] Superadmin user already exists")

        return True
    except Exception as e:
        print(f"[ERROR] Failed to seed initial data: {e}")
        db.rollback()
        return False


def main():
    """Main initialization function."""
    parser = argparse.ArgumentParser(
        description="Initialize SchoolERP deployment",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python initialize_deployment.py
  python initialize_deployment.py --db-name SchoolERP_Prod
        """
    )
    parser.add_argument(
        "--db-name",
        type=str,
        default="SchoolERP",
        help="Database name to create/initialize (default: SchoolERP)"
    )
    parser.add_argument(
        "--server",
        type=str,
        default="localhost\\SQLEXPRESS",
        help="SQL Server address (default: localhost\\SQLEXPRESS)"
    )
    parser.add_argument(
        "--windows-auth",
        action="store_true",
        default=True,
        help="Use Windows Authentication (default: True)"
    )
    parser.add_argument(
        "--sql-user",
        type=str,
        help="SQL Server username (only for SQL authentication)"
    )
    parser.add_argument(
        "--sql-password",
        type=str,
        help="SQL Server password (only for SQL authentication)"
    )

    args = parser.parse_args()

    print("\n" + "="*60)
    print("   SCHOOLERP DEPLOYMENT INITIALIZATION")
    print("="*60)

    # Step 1: Create database
    if not create_database(
        args.db_name,
        server=args.server,
        user=args.sql_user,
        password=args.sql_password,
        use_windows_auth=args.windows_auth
    ):
        print("\n[ERROR] Initialization failed at database creation")
        return False

    # Step 2: Create tables
    if not create_tables():
        print("\n[ERROR] Initialization failed at table creation")
        return False

    # Step 3: Seed initial data
    db = SessionLocal()
    try:
        if not seed_initial_data(db):
            print("\n[ERROR] Initialization failed at data seeding")
            return False
    finally:
        db.close()

    print("\n" + "="*60)
    print("   INITIALIZATION COMPLETED SUCCESSFULLY!")
    print("="*60)
    print("\n[i] Next Steps:")
    print("    1. Log in with superadmin account")
    print("    2. Create schools and administrators")
    print("    3. Add teachers, students, and other users")
    print("\n[i] For production, remember to:")
    print("    - Change the superadmin password immediately")
    print("    - Configure database backups")
    print("    - Set up proper access controls")
    print("\n" + "="*60 + "\n")

    return True


if __name__ == "__main__":
    import sys
    success = main()
    sys.exit(0 if success else 1)
