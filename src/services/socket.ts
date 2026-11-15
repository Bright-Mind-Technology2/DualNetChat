import { io, Socket } from 'socket.io-client';
import { User, ChatMessage, Channel, LanInfo } from '../types/chat';

// Generate or retrieve persistent user identity
function getOrCreateUserIdentity(): { userId: string; username: string; avatarColor: string; avatarEmoji: string; deviceType: 'desktop' | 'mobile' | 'tablet' | 'laptop' } {
  let userId = localStorage.getItem('bm_user_id');
  if (!userId) {
    userId = `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('bm_user_id', userId);
  }

  // Detect device type based on user-agent / window size
  let detectedDevice: 'desktop' | 'mobile' | 'tablet' | 'laptop' = 'laptop';
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent.toLowerCase();
    if (/android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
      detectedDevice = 'mobile';
    } else if (/ipad|tablet/i.test(ua)) {
      detectedDevice = 'tablet';
    } else if (/macintosh|windows|linux/i.test(ua)) {
      detectedDevice = window.innerWidth > 1400 ? 'desktop' : 'laptop';
    }
  }

  const defaultColors = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#10b981', '#06b6d4', '#3b82f6'];
  const defaultEmojis = ['⚡', '💡', '🚀', '🌟', '🔥', '🎨', '🦁', '🦉', '🦊', '🍀', '💎', '🎯'];

  const randomColor = defaultColors[Math.floor(Math.random() * defaultColors.length)];
  const randomEmoji = defaultEmojis[Math.floor(Math.random() * defaultEmojis.length)];
  const randomGuestNum = Math.floor(100 + Math.random() * 900);

  const username = localStorage.getItem('bm_username') || `Peer #${randomGuestNum}`;
  const avatarColor = localStorage.getItem('bm_avatar_color') || randomColor;
  const avatarEmoji = localStorage.getItem('bm_avatar_emoji') || randomEmoji;
  const deviceType = (localStorage.getItem('bm_device_type') as any) || detectedDevice;

  return { userId, username, avatarColor, avatarEmoji, deviceType };
}

class ChatSocketClient {
  public socket: Socket | null = null;
  public currentUser: User | null = null;
  public isConnected: boolean = false;
  public latency: number = 0;
  private pingInterval: any = null;

  init(onConnectStateChange?: (connected: boolean) => void, customIdentity?: any) {
    const identity = customIdentity || getOrCreateUserIdentity();

    if (this.socket) {
      if (this.socket.connected) {
        this.socket.emit('user:join', identity);
      }
      return this.socket;
    }

    // In browser, io() defaults to window.location.origin
    this.socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      auth: { token: localStorage.getItem('bm_token') },
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
      onConnectStateChange?.(true);

      // Join network
      this.socket?.emit('user:join', identity);

      // Start ping loop
      if (this.pingInterval) clearInterval(this.pingInterval);
      this.pingInterval = setInterval(() => {
        if (this.socket && this.socket.connected) {
          this.socket.emit('heartbeat:ping', Date.now());
        }
      }, 5000);
    });

    this.socket.on('heartbeat:pong', (data: { clientTimestamp: number }) => {
      this.latency = Math.max(1, Date.now() - data.clientTimestamp);
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
      onConnectStateChange?.(false);
      if (this.pingInterval) clearInterval(this.pingInterval);
    });

    return this.socket;
  }

  disconnect() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
  }

  updateProfile(data: Partial<User>) {
    if (data.username) localStorage.setItem('bm_username', data.username);
    if (data.avatarColor) localStorage.setItem('bm_avatar_color', data.avatarColor);
    if (data.avatarEmoji) localStorage.setItem('bm_avatar_emoji', data.avatarEmoji);
    if (data.avatarImage !== undefined) {
      if (data.avatarImage) {
        localStorage.setItem('bm_avatar_image', data.avatarImage);
      } else {
        localStorage.removeItem('bm_avatar_image');
      }
    }
    if (data.deviceType) localStorage.setItem('bm_device_type', data.deviceType);

    this.socket?.emit('user:update', data);
  }

  sendMessage(msg: {
    channelId?: string;
    recipientId?: string;
    text: string;
    type?: 'text' | 'file' | 'audio' | 'sketch';
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    fileType?: string;
    sketchData?: string;
    replyTo?: { id: string; senderName: string; text: string };
  }) {
    this.socket?.emit('message:send', msg);
  }

  sendReaction(data: { messageId: string; channelId?: string; recipientId?: string; emoji: string }) {
    this.socket?.emit('message:react', data);
  }

  togglePin(data: { messageId: string; channelId?: string; recipientId?: string }) {
    this.socket?.emit('message:pin', data);
  }

  deleteMessage(data: { messageId: string; channelId?: string; recipientId?: string }) {
    this.socket?.emit('message:delete', data);
  }

  editMessage(data: { messageId: string; text: string; channelId?: string; recipientId?: string }) {
    this.socket?.emit('message:edit', data);
  }

  markMessagesAsRead(messageIds: string[], channelId?: string, recipientId?: string) {
    if (!messageIds || messageIds.length === 0) return;
    this.socket?.emit('message:read', { messageIds, channelId, recipientId });
  }

  createChannel(data: {
    name: string;
    nameKm?: string;
    description?: string;
    descriptionKm?: string;
    memberIds: string[];
  }) {
    this.socket?.emit('channel:create', data);
  }

  deleteChannel(channelId: string) {
    this.socket?.emit('channel:delete', { channelId });
  }

  startTyping(channelId?: string, recipientId?: string) {
    this.socket?.emit('typing:start', { channelId, recipientId });
  }

  stopTyping(channelId?: string, recipientId?: string) {
    this.socket?.emit('typing:stop', { channelId, recipientId });
  }

  sendWhiteboardStroke(channelId: string, stroke: any) {
    this.socket?.emit('whiteboard:stroke', { channelId, stroke });
  }

  clearWhiteboard(channelId: string) {
    this.socket?.emit('whiteboard:clear', { channelId });
  }
}

export const socketClient = new ChatSocketClient();
export { getOrCreateUserIdentity };
