from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database import engine, Base
from routers import auth, subjects, students, class_names, sections, class_sections, grades, academic_years, exam_types, examination_schedules, marks_entry, devices, attendance, sms, results, dashboard, chat, role_access, fees, payment_gateway, whatsapp, school_settings, helpdesk, departments, staff, staff_attendance, staff_salary, push_receiver, academic_calendar, reports, scholastic, notifications, easytimepro, mobile_auth, homework, parent, mobile_stats, announcements
from config import settings
import logging

logger = logging.getLogger(__name__)

# Create database tables on startup (with error handling)
try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"Warning: Could not create tables at startup: {e}")
    print("Tables may already exist or database may not be accessible yet.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager."""
    # Startup
    print(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    from services.device_listener import device_listener_manager
    await device_listener_manager.resume_active_devices()

    # EasyTimePro: sync devices and start transaction poller
    try:
        from services.easytimepro import sync_devices_from_server, transaction_poller
        sync_devices_from_server()
        await transaction_poller.start()
        print("EasyTimePro: device sync complete, transaction poller started")
    except Exception as e:
        print(f"EasyTimePro: startup failed (will retry on API call): {e}")

    yield
    # Shutdown
    print(f"Shutting down {settings.APP_NAME}")
    try:
        from services.easytimepro import transaction_poller as tp
        await tp.stop()
    except Exception:
        pass
    await device_listener_manager.stop_all()

# Initialize FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="School Management ERP Web API with role-based access control",
    lifespan=lifespan,
    redirect_slashes=False
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Change in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(subjects.router)
app.include_router(students.router)
app.include_router(class_names.router)
app.include_router(sections.router)
app.include_router(class_sections.router)
app.include_router(grades.router)
app.include_router(academic_years.router)
app.include_router(exam_types.router)
app.include_router(examination_schedules.router)
app.include_router(marks_entry.router)
app.include_router(easytimepro.router)
app.include_router(devices.router)
app.include_router(attendance.router)
app.include_router(sms.router)
app.include_router(results.router)
app.include_router(dashboard.router)
app.include_router(chat.router)
app.include_router(role_access.router)
app.include_router(fees.router)
app.include_router(payment_gateway.router)
app.include_router(whatsapp.router)
app.include_router(school_settings.router)
app.include_router(helpdesk.router)
app.include_router(departments.router)
app.include_router(staff.router)
app.include_router(staff_attendance.router)
app.include_router(staff_salary.router)
app.include_router(push_receiver.router)
app.include_router(academic_calendar.router)
app.include_router(reports.router)
app.include_router(scholastic.router)
app.include_router(notifications.router)
app.include_router(mobile_auth.router)
app.include_router(homework.router)
app.include_router(parent.router)
app.include_router(mobile_stats.router)
app.include_router(announcements.router)

@app.get("/", tags=["Health"])
async def root():
    """API health check endpoint."""
    return {
        "message": "School Management ERP API is running",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION
    }

@app.get("/api/etp-test", tags=["Debug"])
async def etp_test():
    """Debug: test if new routes register."""
    route_paths = [r.path for r in app.routes if hasattr(r, 'path') and 'easytimepro' in r.path]
    return {"etp_routes_in_app": route_paths, "total_routes": len(app.routes)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    )
