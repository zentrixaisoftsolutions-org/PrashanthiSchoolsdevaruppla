from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from database import get_db
from models import SMSConfig, SMSLog, SMSTemplate, User
from auth import get_current_user, require_role
from typing import List, Optional
from datetime import datetime
import httpx

router = APIRouter(prefix="/api/whatsapp", tags=["WhatsApp Management"])

# ==================== HELPERS ====================

def mask_api_key(api_key: str) -> str:
    if len(api_key) <= 4:
        return "****"
    return "*" * (len(api_key) - 4) + api_key[-4:]


def build_config_response(config: SMSConfig) -> dict:
    return {
        "id": config.id,
        "provider_name": config.provider_name,
        "api_key_masked": mask_api_key(config.api_key),
        "api_secret_masked": mask_api_key(config.api_secret) if config.api_secret else None,
        "sender_id": config.sender_id,
        "base_url": config.base_url,
        "is_active": config.is_active,
        "is_default": config.is_default,
        "created_at": config.created_at,
        "updated_at": config.updated_at,
    }


def _whatsapp_filter(query):
    """Filter configs to only WhatsApp providers."""
    return query.filter(SMSConfig.provider_name.ilike("%whatsapp%"))


# ==================== CONFIG ENDPOINTS ====================

@router.post("/config", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_whatsapp_config(
    provider_name: str = "WhatsApp Business API",
    api_key: str = "",
    api_secret: Optional[str] = None,
    sender_id: Optional[str] = None,
    base_url: Optional[str] = None,
    is_default: bool = False,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db),
):
    """Create a new WhatsApp configuration."""
    # Ensure provider_name contains 'whatsapp'
    if "whatsapp" not in provider_name.lower():
        provider_name = f"WhatsApp - {provider_name}"

    if is_default:
        existing = _whatsapp_filter(db.query(SMSConfig)).filter(SMSConfig.is_default == True).all()
        for cfg in existing:
            cfg.is_default = False

    config = SMSConfig(
        provider_name=provider_name,
        api_key=api_key,
        api_secret=api_secret,
        sender_id=sender_id,
        base_url=base_url,
        is_default=is_default,
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return build_config_response(config)


@router.get("/config", response_model=List[dict])
async def list_whatsapp_configs(
    is_active: Optional[bool] = None,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db),
):
    """List all WhatsApp configurations."""
    query = _whatsapp_filter(db.query(SMSConfig))
    if is_active is not None:
        query = query.filter(SMSConfig.is_active == is_active)
    configs = query.order_by(SMSConfig.created_at.desc()).all()
    return [build_config_response(c) for c in configs]


@router.get("/config/{config_id}", response_model=dict)
async def get_whatsapp_config(
    config_id: int,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db),
):
    config = db.query(SMSConfig).filter(SMSConfig.id == config_id).first()
    if not config or "whatsapp" not in config.provider_name.lower():
        raise HTTPException(status_code=404, detail="WhatsApp configuration not found")
    return build_config_response(config)


@router.put("/config/{config_id}", response_model=dict)
async def update_whatsapp_config(
    config_id: int,
    provider_name: Optional[str] = None,
    api_key: Optional[str] = None,
    api_secret: Optional[str] = None,
    sender_id: Optional[str] = None,
    base_url: Optional[str] = None,
    is_active: Optional[bool] = None,
    is_default: Optional[bool] = None,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db),
):
    """Update a WhatsApp configuration."""
    config = db.query(SMSConfig).filter(SMSConfig.id == config_id).first()
    if not config or "whatsapp" not in config.provider_name.lower():
        raise HTTPException(status_code=404, detail="WhatsApp configuration not found")

    if provider_name is not None:
        if "whatsapp" not in provider_name.lower():
            provider_name = f"WhatsApp - {provider_name}"
        config.provider_name = provider_name
    if api_key:
        config.api_key = api_key
    if api_secret is not None:
        config.api_secret = api_secret
    if sender_id is not None:
        config.sender_id = sender_id
    if base_url is not None:
        config.base_url = base_url
    if is_active is not None:
        config.is_active = is_active
    if is_default is not None:
        if is_default:
            existing = _whatsapp_filter(db.query(SMSConfig)).filter(
                SMSConfig.is_default == True, SMSConfig.id != config_id
            ).all()
            for cfg in existing:
                cfg.is_default = False
        config.is_default = is_default

    config.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(config)
    return build_config_response(config)


@router.delete("/config/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_whatsapp_config(
    config_id: int,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db),
):
    config = db.query(SMSConfig).filter(SMSConfig.id == config_id).first()
    if not config or "whatsapp" not in config.provider_name.lower():
        raise HTTPException(status_code=404, detail="WhatsApp configuration not found")
    db.delete(config)
    db.commit()


