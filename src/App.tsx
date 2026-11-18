/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Menu, X, Wifi, Loader2 } from 'lucide-react';
import { User, Friend, FriendSearchResult, Channel, ChatMessage, LanInfo } from './types/chat';
import { Language, translations } from './translations';
import { socketClient } from './services/socket';
import { soundManager } from './utils/audio';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { ConnectModal } from './components/ConnectModal';
import { ProfileModal } from './components/ProfileModal';
import { CreateChannelModal } from './components/CreateChannelModal';
import { WhiteboardModal } from './components/WhiteboardModal';
import { AuthScreen } from './components/AuthScreen';
import { VideoCallOverlay } from './components/VideoCallOverlay';
import { useVideoCall } from './services/useVideoCall';

export default function App() {
  const [lang, setLang] = useState<Language>(() => {
    return (localStorage.getItem('bm_lang') as Language) || 'km';
  });
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    return localStorage.getItem('bm_sound') !== 'false';
  });
  const [isLightMode, setIsLightMode] = useState<boolean>(() => {
    return localStorage.getItem('bm_theme') !== 'dark';
  });
  const [chatBackground, setChatBackground] = useState<string | null>(() =>
    localStorage.getItem('bm_chat_background')
  );

  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [latency, setLatency] = useState<number>(0);
  const [users, setUsers] = useState<User[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<Friend[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>('');
  const [activeDmUserId, setActiveDmUserId] = useState<string | null>(null);
  const [isWelcomePage, setIsWelcomePage] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const activeChannelIdRef = React.useRef(activeChannelId);
  const activeDmUserIdRef = React.useRef(activeDmUserId);
  const processedIncomingMessageIdsRef = React.useRef(new Set<string>());

  useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
    activeDmUserIdRef.current = activeDmUserId;
  }, [activeChannelId, activeDmUserId]);

  // Channel messages: channelId -> ChatMessage[]
  const [channelMessages, setChannelMessages] = useState<Record<string, ChatMessage[]>>({});
  // Direct messages: key userId1:userId2 -> ChatMessage[]
  const [directMessages, setDirectMessages] = useState<Record<string, ChatMessage[]>>({});

  // Typing status: list of names typing in active room
  const [typingMap, setTypingMap] = useState<Record<string, string[]>>({});

  // Lan info from server
  const [lanInfo, setLanInfo] = useState<LanInfo | null>(null);

  // Mobile sidebar drawer
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Modals
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isCreateChannelModalOpen, setIsCreateChannelModalOpen] = useState(false);
  const [isWhiteboardModalOpen, setIsWhiteboardModalOpen] = useState(false);
  const videoCall = useVideoCall(socketClient.socket, currentUser, lang);

  const refreshFriends = useCallback(async () => {
    const token = localStorage.getItem('bm_token');
    if (!token) {
      setFriends([]);
      setBlockedUsers([]);
      return;
    }

    const response = await fetch('/api/friends', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Could not load friends');
    }
    setFriends(data.friends as Friend[]);
    setBlockedUsers((data.blockedUsers || []) as Friend[]);
  }, []);

  // Sync sound manager
  useEffect(() => {
    soundManager.enabled = soundEnabled;
    localStorage.setItem('bm_sound', String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    document.documentElement.classList.toggle('light-theme', isLightMode);
    document.documentElement.style.colorScheme = isLightMode ? 'light' : 'dark';
    localStorage.setItem('bm_theme', isLightMode ? 'light' : 'dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      isLightMode ? '#f5f7fc' : '#070b1a'
    );
  }, [isLightMode]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Sync language
  const handleToggleLang = () => {
    const nextLang = lang === 'km' ? 'en' : 'km';
    setLang(nextLang);
    localStorage.setItem('bm_lang', nextLang);
  };

  const handleChangeChatBackground = (image: string | null): boolean => {
    try {
      if (image) {
        localStorage.setItem('bm_chat_background', image);
      } else {
        localStorage.removeItem('bm_chat_background');
      }
      setChatBackground(image);
      return true;
    } catch (error) {
      console.error('Failed to save chat background:', error);
      return false;
    }
  };

  // Fetch LAN info on mount and periodically
  const fetchLanInfo = async () => {
    try {
      const res = await fetch('/api/lan-info');
      if (res.ok) {
        const data = await res.json();
        setLanInfo(data);
      }
    } catch {
      // Offline fallback
    }
  };

  useEffect(() => {
    fetchLanInfo();
    const interval = setInterval(fetchLanInfo, 10000);
    return () => clearInterval(interval);
  }, []);

  // Check authentication session on startup
  useEffect(() => {
    const verifySession = async () => {
      const token = localStorage.getItem('bm_token');
      if (!token) {
        setIsAuthChecking(false);
        setIsAuthenticated(false);
        return;
      }

      try {
        const res = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();
        if (res.ok && data.success && data.user) {
          setCurrentUser(data.user);
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem('bm_token');
          localStorage.removeItem('bm_auth_user');
          setIsAuthenticated(false);
        }
      } catch {
        // Offline resilience: if server temporary unreachable, verify cached user
        const cached = localStorage.getItem('bm_auth_user');
        if (cached) {
          try {
            setCurrentUser(JSON.parse(cached));
            setIsAuthenticated(true);
          } catch {
            setIsAuthenticated(false);
          }
        } else {
          setIsAuthenticated(false);
        }
      } finally {
        setIsAuthChecking(false);
      }
    };

    verifySession();
  }, []);

  const currentUserRef = React.useRef<User | null>(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Initialize Socket.io connection & events once authenticated
  useEffect(() => {
    if (!isAuthenticated || !currentUser) return;

    const socket = socketClient.init(
      (connected) => {
        setIsConnected(connected);
      },
      {
        userId: currentUser.userId,
        username: currentUser.username,
        avatarColor: currentUser.avatarColor,
        avatarEmoji: currentUser.avatarEmoji,
        avatarImage: currentUser.avatarImage,
        deviceType: currentUser.deviceType,
        status: currentUser.status || 'online',
      }
    );

    if (!socket) return;

    // Latency ticker
    const latInterval = setInterval(() => {
      setLatency(socketClient.latency);
    }, 2000);

    // Initial state synchronized from server
    const handleInitState = (data: {
      currentUser: User;
      users: User[];
      channels: Channel[];
      messages: Record<string, ChatMessage[]>;
      directMessages?: Record<string, ChatMessage[]>;
      lanIps: string[];
      port: number;
    }) => {
      // Keep verified username & handle
      setCurrentUser((prev) => (prev ? { ...prev, ...data.currentUser, username: prev.username } : data.currentUser));
      setUsers(data.users);
      setChannels(data.channels);
      setChannelMessages(data.messages || {});
      void refreshFriends().catch((error) => console.error('Failed to load friends:', error));
      if (data.directMessages) {
        setDirectMessages(data.directMessages);
      }
    };

    const handleFriendsUpdated = () => {
      void refreshFriends().catch((error) => console.error('Failed to refresh friends:', error));
    };

    // Peer Joined
    const handleUserJoined = (user: User) => {
      setUsers((prev) => {
        const filtered = prev.filter((u) => u.userId !== user.userId);
        return [...filtered, user];
      });
      soundManager.playJoinSound();
    };

    // Peer Updated
    const handleUserUpdated = (updatedUser: User) => {
      setUsers((prev) =>
        prev.map((u) => (u.userId === updatedUser.userId ? updatedUser : u))
      );
      setFriends((prev) =>
        prev.map((friend) =>
          friend.userId === updatedUser.userId
            ? {
                ...friend,
                username: updatedUser.username,
                avatarColor: updatedUser.avatarColor,
                avatarEmoji: updatedUser.avatarEmoji,
                avatarImage: updatedUser.avatarImage,
                role: updatedUser.role,
              }
            : friend
        )
      );
      if (currentUserRef.current?.userId === updatedUser.userId) {
        setCurrentUser(updatedUser);
      }
    };

    // Peer Left
    const handleUserLeft = (data: { userId: string }) => {
      setUsers((prev) => prev.filter((u) => u.userId !== data.userId));
    };

    // Channel Created
    const handleChannelCreated = (newChannel: Channel) => {
      setChannels((prev) => {
        if (prev.some((c) => c.id === newChannel.id)) return prev;
        return [...prev, newChannel];
      });
      if (newChannel.createdById === currentUserRef.current?.userId) {
        setActiveChannelId(newChannel.id);
        setActiveDmUserId(null);
        setIsMobileMenuOpen(false);
      }
    };

    const handleChannelDeleted = (data: { channelId: string }) => {
      setChannels((prev) => prev.filter((channel) => channel.id !== data.channelId));
      setChannelMessages((prev) => {
        const next = { ...prev };
        delete next[data.channelId];
        return next;
      });
      setUnreadCounts((prev) => {
        const next = { ...prev };
        delete next[`channel:${data.channelId}`];
        return next;
      });
      if (activeChannelIdRef.current === data.channelId) {
        activeChannelIdRef.current = '';
        setActiveChannelId('');
      }
    };

    // New Channel Message
    const handleMessageNew = (msg: ChatMessage) => {
      const isNewMessage = !processedIncomingMessageIdsRef.current.has(msg.id);
      processedIncomingMessageIdsRef.current.add(msg.id);

      setChannelMessages((prev) => {
        const list = prev[msg.channelId] || [];
        if (list.some((m) => m.id === msg.id)) return prev;
        return {
          ...prev,
          [msg.channelId]: [...list, msg],
        };
      });

      if (msg.senderId !== currentUserRef.current?.userId && msg.type !== 'system') {
        soundManager.playMessageSound();
        if (
          isNewMessage &&
          (activeDmUserIdRef.current !== null || activeChannelIdRef.current !== msg.channelId)
        ) {
          const unreadKey = `channel:${msg.channelId}`;
          setUnreadCounts((prev) => ({ ...prev, [unreadKey]: (prev[unreadKey] || 0) + 1 }));
        }
      }
    };

    // New Direct Message
    const handleMessageDirect = (msg: ChatMessage) => {
      const myId = currentUserRef.current?.userId;
      if (!myId) return;
      const otherId = msg.senderId === myId ? msg.recipientId! : msg.senderId;
      const key = [myId, otherId].sort().join(':::');
      const isNewMessage = !processedIncomingMessageIdsRef.current.has(msg.id);
      processedIncomingMessageIdsRef.current.add(msg.id);

      setDirectMessages((prev) => {
        const list = prev[key] || [];
        if (list.some((m) => m.id === msg.id)) return prev;
        return {
          ...prev,
          [key]: [...list, msg],
        };
      });

      if (msg.senderId !== currentUserRef.current?.userId) {
        soundManager.playMessageSound();
        if (isNewMessage && activeDmUserIdRef.current !== otherId) {
          const unreadKey = `dm:${otherId}`;
          setUnreadCounts((prev) => ({ ...prev, [unreadKey]: (prev[unreadKey] || 0) + 1 }));
        }
      }
    };

    // Message Reacted
    const handleMessageReacted = (data: {
      messageId: string;
      channelId?: string;
      recipientId?: string;
      conversationKey?: string;
      reactions: Record<string, string[]>;
    }) => {
      if (data.channelId) {
        setChannelMessages((prev) => {
          const list = prev[data.channelId!] || [];
          return {
            ...prev,
            [data.channelId!]: list.map((m) =>
              m.id === data.messageId ? { ...m, reactions: data.reactions } : m
            ),
          };
        });
      }
      const myId = currentUserRef.current?.userId;
      const convKey = data.conversationKey || (data.recipientId && myId ? [myId, data.recipientId].sort().join(':::') : undefined);
      if (convKey) {
        setDirectMessages((prev) => {
          const list = prev[convKey] || [];
          return {
            ...prev,
            [convKey]: list.map((m) =>
              m.id === data.messageId ? { ...m, reactions: data.reactions } : m
            ),
          };
        });
      }
    };

    // Message Pinned
    const handleMessagePinned = (data: {
      messageId: string;
      channelId?: string;
      recipientId?: string;
      conversationKey?: string;
      isPinned: boolean;
    }) => {
      if (data.channelId) {
        setChannelMessages((prev) => {
          const list = prev[data.channelId!] || [];
          return {
            ...prev,
            [data.channelId!]: list.map((m) =>
              m.id === data.messageId ? { ...m, isPinned: data.isPinned } : m
            ),
          };
        });
      }
      const myId = currentUserRef.current?.userId;
      const convKey = data.conversationKey || (data.recipientId && myId ? [myId, data.recipientId].sort().join(':::') : undefined);
      if (convKey) {
        setDirectMessages((prev) => {
          const list = prev[convKey] || [];
          return {
            ...prev,
            [convKey]: list.map((m) =>
              m.id === data.messageId ? { ...m, isPinned: data.isPinned } : m
            ),
          };
        });
      }
    };

    const handleMessageDeleted = (data: {
      messageId: string;
      channelId?: string;
      recipientId?: string;
      conversationKey?: string;
    }) => {
      if (data.channelId) {
        setChannelMessages((prev) => ({
          ...prev,
          [data.channelId!]: (prev[data.channelId!] || []).filter(
            (message) => message.id !== data.messageId
          ),
        }));
      }

      const myId = currentUserRef.current?.userId;
      const conversationKey =
        data.conversationKey ||
        (data.recipientId && myId
          ? [myId, data.recipientId].sort().join(':::')
          : undefined);
      if (conversationKey) {
        setDirectMessages((prev) => ({
          ...prev,
          [conversationKey]: (prev[conversationKey] || []).filter(
            (message) => message.id !== data.messageId
          ),
        }));
      }
    };

    const handleMessageEdited = (data: {
      messageId: string;
      text: string;
      channelId?: string;
      recipientId?: string;
      conversationKey?: string;
    }) => {
      if (data.channelId) {
        setChannelMessages((prev) => ({
          ...prev,
          [data.channelId!]: (prev[data.channelId!] || []).map((message) =>
            message.id === data.messageId ? { ...message, text: data.text } : message
          ),
        }));
      }

      const myId = currentUserRef.current?.userId;
      const conversationKey =
        data.conversationKey ||
        (data.recipientId && myId
          ? [myId, data.recipientId].sort().join(':::')
          : undefined);
      if (conversationKey) {
        setDirectMessages((prev) => ({
          ...prev,
          [conversationKey]: (prev[conversationKey] || []).map((message) =>
            message.id === data.messageId ? { ...message, text: data.text } : message
          ),
        }));
      }
    };

    // Message Read Receipts (ticks update)
    const handleMessageRead = (data: {
      messageIds: string[];
      readerId: string;
      readerName: string;
      channelId?: string;
      recipientId?: string;
      conversationKey?: string;
      timestamp: number;
    }) => {
      if (data.channelId) {
        setChannelMessages((prev) => {
          const list = prev[data.channelId!] || [];
          return {
            ...prev,
            [data.channelId!]: list.map((m) => {
              if (data.messageIds.includes(m.id)) {
                const updatedReadBy = { ...(m.readBy || {}), [data.readerId]: data.timestamp };
                return {
                  ...m,
                  status: 'read',
                  readBy: updatedReadBy,
                };
              }
              return m;
            }),
          };
        });
      }

      const myId = currentUserRef.current?.userId;
      const convKey = data.conversationKey || (data.recipientId && myId ? [myId, data.recipientId].sort().join(':::') : undefined);
      if (convKey) {
        setDirectMessages((prev) => {
          const list = prev[convKey] || [];
          return {
            ...prev,
            [convKey]: list.map((m) => {
              if (data.messageIds.includes(m.id)) {
                const updatedReadBy = { ...(m.readBy || {}), [data.readerId]: data.timestamp };
                return {
                  ...m,
                  status: 'read',
                  readBy: updatedReadBy,
                };
              }
              return m;
            }),
          };
        });
      }
    };

    // Typing Status
    const handleTypingStatus = (data: {
      userId: string;
      username: string;
      channelId?: string;
      recipientId?: string;
      isTyping: boolean;
    }) => {
      const roomKey = data.channelId || data.userId;
      setTypingMap((prev) => {
        const existing = prev[roomKey] || [];
        if (data.isTyping) {
          if (!existing.includes(data.username)) {
            return { ...prev, [roomKey]: [...existing, data.username] };
          }
        } else {
          return { ...prev, [roomKey]: existing.filter((name) => name !== data.username) };
        }
        return prev;
      });
    };

    socket.on('init:state', handleInitState);
    socket.on('user:joined', handleUserJoined);
    socket.on('user:updated', handleUserUpdated);
    socket.on('user:left', handleUserLeft);
    socket.on('channel:created', handleChannelCreated);
    socket.on('channel:deleted', handleChannelDeleted);
    socket.on('message:new', handleMessageNew);
    socket.on('message:direct', handleMessageDirect);
    socket.on('message:reacted', handleMessageReacted);
    socket.on('message:pinned', handleMessagePinned);
    socket.on('message:deleted', handleMessageDeleted);
    socket.on('message:edited', handleMessageEdited);
    socket.on('message:read', handleMessageRead);
    socket.on('typing:status', handleTypingStatus);
    socket.on('friends:updated', handleFriendsUpdated);

    return () => {
      clearInterval(latInterval);
      socket.off('init:state', handleInitState);
      socket.off('user:joined', handleUserJoined);
      socket.off('user:updated', handleUserUpdated);
      socket.off('user:left', handleUserLeft);
      socket.off('channel:created', handleChannelCreated);
      socket.off('channel:deleted', handleChannelDeleted);
      socket.off('message:new', handleMessageNew);
      socket.off('message:direct', handleMessageDirect);
      socket.off('message:reacted', handleMessageReacted);
      socket.off('message:pinned', handleMessagePinned);
      socket.off('message:deleted', handleMessageDeleted);
      socket.off('message:edited', handleMessageEdited);
      socket.off('message:read', handleMessageRead);
      socket.off('typing:status', handleTypingStatus);
      socket.off('friends:updated', handleFriendsUpdated);
    };
  }, [isAuthenticated, currentUser?.userId, refreshFriends]);

  // Handle Channel Selection
  const handleSelectChannel = (channelId: string) => {
    setIsWelcomePage(false);
    activeChannelIdRef.current = channelId;
    activeDmUserIdRef.current = null;
    setActiveChannelId(channelId);
    setActiveDmUserId(null);
    setUnreadCounts((prev) => {
      const next = { ...prev };
      delete next[`channel:${channelId}`];
      return next;
    });
    setIsMobileMenuOpen(false);
  };

  useEffect(() => {
    if (!activeDmUserId && !channels.some((channel) => channel.id === activeChannelId)) {
      setActiveChannelId(channels[0]?.id || '');
    }
  }, [activeChannelId, activeDmUserId, channels]);

  // Handle Direct Message Peer Selection
  const handleSelectDmUser = (userId: string) => {
    setIsWelcomePage(false);
    activeDmUserIdRef.current = userId;
    setActiveDmUserId(userId);
    setUnreadCounts((prev) => {
      const next = { ...prev };
      delete next[`dm:${userId}`];
      return next;
    });
    setIsMobileMenuOpen(false);
  };

  // Active conversation details
  const activeChannel = useMemo(() => {
    return channels.find((c) => c.id === activeChannelId) || null;
  }, [channels, activeChannelId]);

  const activeRecipientUser = useMemo(() => {
    if (!activeDmUserId) return null;
    const onlineUser = users.find((user) => user.userId === activeDmUserId);
    if (onlineUser) return onlineUser;
    const friend = friends.find((item) => item.userId === activeDmUserId);
    return friend
      ? {
          ...friend,
          id: friend.userId,
          status: 'offline' as const,
          joinedAt: 0,
          lastSeen: 0,
        }
      : null;
  }, [users, friends, activeDmUserId]);

  // Active messages list
  const activeMessages = useMemo(() => {
    if (activeDmUserId && currentUser) {
      const key = [currentUser.userId, activeDmUserId].sort().join(':::');
      return directMessages[key] || [];
    }
    return channelMessages[activeChannelId] || [];
  }, [activeDmUserId, currentUser, directMessages, channelMessages, activeChannelId]);

  // Active typing users
  const activeTypingUsers = useMemo(() => {
    const roomKey = activeDmUserId || activeChannelId;
    return (typingMap[roomKey] || []).filter((name) => name !== currentUser?.username);
  }, [activeDmUserId, activeChannelId, typingMap, currentUser?.username]);

  // Message Send Dispatcher
  const handleSendMessage = (payload: {
    text: string;
    type?: 'text' | 'file' | 'audio' | 'sketch';
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    fileType?: string;
    replyTo?: { id: string; senderName: string; text: string };
  }) => {
    if (activeDmUserId) {
      socketClient.sendMessage({
        ...payload,
        recipientId: activeDmUserId,
      });
    } else {
      socketClient.sendMessage({
        ...payload,
        channelId: activeChannelId,
      });
    }
  };

  // Reaction Dispatcher
  const handleSendReaction = (messageId: string, emoji: string) => {
    socketClient.sendReaction({
      messageId,
      channelId: activeDmUserId ? undefined : activeChannelId,
      recipientId: activeDmUserId || undefined,
      emoji,
    });
  };

  // Pin Toggle Dispatcher
  const handleTogglePin = (messageId: string) => {
    if (activeDmUserId) {
      socketClient.togglePin({
        messageId,
        recipientId: activeDmUserId,
      });
    } else if (activeChannelId) {
      socketClient.togglePin({
        messageId,
        channelId: activeChannelId,
      });
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    socketClient.deleteMessage({
      messageId,
      channelId: activeDmUserId ? undefined : activeChannelId,
      recipientId: activeDmUserId || undefined,
    });
  };

  const handleEditMessage = (messageId: string, text: string) => {
    socketClient.editMessage({
      messageId,
      text,
      channelId: activeDmUserId ? undefined : activeChannelId,
      recipientId: activeDmUserId || undefined,
    });
  };

  // Typing Dispatcher
  const handleTyping = (isTyping: boolean) => {
    if (isTyping) {
      socketClient.startTyping(
        activeDmUserId ? undefined : activeChannelId,
        activeDmUserId || undefined
      );
    } else {
      socketClient.stopTyping(
        activeDmUserId ? undefined : activeChannelId,
        activeDmUserId || undefined
      );
    }
  };

  // Whiteboard sketch post to chat
  const handleSendSketchToChat = async (sketchDataUrl: string) => {
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `sketch-${Date.now()}.png`,
          type: 'image/png',
          data: sketchDataUrl,
        }),
      });
      const data = await res.json();
      if (data.url) {
        handleSendMessage({
          text: lang === 'km' ? '🎨 ក្តារខៀនគំនូររួមគ្នា' : '🎨 Collaborative sketchpad post',
          type: 'sketch',
          fileUrl: data.url,
          fileName: 'sketch.png',
          fileType: 'image/png',
        });
      }
    } catch (err) {
      console.error('Failed to post sketch:', err);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    const token = localStorage.getItem('bm_token');
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
      } catch {}
    }
    localStorage.removeItem('bm_token');
    localStorage.removeItem('bm_auth_user');
    socketClient.disconnect();
    setIsAuthenticated(false);
    setCurrentUser(null);
    setFriends([]);
  };

  const handleSearchUsers = async (username: string) => {
    const token = localStorage.getItem('bm_token');
    if (!token) {
      return { success: false, users: [], message: translations[lang].addFriendFailed };
    }

    try {
      const response = await fetch(`/api/users/search?username=${encodeURIComponent(username)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        const message = data.error === 'searchUsernameTooShort'
          ? translations[lang].searchUsernameTooShort
          : translations[lang].searchFailed;
        return { success: false, users: [], message };
      }

      const results = data.users as FriendSearchResult[];
      return {
        success: true,
        users: results,
        message: results.length === 0 ? translations[lang].noUsersFound : '',
      };
    } catch (error) {
      console.error('Failed to search users:', error);
      return { success: false, users: [], message: translations[lang].searchFailed };
    }
  };

  const handleAddFriend = async (username: string) => {
    const token = localStorage.getItem('bm_token');
    if (!token) return { success: false, message: translations[lang].addFriendFailed };

    try {
      const response = await fetch('/api/friends', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        const errors: Record<string, string> = {
          friendUsernameRequired: translations[lang].friendUsernameRequired,
          friendNotFound: translations[lang].friendNotFound,
          cannotAddSelf: translations[lang].cannotAddSelf,
          friendBlocked: translations[lang].friendBlocked,
        };
        return {
          success: false,
          message: errors[data.error] || translations[lang].addFriendFailed,
        };
      }

      await refreshFriends();
      return {
        success: true,
        message: data.alreadyFriends
          ? translations[lang].friendExists
          : translations[lang].friendAdded,
      };
    } catch (error) {
      console.error('Failed to add friend:', error);
      return { success: false, message: translations[lang].addFriendFailed };
    }
  };

  const handleFriendAction = async (
    friendId: string,
    action: 'remove' | 'block' | 'unblock'
  ): Promise<{ success: boolean; message?: string }> => {
    const token = localStorage.getItem('bm_token');
    if (!token) return { success: false, message: translations[lang].friendActionFailed };

    try {
      const response = await fetch(
        action === 'remove' ? `/api/friends/${encodeURIComponent(friendId)}` : `/api/blocks/${encodeURIComponent(friendId)}`,
        {
          method: action === 'block' ? 'POST' : 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await response.json().catch(() => null);
      if (!data) {
        throw new Error(`Friend action endpoint returned HTTP ${response.status}`);
      }
      if (!response.ok || !data.success) {
        throw new Error(data.error || `Friend action endpoint returned HTTP ${response.status}`);
      }

      await refreshFriends();
      if (action !== 'unblock' && activeDmUserIdRef.current === friendId) {
        activeDmUserIdRef.current = null;
        setActiveDmUserId(null);
        setIsWelcomePage(true);
      }
      if (action !== 'unblock') {
        setUnreadCounts((previous) => {
          const next = { ...previous };
          delete next[`dm:${friendId}`];
          return next;
        });
      }
      return { success: true };
    } catch (error) {
      console.error(`Failed to ${action} friend:`, error);
      return { success: false, message: translations[lang].friendActionFailed };
    }
  };

  // Handle Mark Messages as Read
  const handleMarkAsRead = (messageIds: string[]) => {
    if (!currentUser || messageIds.length === 0) return;
    socketClient.markMessagesAsRead(
      messageIds,
      activeDmUserId ? undefined : activeChannelId,
      activeDmUserId || undefined
    );

    // Optimistically update local view
    const readTimestamp = Date.now();
    if (activeDmUserId) {
      const key = [currentUser.userId, activeDmUserId].sort().join(':::');
      setDirectMessages((prev) => {
        const list = prev[key] || [];
        return {
          ...prev,
          [key]: list.map((m) => {
            if (messageIds.includes(m.id)) {
              return {
                ...m,
                readBy: { ...(m.readBy || {}), [currentUser.userId]: readTimestamp },
              };
            }
            return m;
          }),
        };
      });
    } else if (activeChannelId) {
      setChannelMessages((prev) => {
        const list = prev[activeChannelId] || [];
        return {
          ...prev,
          [activeChannelId]: list.map((m) => {
            if (messageIds.includes(m.id)) {
              return {
                ...m,
                readBy: { ...(m.readBy || {}), [currentUser.userId]: readTimestamp },
              };
            }
            return m;
          }),
        };
      });
    }
  };

  // Authentication Loading Screen
  // Authentication Loading Screen
  if (isAuthChecking) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 gap-3">
        <img
          src="/bright-mind-logo.png"
          alt="Bright Mind"
          className="h-12 w-12 rounded-2xl object-contain"
        />
        <div className="flex items-center gap-2 text-sm text-slate-400 font-medium">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
          <span>Bright Mind...</span>
        </div>
      </div>
    );
  }

  // If Not Authenticated -> Show Login & Register Screen
  if (!isAuthenticated) {
    return (
      <AuthScreen
        onAuthenticated={(user, token) => {
          setCurrentUser(user);
          setIsAuthenticated(true);
        }}
        lanInfo={lanInfo}
        latency={latency}
        lang={lang}
        onToggleLang={handleToggleLang}
        isLightMode={isLightMode}
        onToggleTheme={() => setIsLightMode((previous) => !previous)}
      />
    );
  }

  // Authenticated Workspace
  return (
    <div className="app-viewport flex h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100">
      {/* Mobile Menu Backdrop */}
      {isMobileMenuOpen && (
        <div
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 z-30 bg-black/70 backdrop-blur-xs md:hidden"
        />
      )}

      {/* Sidebar - responsive drawer on small devices */}
      <div
        className={`fixed inset-y-0 left-0 top-[env(safe-area-inset-top)] bottom-[env(safe-area-inset-bottom)] z-40 transform transition-transform duration-300 md:relative md:inset-y-0 md:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar
          channels={channels}
          activeChannelId={activeChannelId}
          onSelectChannel={handleSelectChannel}
          onBackToWelcome={() => {
            setIsWelcomePage(true);
            setIsMobileMenuOpen(false);
          }}
          onDeleteChannel={(channelId) => socketClient.deleteChannel(channelId)}
          users={users}
          friends={friends}
          blockedUsers={blockedUsers}
          unreadCounts={unreadCounts}
          currentUser={currentUser}
          activeDmUserId={activeDmUserId}
          onSelectDmUser={handleSelectDmUser}
          onSearchUsers={handleSearchUsers}
          onAddFriend={handleAddFriend}
          onRemoveFriend={(friendId) => handleFriendAction(friendId, 'remove')}
          onBlockFriend={(friendId) => handleFriendAction(friendId, 'block')}
          onUnblockUser={(userId) => handleFriendAction(userId, 'unblock')}
          isConnected={isConnected}
          latency={latency}
          lang={lang}
          onToggleLang={handleToggleLang}
          isLightMode={isLightMode}
          onToggleTheme={() => setIsLightMode((previous) => !previous)}
          onOpenConnectModal={() => setIsConnectModalOpen(true)}
          onOpenProfileModal={() => setIsProfileModalOpen(true)}
          onOpenCreateChannelModal={() => setIsCreateChannelModalOpen(true)}
          soundEnabled={soundEnabled}
          onToggleSound={() => setSoundEnabled(!soundEnabled)}
          onLogout={handleLogout}
        />
      </div>

      {/* Main Chat Workspace */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
        {/* Mobile Header Bar with Hamburger */}
        <div className="md:hidden flex items-center justify-between gap-2 px-3 py-2.5 bg-slate-900 border-b border-slate-800 shrink-0">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="shrink-0 p-2 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition"
            title={isMobileMenuOpen ? translations[lang].close : translations[lang].backToChats}
            aria-label={isMobileMenuOpen ? translations[lang].close : translations[lang].backToChats}
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex min-w-0 items-center gap-2">
            <span className="flex min-w-0 items-center gap-1.5 truncate text-sm font-bold text-slate-100">
              <img src="/bright-mind-logo.png" alt="" className="h-6 w-6 shrink-0 rounded-md object-contain" />
              <span className="truncate">Bright Mind</span>
            </span>
            <span className="hidden min-[360px]:flex shrink-0 items-center gap-1 text-[10px] text-emerald-400 font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LAN
            </span>
          </div>

          <button
            onClick={() => setIsConnectModalOpen(true)}
            className="shrink-0 p-2 text-indigo-400 hover:text-indigo-300 rounded-lg hover:bg-slate-800 transition"
          >
            <Wifi className="w-5 h-5" />
          </button>
        </div>

        {/* Chat Area View */}
        {!isWelcomePage && (activeRecipientUser || activeChannel) ? (
          <ChatArea
            channel={activeChannel}
            recipientUser={activeRecipientUser}
            backgroundImage={chatBackground}
            messages={activeMessages}
            currentUser={currentUser}
            typingUsers={activeTypingUsers}
            lang={lang}
            onSendMessage={handleSendMessage}
            onSendReaction={handleSendReaction}
            onTogglePin={handleTogglePin}
            onDeleteMessage={handleDeleteMessage}
            onEditMessage={handleEditMessage}
            onOpenWhiteboard={() => setIsWhiteboardModalOpen(true)}
            canVideoCall={Boolean(isConnected && activeDmUserId && users.some((user) => user.userId === activeDmUserId))}
            onStartVideoCall={() => {
              if (activeRecipientUser && users.some((user) => user.userId === activeRecipientUser.userId)) {
                void videoCall.startCall(activeRecipientUser);
              }
            }}
            onTyping={handleTyping}
            onMarkAsRead={handleMarkAsRead}
          />
        ) : (
          <div className="welcome-stage relative flex flex-1 items-center justify-center overflow-hidden p-6 text-center">
            <div className="welcome-grid pointer-events-none absolute inset-0" />
            <div className="welcome-orb welcome-orb-cyan pointer-events-none absolute" />
            <div className="welcome-orb welcome-orb-violet pointer-events-none absolute" />
            <div className="welcome-content relative z-10 flex flex-col items-center">
              <div className="welcome-logo-frame mb-7 flex items-center justify-center rounded-[2rem] p-1">
                <img
                  src="/bright-mind-logo.png"
                  alt=""
                  className="welcome-logo h-28 w-28 rounded-[1.75rem] object-contain sm:h-36 sm:w-36"
                />
              </div>
              <h1 className="welcome-title text-2xl font-extrabold tracking-tight sm:text-4xl">
                {translations[lang].welcomeTitle}
              </h1>
              <div className="welcome-underline mt-5 h-1 w-20 rounded-full" />
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <ConnectModal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
        lanInfo={lanInfo}
        lang={lang}
      />

      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        currentUser={currentUser}
        onSave={(updatedData) => {
          socketClient.updateProfile(updatedData);
          setCurrentUser((previous) => previous ? { ...previous, ...updatedData } : previous);
        }}
        backgroundImage={chatBackground}
        onChangeBackground={handleChangeChatBackground}
        lang={lang}
      />

      <CreateChannelModal
        isOpen={isCreateChannelModalOpen}
        onClose={() => setIsCreateChannelModalOpen(false)}
        onCreate={(chData) => socketClient.createChannel(chData)}
        friends={friends}
        lang={lang}
      />

      <WhiteboardModal
        isOpen={isWhiteboardModalOpen}
        onClose={() => setIsWhiteboardModalOpen(false)}
        channelId={
          activeDmUserId && currentUser
            ? [currentUser.userId, activeDmUserId].sort().join(':::')
            : activeChannelId
        }
        lang={lang}
        onSendSketchToChat={handleSendSketchToChat}
      />

      <VideoCallOverlay
        call={videoCall.call}
        notice={videoCall.notice}
        lang={lang}
        onAccept={() => void videoCall.acceptCall()}
        onReject={videoCall.rejectCall}
        onEnd={videoCall.endCall}
      />
    </div>
  );
}
