from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import AttendanceDevice, User
from auth import get_current_user, require_role
from services.easytimepro import get_client, sync_devices_from_server, transaction_poller
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/devices/easytimepro", tags=["EasyTimePro"])


@router.post("/sync", response_model=dict)
async def sync_easytimepro_devices(
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db)
):
    """
    Sync devices from the EasyTimePro server.
    Fetches all terminals and upserts them into the local database.
    """
    try:
        terminals = sync_devices_from_server()
        devices = db.query(AttendanceDevice).filter(
            AttendanceDevice.connection_type == "EasyTimePro"
        ).all()
        return {
            "synced": len(terminals),
            "devices": [
                {
                    "id": d.id,
                    "device_name": d.device_name,
                    "serial_number": d.serial_number,
                    "status": d.status,
                }
                for d in devices
            ],
            "message": f"Successfully synced {len(terminals)} device(s) from EasyTimePro server",
        }
    except Exception as exc:
        logger.exception("[EasyTimePro] Sync failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to sync with EasyTimePro server: {str(exc)}",
        )


@router.get("/status", response_model=dict)
async def easytimepro_server_status(
    current_user: User = Depends(get_current_user),
):
    """Check if the EasyTimePro server is online and reachable."""
    try:
        client = get_client()
        online = client.is_server_online()
        return {
            "server_online": online,
            "server_url": client.base_url,
            "poller_running": transaction_poller._running,
        }
    except Exception as exc:
        return {
            "server_online": False,
            "server_url": get_client().base_url,
            "poller_running": transaction_poller._running,
            "error": str(exc),
        }


@router.get("/terminals", response_model=dict)
async def get_easytimepro_terminals(
    current_user: User = Depends(get_current_user),
):
    """Fetch raw terminal data from the EasyTimePro server."""
    try:
        client = get_client()
        terminals = client.get_terminals()
        return {"count": len(terminals), "terminals": terminals}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch terminals: {str(exc)}",
        )


@router.get("/transactions", response_model=dict)
async def get_easytimepro_transactions(
    page: int = 1,
    page_size: int = 50,
    current_user: User = Depends(get_current_user),
):
    """Fetch recent transactions from the EasyTimePro server."""
    try:
        client = get_client()
        data = client.get_transactions(page=page, page_size=page_size)
        return data
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch transactions: {str(exc)}",
        )


@router.post("/poller/start", response_model=dict)
async def start_transaction_poller(
    current_user: User = Depends(require_role(["super_admin", "admin"])),
):
    """Start the background transaction poller."""
    await transaction_poller.start()
    return {"status": "started", "message": "Transaction poller is now running"}


@router.post("/poller/stop", response_model=dict)
async def stop_transaction_poller(
    current_user: User = Depends(require_role(["super_admin", "admin"])),
):
    """Stop the background transaction poller."""
    await transaction_poller.stop()
    return {"status": "stopped", "message": "Transaction poller has been stopped"}
