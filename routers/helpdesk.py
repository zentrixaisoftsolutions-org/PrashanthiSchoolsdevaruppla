from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from database import get_db
from auth import get_current_user
from models import User, HelpDeskTicket, AppNotification, NotificationRead
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from config import settings
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/helpdesk", tags=["Help Desk"])


# ==================== SCHEMAS ====================
class TicketCreate(BaseModel):
    title: str
    description: str
    category: str = "general"   # bug, feature, general, access
    priority: str = "medium"    # low, medium, high, critical

class TicketResponse(BaseModel):
    id: int
    ticket_number: str
    title: str
    description: str
    category: str
    priority: str
    status: str
    created_by: str
    created_at: datetime
    updated_at: datetime

class TicketUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None

class NotificationResponse(BaseModel):
    id: int
    title: str
    message: str
    notification_type: str
    reference_id: Optional[int] = None
    created_by_name: Optional[str] = None
    created_at: datetime
    is_read: bool


# ==================== HELPERS ====================
def _generate_ticket_number(db: Session) -> str:
    """Generate a unique ticket number like TKT-20260001."""
    year = datetime.utcnow().strftime("%Y")
    last = db.query(HelpDeskTicket).filter(
        HelpDeskTicket.ticket_number.like(f"TKT-{year}%")
    ).order_by(desc(HelpDeskTicket.id)).first()
    
    if last:
        last_num = int(last.ticket_number.split("-")[1][4:])  # e.g. TKT-20260003 → 3
        next_num = last_num + 1
    else:
        next_num = 1
    
    return f"TKT-{year}{next_num:04d}"


def _send_ticket_email(ticket: HelpDeskTicket, user: User):
    """Send email notification to the dev team about a new ticket."""
    if not settings.SMTP_USER or not settings.HELPDESK_RECIPIENT_EMAIL:
        logger.warning("SMTP or recipient email not configured – skipping email for ticket %s", ticket.ticket_number)
        return
    
    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = settings.SMTP_FROM_EMAIL or settings.SMTP_USER
        msg["To"] = settings.HELPDESK_RECIPIENT_EMAIL
        msg["Subject"] = f"[{ticket.priority.upper()}] New Help Desk Ticket: {ticket.ticket_number} – {ticket.title}"
        
        html = f"""
        <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
          <h2 style="color: #0891b2;">🎫 New Help Desk Ticket</h2>
          <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
            <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Ticket #</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">{ticket.ticket_number}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Title</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">{ticket.title}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Category</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">{ticket.category.replace('_', ' ').title()}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Priority</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">{ticket.priority.upper()}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Raised By</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">{user.full_name} ({user.email})</td></tr>
            <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Date</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">{ticket.created_at.strftime('%Y-%m-%d %H:%M')}</td></tr>
          </table>
          <div style="background: #f1f5f9; padding: 16px; border-radius: 8px; margin-top: 16px;">
            <h3 style="margin-top: 0;">Description</h3>
            <p style="white-space: pre-wrap;">{ticket.description}</p>
          </div>
        </body>
        </html>
        """
        msg.attach(MIMEText(html, "html"))
        
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
        
        logger.info("Help desk email sent for ticket %s", ticket.ticket_number)
    except Exception as e:
        logger.error("Failed to send help desk email for ticket %s: %s", ticket.ticket_number, e)


# ==================== TICKET ENDPOINTS ====================

