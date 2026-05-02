"""Payment Gateway Configuration Router."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from database import get_db
from models import PaymentGatewayConfig, User
from schemas import (
    PaymentGatewayConfigCreate, PaymentGatewayConfigUpdate, PaymentGatewayConfigResponse
)
from auth import get_current_user

router = APIRouter(prefix="/api/payment-gateway", tags=["Payment Gateway"])


@router.get("/configs", response_model=List[PaymentGatewayConfigResponse], summary="List Payment Gateway Configs")
async def list_configs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all payment gateway configurations."""
    configs = db.query(PaymentGatewayConfig).order_by(PaymentGatewayConfig.id).all()
    return [_config_to_response(c) for c in configs]


@router.post("/configs", response_model=PaymentGatewayConfigResponse, summary="Create Payment Gateway Config")
async def create_config(
    data: PaymentGatewayConfigCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new payment gateway configuration."""
    config = PaymentGatewayConfig(
        provider=data.provider,
        key_id=data.key_id,
        key_secret=data.key_secret,
        webhook_secret=data.webhook_secret,
        is_test_mode=data.is_test_mode,
        is_active=True,
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return _config_to_response(config)


@router.put("/configs/{config_id}", response_model=PaymentGatewayConfigResponse, summary="Update Payment Gateway Config")
async def update_config(
    config_id: int,
    data: PaymentGatewayConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update an existing payment gateway configuration."""
    config = db.query(PaymentGatewayConfig).filter(PaymentGatewayConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")

    update_data = data.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(config, key, value)
    config.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(config)
    return _config_to_response(config)


@router.delete("/configs/{config_id}", summary="Delete Payment Gateway Config")
async def delete_config(
    config_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Deactivate a payment gateway configuration."""
    config = db.query(PaymentGatewayConfig).filter(PaymentGatewayConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    config.is_active = False
    config.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "Payment gateway config deactivated"}


@router.post("/configs/{config_id}/test", summary="Test Payment Gateway Connection")
async def test_config(
    config_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Test a Razorpay configuration by fetching account details."""
    config = db.query(PaymentGatewayConfig).filter(PaymentGatewayConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")

    if config.provider == "razorpay":
        try:
            import razorpay
            client = razorpay.Client(auth=(config.key_id, config.key_secret))
            # Try to create a tiny order to test credentials
            test_order = client.order.create({
                "amount": 100,  # 1 rupee in paise
                "currency": "INR",
                "receipt": "test_receipt",
            })
            return {"success": True, "message": "Razorpay connection successful", "order_id": test_order.get("id")}
        except ImportError:
            return {"success": False, "message": "Razorpay SDK not installed. Run: pip install razorpay"}
        except Exception as e:
            return {"success": False, "message": f"Connection failed: {str(e)}"}
    else:
        return {"success": False, "message": f"Testing not supported for provider: {config.provider}"}


def _config_to_response(config: PaymentGatewayConfig) -> PaymentGatewayConfigResponse:
    """Convert config model to response, masking secrets."""
    key_id = config.key_id or ""
    masked = f"{'*' * max(0, len(key_id) - 4)}{key_id[-4:]}" if len(key_id) > 4 else key_id
    return PaymentGatewayConfigResponse(
        id=config.id,
        provider=config.provider,
        key_id_masked=masked,
        is_test_mode=config.is_test_mode,
        is_active=config.is_active,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )
