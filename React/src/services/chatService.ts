import api from './api';

export interface ChatResponse {
  reply: string;
  tool_used: string | null;
  data: any;
  suggestions: string[] | null;
}

const chatService = {
  sendMessage: async (message: string): Promise<ChatResponse> => {
    const response = await api.post('/chat/message', { message });
    return response.data;
  },
};

export default chatService;
