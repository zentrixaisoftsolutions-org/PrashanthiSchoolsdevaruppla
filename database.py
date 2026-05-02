from contextvars import ContextVar
from sqlalchemy import create_engine, Column, String, event
from sqlalchemy.orm import sessionmaker, declarative_base, declared_attr
from sqlalchemy.pool import QueuePool
from config import settings

# ── Audit trail context ──────────────────────────────────────────
# Stores the current user's full name for automatic audit fields.
# Set by get_current_user() on every authenticated request.
current_user_name: ContextVar[str] = ContextVar('current_user_name', default='')


class AuditBase:
    """Base class that adds created_by / modified_by audit columns to every model."""

    @declared_attr
    def created_by(cls):
        return Column(String(100), nullable=True)

    @declared_attr
    def modified_by(cls):
        return Column(String(100), nullable=True)


# Create database engine for SQL Server
engine = create_engine(
    settings.DATABASE_URL,
    poolclass=QueuePool,
    pool_size=5,
    max_overflow=10,
    echo=settings.DEBUG,
    connect_args={
        "timeout": 30,
        "autocommit": False
    },
    future=True
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, expire_on_commit=False)

# Base class for models — all models inherit created_by & modified_by via AuditBase
Base = declarative_base(cls=AuditBase)


# ── Auto-populate audit fields on every INSERT / UPDATE ──────────
@event.listens_for(SessionLocal, "before_flush")
def _set_audit_fields(session, flush_context, instances):
    """Automatically set created_by / modified_by from the request's user context."""
    user_name = current_user_name.get('')
    if not user_name:
        return

    for obj in session.new:
        if hasattr(obj, 'created_by') and not getattr(obj, 'created_by', None):
            obj.created_by = user_name
        if hasattr(obj, 'modified_by'):
            obj.modified_by = user_name

    for obj in session.dirty:
        if hasattr(obj, 'modified_by'):
            obj.modified_by = user_name


def get_db():
    """
    Dependency to get database session.
    Usage: db: Session = Depends(get_db)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()