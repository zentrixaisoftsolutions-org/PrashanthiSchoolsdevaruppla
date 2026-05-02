from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from database import get_db
from models import SMSConfig, SMSLog, SMSTemplate, Student, User
from schemas import (
    SMSConfigCreate, SMSConfigUpdate, SMSConfigResponse,
    SMSTemplateCreate, SMSTemplateUpdate, SMSTemplateResponse,
    SMSLogResponse, SendSMSRequest, SendBulkSMSRequest, SMSSendResponse,
    SMSTestRequest
)
from auth import get_current_user, require_role
from typing import List, Optional
from datetime import datetime
import httpx

router = APIRouter(prefix="/api/sms", tags=["SMS Management"])


def mask_api_key(api_key: str) -> str:
    """Mask API key for display, showing only last 4 characters."""
    if len(api_key) <= 4:
        return "****"
    return "*" * (len(api_key) - 4) + api_key[-4:]


def build_config_response(config: SMSConfig) -> dict:
    """Build SMS config response with masked API key and secret."""
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
        "updated_at": config.updated_at
    }


# ==================== SMS CONFIGURATION ENDPOINTS ====================

@router.post("/config", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_sms_config(
    config_data: SMSConfigCreate,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db)
):
    """Create a new SMS configuration."""
    # If this is set as default, unset other defaults
    if config_data.is_default:
        db.query(SMSConfig).filter(SMSConfig.is_default == True).update({"is_default": False})
    
    config = SMSConfig(**config_data.model_dump())
    db.add(config)
    db.commit()
    db.refresh(config)
    return build_config_response(config)


@router.get("/config", response_model=List[dict])
async def list_sms_configs(
    is_active: Optional[bool] = None,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db)
):
    """List all SMS configurations (excluding WhatsApp)."""
    query = db.query(SMSConfig).filter(~SMSConfig.provider_name.ilike("%whatsapp%"))
    if is_active is not None:
        query = query.filter(SMSConfig.is_active == is_active)
    configs = query.order_by(SMSConfig.provider_name).all()
    return [build_config_response(c) for c in configs]


@router.get("/config/{config_id}", response_model=dict)
async def get_sms_config(
    config_id: int,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db)
):
    """Get a specific SMS configuration."""
    config = db.query(SMSConfig).filter(SMSConfig.id == config_id).first()
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SMS configuration not found"
        )
    return build_config_response(config)


@router.put("/config/{config_id}", response_model=dict)
async def update_sms_config(
    config_id: int,
    config_data: SMSConfigUpdate,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db)
):
    """Update an SMS configuration."""
    config = db.query(SMSConfig).filter(SMSConfig.id == config_id).first()
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SMS configuration not found"
        )
    
    update_dict = config_data.model_dump(exclude_unset=True)
    
    # If setting as default, unset other defaults
    if update_dict.get("is_default"):
        db.query(SMSConfig).filter(
            SMSConfig.id != config_id,
            SMSConfig.is_default == True
        ).update({"is_default": False})
    
    for field, value in update_dict.items():
        setattr(config, field, value)
    
    config.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(config)
    return build_config_response(config)


@router.delete("/config/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sms_config(
    config_id: int,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db)
):
    """Delete an SMS configuration."""
    config = db.query(SMSConfig).filter(SMSConfig.id == config_id).first()
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SMS configuration not found"
        )
    
    db.delete(config)
    db.commit()


# ==================== SMS TEMPLATE ENDPOINTS ====================