# ==================== TEMPLATE ENDPOINTS ====================

@router.get("/templates", response_model=List[dict])
async def list_whatsapp_templates(
    template_type: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db),
):
    """List WhatsApp message templates (template_type starting with 'whatsapp_')."""
    query = db.query(SMSTemplate).filter(SMSTemplate.template_type.ilike("whatsapp_%"))
    if template_type:
        query = query.filter(SMSTemplate.template_type == template_type)
    if is_active is not None:
        query = query.filter(SMSTemplate.is_active == is_active)
    templates = query.order_by(SMSTemplate.created_at.desc()).all()
    return [
        {
            "id": t.id,
            "name": t.name,
            "template_type": t.template_type,
            "message_template": t.message_template,
            "is_active": t.is_active,
            "is_default": t.is_default,
            "created_at": t.created_at,
            "updated_at": t.updated_at,
        }
        for t in templates
    ]


@router.post("/templates", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_whatsapp_template(
    name: str = "",
    template_type: str = "whatsapp_general",
    message_template: str = "",
    is_default: bool = False,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db),
):
    """Create a WhatsApp template."""
    if not template_type.startswith("whatsapp_"):
        template_type = f"whatsapp_{template_type}"

    if is_default:
        existing = db.query(SMSTemplate).filter(
            SMSTemplate.template_type == template_type,
            SMSTemplate.is_default == True,
        ).all()
        for t in existing:
            t.is_default = False

    template = SMSTemplate(
        name=name,
        template_type=template_type,
        message_template=message_template,
        is_default=is_default,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return {
        "id": template.id,
        "name": template.name,
        "template_type": template.template_type,
        "message_template": template.message_template,
        "is_active": template.is_active,
        "is_default": template.is_default,
        "created_at": template.created_at,
        "updated_at": template.updated_at,
    }


@router.put("/templates/{template_id}", response_model=dict)
async def update_whatsapp_template(
    template_id: int,
    name: Optional[str] = None,
    template_type: Optional[str] = None,
    message_template: Optional[str] = None,
    is_active: Optional[bool] = None,
    is_default: Optional[bool] = None,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db),
):
    template = db.query(SMSTemplate).filter(SMSTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if name is not None:
        template.name = name
    if template_type is not None:
        if not template_type.startswith("whatsapp_"):
            template_type = f"whatsapp_{template_type}"
        template.template_type = template_type
    if message_template is not None:
        template.message_template = message_template
    if is_active is not None:
        template.is_active = is_active
    if is_default is not None:
        if is_default:
            existing = db.query(SMSTemplate).filter(
                SMSTemplate.template_type == template.template_type,
                SMSTemplate.is_default == True,
                SMSTemplate.id != template_id,
            ).all()
            for t in existing:
                t.is_default = False
        template.is_default = is_default

    template.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(template)
    return {
        "id": template.id,
        "name": template.name,
        "template_type": template.template_type,
        "message_template": template.message_template,
        "is_active": template.is_active,
        "is_default": template.is_default,
        "created_at": template.created_at,
        "updated_at": template.updated_at,
    }


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_whatsapp_template(
    template_id: int,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db),
):
    template = db.query(SMSTemplate).filter(SMSTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(template)
    db.commit()


# ==================== SENDING / TEST ====================

async def send_whatsapp_message(config: SMSConfig, phone: str, message: str) -> tuple:
    """Send a WhatsApp message via the configured provider."""
    try:
        phone = phone.strip()
        if not phone.startswith("+"):
            if phone.startswith("0"):
                phone = phone[1:]
            if len(phone) == 10:
                phone = "+91" + phone

        if not config.base_url:
            return False, "No WhatsApp API base URL configured"

        async with httpx.AsyncClient() as client:
            payload = {
                "apikey": config.api_key,
                "phone": phone,
                "message": message,
            }
            headers = {"Authorization": f"Bearer {config.api_key}"}
            response = await client.post(
                config.base_url, json=payload, headers=headers, timeout=30.0
            )
            if response.status_code in [200, 201]:
                return True, response.text
            return False, response.text
    except Exception as e:
        return False, str(e)


@router.post("/send", response_model=dict)
async def send_whatsapp(
    phone_number: str = "",
    message: str = "",
    student_id: Optional[int] = None,
    message_type: Optional[str] = None,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db),
):
    """Send a single WhatsApp message."""
    config = _whatsapp_filter(db.query(SMSConfig)).filter(
        SMSConfig.is_active == True,
    ).first()

    if not config:
        raise HTTPException(status_code=400, detail="No active WhatsApp configuration found")

    log = SMSLog(
        config_id=config.id,
        student_id=student_id,
        phone_number=phone_number,
        message=message,
        message_type=message_type or "whatsapp_general",
        status="pending",
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    success, response = await send_whatsapp_message(config, phone_number, message)

    if success:
        log.status = "sent"
        log.sent_at = datetime.utcnow()
        log.provider_response = response
        db.commit()
        return {"success": True, "message": "WhatsApp message sent successfully", "log_id": log.id}
    else:
        log.status = "failed"
        log.provider_response = response
        db.commit()
        return {"success": False, "message": f"Failed: {response}", "log_id": log.id}


@router.post("/test", response_model=dict)
async def test_whatsapp_config(
    config_id: int,
    phone_number: str = "",
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db),
):
    """Test a WhatsApp configuration by sending a test message."""
    config = db.query(SMSConfig).filter(SMSConfig.id == config_id).first()
    if not config or "whatsapp" not in config.provider_name.lower():
        raise HTTPException(status_code=404, detail="WhatsApp configuration not found")

    msg = f"This is a test WhatsApp message from School Management System. Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    success, response = await send_whatsapp_message(config, phone_number, msg)

    log = SMSLog(
        config_id=config.id,
        phone_number=phone_number,
        message=msg,
        message_type="whatsapp_test",
        status="sent" if success else "failed",
        sent_at=datetime.utcnow() if success else None,
        provider_response=response,
    )
    db.add(log)
    db.commit()

    if success:
        return {"success": True, "message": "Test WhatsApp message sent successfully", "log_id": log.id}
    else:
        return {"success": False, "message": f"Failed: {response}", "log_id": log.id}