@router.post("/tickets", response_model=dict)
async def create_ticket(
    data: TicketCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Raise a new help desk ticket. Creates an in-app notification for all users and emails the dev team."""
    ticket_number = _generate_ticket_number(db)
    
    ticket = HelpDeskTicket(
        ticket_number=ticket_number,
        user_id=current_user.id,
        title=data.title,
        description=data.description,
        category=data.category,
        priority=data.priority,
        status="open",
    )
    db.add(ticket)
    db.flush()  # get ticket.id
    
    # Create an in-app notification visible to all users
    notification = AppNotification(
        title=f"New Ticket: {ticket_number}",
        message=f"{current_user.full_name} raised a {data.priority} priority ticket: {data.title}",
        notification_type="helpdesk",
        reference_id=ticket.id,
        created_by_user_id=current_user.id,
    )
    db.add(notification)
    db.commit()
    db.refresh(ticket)
    
    # Send email in background
    background_tasks.add_task(_send_ticket_email, ticket, current_user)
    
    return {
        "message": f"Ticket {ticket_number} created successfully",
        "ticket_number": ticket_number,
        "ticket_id": ticket.id
    }


@router.get("/tickets", response_model=List[TicketResponse])
async def list_tickets(
    status_filter: Optional[str] = Query(None, description="Filter by status"),
    my_tickets: bool = Query(False, description="Show only my tickets"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List help desk tickets."""
    query = db.query(HelpDeskTicket)
    
    if my_tickets:
        query = query.filter(HelpDeskTicket.user_id == current_user.id)
    
    if status_filter:
        query = query.filter(HelpDeskTicket.status == status_filter)
    
    query = query.order_by(desc(HelpDeskTicket.created_at))
    tickets = query.all()
    
    return [
        TicketResponse(
            id=t.id,
            ticket_number=t.ticket_number,
            title=t.title,
            description=t.description,
            category=t.category,
            priority=t.priority,
            status=t.status,
            created_by=t.user.full_name if t.user else "Unknown",
            created_at=t.created_at,
            updated_at=t.updated_at,
        )
        for t in tickets
    ]


@router.put("/tickets/{ticket_id}", response_model=dict)
async def update_ticket(
    ticket_id: int,
    data: TicketUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update ticket status or priority (admin/super_admin only)."""
    if current_user.role.name not in ("super_admin", "admin"):
        raise HTTPException(status_code=403, detail="Only admins can update tickets")
    
    ticket = db.query(HelpDeskTicket).filter(HelpDeskTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    if data.status:
        ticket.status = data.status
    if data.priority:
        ticket.priority = data.priority
    
    db.commit()
    return {"message": f"Ticket {ticket.ticket_number} updated"}


# ==================== NOTIFICATION ENDPOINTS ====================

@router.get("/notifications", response_model=List[NotificationResponse])
async def get_notifications(
    unread_only: bool = Query(False, description="Return only unread notifications"),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get in-app notifications for the current user. All notifications are visible to all users."""
    query = db.query(AppNotification)
    
    if unread_only:
        # Subquery for notifications this user has already read
        read_ids = db.query(NotificationRead.notification_id).filter(
            NotificationRead.user_id == current_user.id
        ).subquery()
        query = query.filter(~AppNotification.id.in_(db.query(read_ids.c.notification_id)))
    
    query = query.order_by(desc(AppNotification.created_at)).limit(limit)
    notifications = query.all()
    
    # Get IDs user has read
    read_set = set(
        r[0] for r in db.query(NotificationRead.notification_id).filter(
            NotificationRead.user_id == current_user.id,
            NotificationRead.notification_id.in_([n.id for n in notifications])
        ).all()
    ) if notifications else set()
    
    return [
        NotificationResponse(
            id=n.id,
            title=n.title,
            message=n.message,
            notification_type=n.notification_type,
            reference_id=n.reference_id,
            created_by_name=n.creator.full_name if n.creator else None,
            created_at=n.created_at,
            is_read=n.id in read_set,
        )
        for n in notifications
    ]


@router.get("/notifications/unread-count", response_model=dict)
async def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get count of unread notifications for the current user."""
    total = db.query(func.count(AppNotification.id)).scalar() or 0
    read_count = db.query(func.count(NotificationRead.id)).filter(
        NotificationRead.user_id == current_user.id
    ).scalar() or 0
    
    unread = max(0, total - read_count)
    return {"unread_count": unread}


@router.post("/notifications/{notification_id}/read", response_model=dict)
async def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark a notification as read for the current user."""
    existing = db.query(NotificationRead).filter(
        NotificationRead.notification_id == notification_id,
        NotificationRead.user_id == current_user.id
    ).first()
    
    if not existing:
        read = NotificationRead(
            notification_id=notification_id,
            user_id=current_user.id,
        )
        db.add(read)
        db.commit()
    
    return {"message": "Notification marked as read"}


@router.post("/notifications/read-all", response_model=dict)
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark all notifications as read for the current user."""
    all_ids = [n[0] for n in db.query(AppNotification.id).all()]
    already_read = set(
        r[0] for r in db.query(NotificationRead.notification_id).filter(
            NotificationRead.user_id == current_user.id
        ).all()
    )
    
    for nid in all_ids:
        if nid not in already_read:
            db.add(NotificationRead(notification_id=nid, user_id=current_user.id))
    
    db.commit()
    return {"message": "All notifications marked as read"}