@router.post("/template", response_model=SMSTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_sms_template(
    template_data: SMSTemplateCreate,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db)
):
    """Create a new SMS template."""
    # If this is set as default for this type, unset other defaults
    if template_data.is_default:
        db.query(SMSTemplate).filter(
            SMSTemplate.template_type == template_data.template_type,
            SMSTemplate.is_default == True
        ).update({"is_default": False})
    
    template = SMSTemplate(**template_data.model_dump())
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.get("/template", response_model=List[SMSTemplateResponse])
async def list_sms_templates(
    template_type: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db)
):
    """List all SMS templates (excluding WhatsApp)."""
    query = db.query(SMSTemplate).filter(~SMSTemplate.template_type.ilike("whatsapp_%"))
    if template_type:
        query = query.filter(SMSTemplate.template_type == template_type)
    if is_active is not None:
        query = query.filter(SMSTemplate.is_active == is_active)
    return query.order_by(SMSTemplate.name).all()


@router.get("/template/{template_id}", response_model=SMSTemplateResponse)
async def get_sms_template(
    template_id: int,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db)
):
    """Get a specific SMS template."""
    template = db.query(SMSTemplate).filter(SMSTemplate.id == template_id).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SMS template not found"
        )
    return template


@router.put("/template/{template_id}", response_model=SMSTemplateResponse)
async def update_sms_template(
    template_id: int,
    template_data: SMSTemplateUpdate,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db)
):
    """Update an SMS template."""
    template = db.query(SMSTemplate).filter(SMSTemplate.id == template_id).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SMS template not found"
        )
    
    update_dict = template_data.model_dump(exclude_unset=True)
    
    # If setting as default, unset other defaults of same type
    if update_dict.get("is_default"):
        template_type = update_dict.get("template_type", template.template_type)
        db.query(SMSTemplate).filter(
            SMSTemplate.id != template_id,
            SMSTemplate.template_type == template_type,
            SMSTemplate.is_default == True
        ).update({"is_default": False})
    
    for field, value in update_dict.items():
        setattr(template, field, value)
    
    template.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(template)
    return template


@router.delete("/template/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sms_template(
    template_id: int,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db)
):
    """Delete an SMS template."""
    template = db.query(SMSTemplate).filter(SMSTemplate.id == template_id).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SMS template not found"
        )
    
    db.delete(template)
    db.commit()


# ==================== SMS SENDING ENDPOINTS ====================

async def send_sms_via_provider(config: SMSConfig, phone: str, message: str) -> tuple:
    """
    Send SMS via configured provider.
    Returns (success: bool, response: str)
    """
    try:
        # Normalize phone number
        phone = phone.strip()
        if not phone.startswith("+"):
            # Assume Indian number if no country code
            if phone.startswith("0"):
                phone = phone[1:]
            if len(phone) == 10:
                phone = "+91" + phone
        
        # Provider-specific implementations
        if config.provider_name.lower() == "fast2sms":
            return await send_via_fast2sms(config, phone, message)
        elif config.provider_name.lower() == "msg91":
            return await send_via_msg91(config, phone, message)
        elif config.provider_name.lower() == "twilio":
            return await send_via_twilio(config, phone, message)
        else:
            # Generic HTTP API
            return await send_via_generic_api(config, phone, message)
    except Exception as e:
        return False, str(e)


async def send_via_fast2sms(config: SMSConfig, phone: str, message: str) -> tuple:
    """Send SMS via Fast2SMS API."""
    try:
        async with httpx.AsyncClient() as client:
            headers = {
                "authorization": config.api_key,
                "Content-Type": "application/json"
            }
            payload = {
                "route": "q",
                "message": message,
                "language": "english",
                "flash": 0,
                "numbers": phone.replace("+91", "")
            }
            response = await client.post(
                "https://www.fast2sms.com/dev/bulkV2",
                headers=headers,
                json=payload,
                timeout=30.0
            )
            result = response.json()
            if result.get("return"):
                return True, response.text
            return False, response.text
    except Exception as e:
        return False, str(e)