# ==================== LOGS / STATS ====================

@router.get("/logs", response_model=List[dict])
async def list_whatsapp_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status_filter: Optional[str] = None,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db),
):
    """List WhatsApp message logs."""
    query = db.query(SMSLog).filter(SMSLog.message_type.ilike("whatsapp_%"))

    if status_filter:
        query = query.filter(SMSLog.status == status_filter)

    logs = query.order_by(SMSLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    results = []
    for log in logs:
        student_name = None
        if log.student:
            student_name = f"{log.student.first_name} {log.student.surname or ''}"
        results.append({
            "id": log.id,
            "config_id": log.config_id,
            "student_id": log.student_id,
            "student_name": student_name,
            "phone_number": log.phone_number,
            "message": log.message,
            "message_type": log.message_type,
            "status": log.status,
            "sent_at": log.sent_at,
            "created_at": log.created_at,
        })
    return results


@router.get("/logs/stats", response_model=dict)
async def get_whatsapp_stats(
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db),
):
    """Get WhatsApp sending statistics."""
    from sqlalchemy import func

    base = db.query(SMSLog).filter(SMSLog.message_type.ilike("whatsapp_%"))
    total = base.count()
    sent = base.filter(SMSLog.status == "sent").count()
    failed = base.filter(SMSLog.status == "failed").count()
    pending = base.filter(SMSLog.status == "pending").count()

    return {"total": total, "sent": sent, "failed": failed, "pending": pending}


@router.get("/providers", response_model=List[dict])
async def get_whatsapp_providers(
    current_user: User = Depends(require_role(["super_admin", "admin"])),
):
    """Get list of supported WhatsApp providers."""
    return [
        {
            "name": "WhatsApp Business API",
            "description": "Official WhatsApp Business API (Meta Cloud API)",
            "fields": {
                "api_key": "Permanent Access Token from Meta",
                "sender_id": "Phone Number ID",
                "base_url": "https://graph.facebook.com/v18.0/{phone_number_id}/messages",
            },
        },
        {
            "name": "WhatsApp Twilio",
            "description": "WhatsApp via Twilio",
            "fields": {
                "api_key": "Twilio Account SID",
                "api_secret": "Twilio Auth Token",
                "sender_id": "whatsapp:+14155238886",
                "base_url": "https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json",
            },
        },
        {
            "name": "WhatsApp WATI",
            "description": "WATI - WhatsApp Team Inbox & API",
            "fields": {
                "api_key": "WATI API Token",
                "base_url": "https://live-server-XXXXX.wati.io/api/v1/sendSessionMessage",
            },
        },
        {
            "name": "WhatsApp Custom",
            "description": "Custom WhatsApp HTTP gateway",
            "fields": {
                "api_key": "API Key / Auth Token",
                "base_url": "Full endpoint URL",
            },
        },
    ]
