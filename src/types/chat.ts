export interface User {
  id: string; // socket.id
  userId: string; // persistent client id
  username: string;
  handle?: string; // unique login handle
  avatarColor: string;
  avatarEmoji: string;
  avatarImage?: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'laptop';
  status: 'online' | 'busy' | 'away' | 'offline';
  role?: 'admin' | 'user';
  customStatus?: string;
  joinedAt: number;
  lastSeen: number;
}

export interface Friend {
  userId: string;
  username: string;
  handle: string;
  avatarColor: string;
  avatarEmoji: string;
  avatarImage?: string;
  deviceType: User['deviceType'];
  role?: 'admin' | 'user';
}

export interface FriendSearchResult extends Friend {
  isFriend: boolean;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderAvatar: { color: string; emoji: string; image?: string };
  recipientId?: string; // if Direct Message
  text: string;
  type: 'text' | 'file' | 'audio' | 'sketch' | 'system';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  sketchData?: string;
  replyTo?: {
    id: string;
    senderName: string;
    text: string;
  };
  reactions: Record<string, string[]>; // emoji -> array of usernames
  isPinned?: boolean;
  status?: 'sent' | 'delivered' | 'read';
  readBy?: Record<string, number>; // userId -> timestamp
  timestamp: number;
}

export interface Channel {
  id: string;
  name: string;
  nameKm: string;
  description: string;
  descriptionKm: string;
  isDefault?: boolean;
  createdBy?: string;
  createdById?: string;
  createdAt: number;
}

export interface LanInfo {
  appName: string;
  hostname: string;
  lanIps: string[];
  port: number;
  protocol?: 'http' | 'https';
  platform: string;
  uptime: number;
  connectedUsers: number;
  timestamp: number;
}