async def send_via_msg91(config: SMSConfig, phone: str, message: str) -> tuple:
    """Send SMS via MSG91 API."""
    try:
        async with httpx.AsyncClient() as client:
            url = f"https://api.msg91.com/api/v5/flow/"
            headers = {
                "authkey": config.api_key,
                "content-type": "application/json"
            }
            payload = {
                "sender": config.sender_id,
                "route": "4",
                "country": "91",
                "sms": [{
                    "message": message,
                    "to": [phone.replace("+91", "")]
                }]
            }
            response = await client.post(url, headers=headers, json=payload, timeout=30.0)
            if response.status_code == 200:
                return True, response.text
            return False, response.text
    except Exception as e:
        return False, str(e)


async def send_via_twilio(config: SMSConfig, phone: str, message: str) -> tuple:
    """Send SMS via Twilio API."""
    try:
        async with httpx.AsyncClient() as client:
            url = f"https://api.twilio.com/2010-04-01/Accounts/{config.api_key}/Messages.json"
            payload = {
                "To": phone,
                "From": config.sender_id,
                "Body": message
            }
            auth = (config.api_key, config.api_secret)
            response = await client.post(url, data=payload, auth=auth, timeout=30.0)
            if response.status_code in [200, 201]:
                return True, response.text
            return False, response.text
    except Exception as e:
        return False, str(e)


async def send_via_generic_api(config: SMSConfig, phone: str, message: str) -> tuple:
    """Send SMS via generic HTTP API."""
    try:
        if not config.base_url:
            return False, "No base URL configured"
        
        async with httpx.AsyncClient() as client:
            params = {
                "apikey": config.api_key,
                "sender": config.sender_id,
                "numbers": phone,
                "message": message
            }
            response = await client.get(config.base_url, params=params, timeout=30.0)
            if response.status_code == 200:
                return True, response.text
            return False, response.text
    except Exception as e:
        return False, str(e)


@router.post("/send", response_model=SMSSendResponse)
async def send_sms(
    sms_data: SendSMSRequest,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db)
):
    """Send a single SMS message."""
    # Get default config
    config = db.query(SMSConfig).filter(
        SMSConfig.is_active == True,
        SMSConfig.is_default == True
    ).first()
    
    if not config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active SMS configuration found"
        )
    
    # Create SMS log
    sms_log = SMSLog(
        config_id=config.id,
        student_id=sms_data.student_id,
        phone_number=sms_data.phone_number,
        message=sms_data.message,
        message_type=sms_data.message_type,
        status="pending"
    )
    db.add(sms_log)
    db.commit()
    db.refresh(sms_log)
    
    # Send SMS
    success, response = await send_sms_via_provider(config, sms_data.phone_number, sms_data.message)
    
    if success:
        sms_log.status = "sent"
        sms_log.sent_at = datetime.utcnow()
        sms_log.provider_response = response
        db.commit()
        return SMSSendResponse(
            success=True,
            message="SMS sent successfully",
            sms_log_id=sms_log.id
        )
    else:
        sms_log.status = "failed"
        sms_log.provider_response = response
        db.commit()
        return SMSSendResponse(
            success=False,
            message=f"Failed to send SMS: {response}",
            sms_log_id=sms_log.id
        )


@router.post("/test", response_model=SMSSendResponse)
async def test_sms_config(
    test_data: SMSTestRequest,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db)
):
    """Test an SMS configuration by sending a test message."""
    config = db.query(SMSConfig).filter(SMSConfig.id == test_data.config_id).first()
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SMS configuration not found"
        )
    
    test_message = f"This is a test message from School Management System. Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    
    success, response = await send_sms_via_provider(config, test_data.phone_number, test_message)
    
    # Log the test
    sms_log = SMSLog(
        config_id=config.id,
        phone_number=test_data.phone_number,
        message=test_message,
        message_type="test",
        status="sent" if success else "failed",
        sent_at=datetime.utcnow() if success else None,
        provider_response=response
    )
    db.add(sms_log)
    db.commit()
    
    if success:
        return SMSSendResponse(
            success=True,
            message="Test SMS sent successfully",
            sms_log_id=sms_log.id
        )
    else:
        return SMSSendResponse(
            success=False,
            message=f"Failed to send test SMS: {response}",
            sms_log_id=sms_log.id
        )


