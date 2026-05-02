import api from './api';

// ==================== INTERFACES ====================
export interface TicketCreate {
  title: string;
  description: string;
  category: string;   // bug, feature, general, access
  priority: string;    // low, medium, high, critical
}

export interface Ticket {
  id: number;
  ticket_number: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AppNotification {
  id: number;
  title: string;
  message: string;
  notification_type: string;
  reference_id: number | null;
  created_by_name: string | null;
  created_at: string;
  is_read: boolean;
}

// ==================== SERVICE ====================
const helpdeskService = {
  // Tickets
  createTicket: async (data: TicketCreate): Promise<{ message: string; ticket_number: string; ticket_id: number }> => {
    const response = await api.post('/helpdesk/tickets', data);
    return response.data;
  },

  listTickets: async (myTickets: boolean = false, statusFilter?: string): Promise<Ticket[]> => {
    const params: any = { my_tickets: myTickets };
    if (statusFilter) params.status_filter = statusFilter;
    const response = await api.get<Ticket[]>('/helpdesk/tickets', { params });
    return response.data;
  },

  updateTicket: async (ticketId: number, data: { status?: string; priority?: string }): Promise<void> => {
    await api.put(`/helpdesk/tickets/${ticketId}`, data);
  },

  // Notifications
  getNotifications: async (unreadOnly: boolean = false, limit: number = 20): Promise<AppNotification[]> => {
    const response = await api.get<AppNotification[]>('/helpdesk/notifications', {
      params: { unread_only: unreadOnly, limit },
    });
    return response.data;
  },

  getUnreadCount: async (): Promise<number> => {
    const response = await api.get<{ unread_count: number }>('/helpdesk/notifications/unread-count');
    return response.data.unread_count;
  },

  markRead: async (notificationId: number): Promise<void> => {
    await api.post(`/helpdesk/notifications/${notificationId}/read`);
  },

  markAllRead: async (): Promise<void> => {
    await api.post('/helpdesk/notifications/read-all');
  },
};

export default helpdeskService;