# ==================== SMS LOG ENDPOINTS ====================

@router.get("/logs", response_model=List[dict])
async def list_sms_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status_filter: Optional[str] = None,
    message_type: Optional[str] = None,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db)
):
    """List SMS logs with pagination (excluding WhatsApp)."""
    query = db.query(SMSLog).options(
        joinedload(SMSLog.config),
        joinedload(SMSLog.student)
    ).filter(or_(SMSLog.message_type.is_(None), ~SMSLog.message_type.ilike("whatsapp_%")))
    
    if status_filter:
        query = query.filter(SMSLog.status == status_filter)
    if message_type:
        query = query.filter(SMSLog.message_type == message_type)
    
    total = query.count()
    logs = query.order_by(SMSLog.created_at.desc())\
                .offset((page - 1) * page_size)\
                .limit(page_size)\
                .all()
    
    results = []
    for log in logs:
        results.append({
            "id": log.id,
            "config_id": log.config_id,
            "provider_name": log.config.provider_name if log.config else None,
            "student_id": log.student_id,
            "student_name": f"{log.student.first_name} {log.student.surname or ''}" if log.student else None,
            "phone_number": log.phone_number,
            "message": log.message,
            "message_type": log.message_type,
            "status": log.status,
            "sent_at": log.sent_at,
            "created_at": log.created_at
        })
    
    return results


@router.get("/logs/stats", response_model=dict)
async def get_sms_stats(
    current_user: User = Depends(require_role(["super_admin", "admin"])),
    db: Session = Depends(get_db)
):
    """Get SMS sending statistics (excluding WhatsApp)."""
    from sqlalchemy import func
    
    base_filter = ~SMSLog.message_type.ilike("whatsapp_%")
    total = db.query(func.count(SMSLog.id)).filter(base_filter).scalar()
    sent = db.query(func.count(SMSLog.id)).filter(base_filter, SMSLog.status == "sent").scalar()
    failed = db.query(func.count(SMSLog.id)).filter(base_filter, SMSLog.status == "failed").scalar()
    pending = db.query(func.count(SMSLog.id)).filter(base_filter, SMSLog.status == "pending").scalar()
    
    # Stats by message type
    type_stats = db.query(
        SMSLog.message_type,
        func.count(SMSLog.id)
    ).filter(base_filter).group_by(SMSLog.message_type).all()
    
    return {
        "total": total,
        "sent": sent,
        "failed": failed,
        "pending": pending,
        "by_type": {t: c for t, c in type_stats if t}
    }


@router.get("/providers", response_model=List[dict])
async def get_supported_providers(
    current_user: User = Depends(require_role(["super_admin", "admin"]))
):
    """Get list of supported SMS providers with configuration hints."""
    return [
        {
            "name": "Fast2SMS",
            "description": "Popular SMS gateway for India",
            "fields": {
                "api_key": "Your Fast2SMS API Key",
                "sender_id": "Optional sender ID",
                "base_url": "https://www.fast2sms.com/dev/bulkV2"
            }
        },
        {
            "name": "MSG91",
            "description": "Enterprise SMS gateway for India",
            "fields": {
                "api_key": "Your MSG91 Auth Key",
                "sender_id": "6-character sender ID",
                "api_secret": "Not required for MSG91"
            }
        },
        {
            "name": "Twilio",
            "description": "Global SMS gateway",
            "fields": {
                "api_key": "Your Twilio Account SID",
                "api_secret": "Your Twilio Auth Token",
                "sender_id": "Your Twilio phone number (with country code)"
            }
        },
        {
            "name": "Custom",
            "description": "Generic HTTP API",
            "fields": {
                "api_key": "API Key/Auth parameter",
                "sender_id": "Sender ID if required",
                "base_url": "Full API endpoint URL"
            }
        }
    ]
