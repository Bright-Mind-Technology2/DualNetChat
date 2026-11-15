import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Send,
  Paperclip,
  Mic,
  Smile,
  Palette,
  Pin,
  Reply,
  Download,
  FileText,
  Search,
  X,
  Play,
  Pause,
  Maximize2,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Volume2,
  SlidersHorizontal,
  Check,
  CheckCheck,
  Video,
  Trash2,
  Pencil,
} from 'lucide-react';
import { ChatMessage, Channel, User } from '../types/chat';
import { Language, translations } from '../translations';
import { VoiceRecorder, soundManager } from '../utils/audio';

interface ChatAreaProps {
  channel: Channel | null;
  recipientUser: User | null;
  backgroundImage: string | null;
  messages: ChatMessage[];
  currentUser: User | null;
  typingUsers: string[];
  lang: Language;
  onSendMessage: (payload: {
    text: string;
    type?: 'text' | 'file' | 'audio' | 'sketch';
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    fileType?: string;
    replyTo?: { id: string; senderName: string; text: string };
  }) => void;
  onSendReaction: (messageId: string, emoji: string) => void;
  onTogglePin: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onEditMessage: (messageId: string, text: string) => void;
  onOpenWhiteboard: () => void;
  canVideoCall: boolean;
  onStartVideoCall: () => void;
  onTyping: (isTyping: boolean) => void;
  onMarkAsRead?: (messageIds: string[]) => void;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🔥', '💡'];
const PICKER_EMOJIS = ['😀', '😂', '🥰', '😍', '😎', '🥳', '🤔', '👍', '👏', '🔥', '❤️', '🎉', '💡', '🚀', '✨', '💯', '🙏', '☕'];

const getMimeExtension = (mimeType?: string) => {
  if (!mimeType) return '.webm';

  const extensions: Record<string, string> = {
    'audio/webm': '.webm',
    'audio/ogg': '.ogg',
    'audio/mp4': '.m4a',
    'audio/m4a': '.m4a',
    'audio/aac': '.aac',
    'audio/x-m4a': '.m4a',
    'audio/mp3': '.mp3',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
  };

  return extensions[mimeType.toLowerCase()] || `.${(mimeType.split('/')[1] || 'bin').split(';')[0] || 'bin'}`;
};

type SearchFilterType = 'all' | 'text' | 'files' | 'images' | 'voice' | 'sketches';

const VideoAttachment: React.FC<{ src: string; fileName?: string; lang: Language }> = ({
  src,
  fileName,
  lang,
}) => {
  const [hasPlaybackError, setHasPlaybackError] = useState(false);
  const t = translations[lang];

  if (hasPlaybackError) {
    return (
      <div className="flex max-w-md items-center gap-3 rounded-xl border border-slate-700 bg-slate-950/80 p-3 text-xs text-slate-300">
        <Video className="h-5 w-5 shrink-0 text-indigo-300" />
        <span className="flex-1">{t.videoPlaybackError}</span>
        <a
          href={src}
          download={fileName || 'video'}
          className="shrink-0 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-white transition hover:bg-indigo-500"
        >
          {t.downloadFile}
        </a>
      </div>
    );
  }

  return (
    <video
      src={src}
      controls
      playsInline
      preload="metadata"
      onError={() => setHasPlaybackError(true)}
      className="max-h-80 w-full max-w-md rounded-xl bg-black"
    >
      {t.videoNotSupported}
    </video>
  );
};

export const ChatArea: React.FC<ChatAreaProps> = ({
  channel,
  recipientUser,
  backgroundImage,
  messages,
  currentUser,
  typingUsers,
  lang,
  onSendMessage,
  onSendReaction,
  onTogglePin,
  onDeleteMessage,
  onEditMessage,
  onOpenWhiteboard,
  canVideoCall,
  onStartVideoCall,
  onTyping,
  onMarkAsRead,
}) => {
  const t = translations[lang];

  const [inputText, setInputText] = useState('');
  const [editingMessage, setEditingMessage] = useState<{ id: string; text: string } | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: string; senderName: string; text: string } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Search feature states
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState<SearchFilterType>('all');
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const messageRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [activeMessageActionsId, setActiveMessageActionsId] = useState<string | null>(null);
  const messagePressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Image lightbox preview
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const voiceRecorderRef = useRef<VoiceRecorder | null>(null);
  const recordingTimerRef = useRef<any>(null);

  // File upload input ref
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<any>(null);

  const clearMessagePressTimer = () => {
    if (messagePressTimerRef.current) {
      clearTimeout(messagePressTimerRef.current);
      messagePressTimerRef.current = null;
    }
  };

  const startMessagePress = (event: React.PointerEvent<HTMLDivElement>, messageId: string) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest('button, a, input, textarea, select, [data-message-actions]')
    ) {
      return;
    }

    clearMessagePressTimer();
    messagePressTimerRef.current = setTimeout(() => {
      setActiveMessageActionsId(messageId);
      messagePressTimerRef.current = null;
    }, 500);
  };

  useEffect(() => {
    if (!activeMessageActionsId) return;

    const closeActionsOnOutsidePress = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && !target.closest('[data-message-actions]')) {
        setActiveMessageActionsId(null);
      }
    };

    document.addEventListener('pointerdown', closeActionsOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeActionsOnOutsidePress);
  }, [activeMessageActionsId]);

  useEffect(() => {
    setActiveMessageActionsId(null);
    clearMessagePressTimer();
  }, [channel?.id, recipientUser?.userId]);

  useEffect(() => () => clearMessagePressTimer(), []);

  // Audio playback tracker
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioElementsRef = useRef<{ [key: string]: HTMLAudioElement }>({});

  // Auto scroll to bottom when not actively searching
  const scrollToBottom = (force = false) => {
    if (!showSearch || force) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (!showSearch) {
      scrollToBottom();
    }
  }, [messages.length, channel?.id, recipientUser?.userId]);

  // Automatically notify sender via socket when recipient views unread messages
  useEffect(() => {
    if (!currentUser || !onMarkAsRead) return;

    // Filter incoming unread messages in the active conversation
    const unreadIds = messages
      .filter(
        (m) =>
          m.senderId !== currentUser.userId &&
          m.type !== 'system' &&
          (!m.readBy || !m.readBy[currentUser.userId])
      )
      .map((m) => m.id);

    if (unreadIds.length > 0) {
      onMarkAsRead(unreadIds);
    }
  }, [messages, currentUser?.userId, channel?.id, recipientUser?.userId, onMarkAsRead]);

  // Render message read status indicator ticks (single tick, double tick, double cyan ticks)
  const renderReadStatus = (msg: ChatMessage) => {
    if (msg.senderId !== currentUser?.userId || msg.type === 'system') return null;

    // Direct message read status
    if (recipientUser) {
      const isRead =
        msg.status === 'read' ||
        Boolean(msg.readBy && msg.readBy[recipientUser.userId]);

      if (isRead) {
        return (
          <span
            title={t.msgRead}
            className="inline-flex items-center text-cyan-300 drop-shadow-xs transition-colors ml-0.5"
          >
            <CheckCheck className="w-3.5 h-3.5" />
          </span>
        );
      }

      if (msg.status === 'delivered') {
        return (
          <span
            title={t.msgDelivered}
            className="inline-flex items-center text-slate-400 opacity-90 transition-colors ml-0.5"
          >
            <CheckCheck className="w-3.5 h-3.5" />
          </span>
        );
      }

      return (
        <span
          title={t.msgSent}
          className="inline-flex items-center text-slate-400 opacity-80 transition-colors ml-0.5"
        >
          <Check className="w-3.5 h-3.5" />
        </span>
      );
    }

    // Channel message read status
    const readers = msg.readBy
      ? Object.keys(msg.readBy).filter((uid) => uid !== currentUser?.userId)
      : [];
    const readersCount = readers.length;

    if (readersCount > 0 || msg.status === 'read') {
      return (
        <span
          title={`${t.msgReadBy} ${readersCount || 1}`}
          className="inline-flex items-center text-cyan-300 drop-shadow-xs gap-0.5 transition-colors ml-0.5"
        >
          <CheckCheck className="w-3.5 h-3.5" />
          {readersCount > 1 && (
            <span className="text-[9px] font-mono font-bold leading-none">{readersCount}</span>
          )}
        </span>
      );
    }

    return (
      <span
        title={t.msgSent}
        className="inline-flex items-center text-slate-400 opacity-80 transition-colors ml-0.5"
      >
        <Check className="w-3.5 h-3.5" />
      </span>
    );
  };

  // Keyboard shortcut for search: Ctrl+F or Cmd+F
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      } else if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        setSearchQuery('');
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showSearch]);

  // Focus search input when opened
  useEffect(() => {
    if (showSearch) {
      searchInputRef.current?.focus();
    }
  }, [showSearch]);

  // Handle typing debounce
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    onTyping(true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      onTyping(false);
    }, 1500);
  };

  // Send text message
  const handleSend = () => {
    if (!inputText.trim()) return;

    onSendMessage({
      text: inputText.trim(),
      type: 'text',
      replyTo: replyTo || undefined,
    });

    setInputText('');
    setReplyTo(null);
    setShowEmojiPicker(false);
    onTyping(false);
    soundManager.playSendSound();
    scrollToBottom(true);
  };

  const handleSaveEditedMessage = (event: React.FormEvent) => {
    event.preventDefault();
    const text = editingMessage?.text.trim();
    if (!editingMessage || !text) return;
    onEditMessage(editingMessage.id, text);
    setEditingMessage(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Start voice recording
  const startRecording = async () => {
    const recorder = new VoiceRecorder();
    const success = await recorder.start();
    if (!success) {
      alert(lang === 'km' ? 'សូមអនុញ្ញាត Microphone សម្រាប់ថតសំឡេង!' : 'Please allow microphone access to record audio!');
      return;
    }

    voiceRecorderRef.current = recorder;
    setIsRecording(true);
    setRecordingSeconds(0);

    recordingTimerRef.current = setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);
  };

  // Stop & send voice recording
  const stopAndSendRecording = async () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    const recorder = voiceRecorderRef.current;
    if (!recorder) return;

    setIsRecording(false);
    const result = await recorder.stop();
    if (result && result.base64) {
      try {
        const mimeType = result.mimeType || 'audio/webm';
        const fileExtension = getMimeExtension(mimeType);

        setIsUploading(true);
        // Upload voice note directly to local LAN server using the actual recorded mime type.
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `voice-${Date.now()}${fileExtension}`,
            type: mimeType,
            data: result.base64,
          }),
        });

        const data = await res.json();
        if (data.url) {
          onSendMessage({
            text: `🎙️ ${t.audioMessage} (${recordingSeconds}s)`,
            type: 'audio',
            fileUrl: data.url,
            fileName: data.fileName,
            fileSize: data.fileSize,
            fileType: mimeType,
            replyTo: replyTo || undefined,
          });
          soundManager.playSendSound();
          scrollToBottom(true);
        }
      } catch (err) {
        console.error('Audio upload failed:', err);
      } finally {
        setIsUploading(false);
      }
    }
    setReplyTo(null);
  };

  // Cancel recording
  const cancelRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    voiceRecorderRef.current?.cancel();
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  // Handle local file sharing (images, PDFs, documents)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      alert(lang === 'km' ? 'ឯកសារធំពេក (អតិបរមា 50MB)!' : 'File is too large (max 50MB)!');
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = reader.result as string;
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: file.name,
            type: file.type,
            data: base64Data.slice(base64Data.indexOf(',') + 1),
          }),
        });

        const data = await res.json();
        if (data.url) {
          onSendMessage({
            text: '',
            type: 'file',
            fileUrl: data.url,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            replyTo: replyTo || undefined,
          });
          soundManager.playSendSound();
          scrollToBottom(true);
        }
      } catch (err) {
        console.error('Upload failed:', err);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  // Format file size
  const formatBytes = (bytes?: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  // Format audio seconds
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Play audio toggle
  const togglePlayAudio = (msgId: string, url: string) => {
    let audio = audioElementsRef.current[msgId];
    if (!audio) {
      audio = new Audio(url);
      audioElementsRef.current[msgId] = audio;
      audio.onended = () => setPlayingAudioId(null);
      audio.onerror = () => {
        setPlayingAudioId(null);
      };
    }

    if (playingAudioId === msgId) {
      audio.pause();
      setPlayingAudioId(null);
    } else {
      // Pause all other audios
      Object.values(audioElementsRef.current).forEach((a) => a.pause());
      audio.play().catch((err) => {
        console.error('Audio playback error:', err);
        setPlayingAudioId(null);
      });
      setPlayingAudioId(msgId);
    }
  };

  // Filter messages by search, type filter, or pinned
  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      // Pinned check
      if (showPinnedOnly && !m.isPinned) return false;

      // Type filter check
      if (searchFilter === 'files') {
        if (m.type !== 'file' || m.fileType?.startsWith('image/')) return false;
      } else if (searchFilter === 'images') {
        if (m.type !== 'file' || !m.fileType?.startsWith('image/')) return false;
      } else if (searchFilter === 'voice') {
        if (m.type !== 'audio') return false;
      } else if (searchFilter === 'sketches') {
        if (m.type !== 'sketch') return false;
      } else if (searchFilter === 'text') {
        if (m.type !== 'text') return false;
      }

      // Keyword query check
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchText = m.text?.toLowerCase().includes(q);
        const matchSender = m.senderName?.toLowerCase().includes(q);
        const matchFile = m.fileName?.toLowerCase().includes(q);
        return matchText || matchSender || matchFile;
      }

      return true;
    });
  }, [messages, showPinnedOnly, searchFilter, searchQuery]);

  // Keep track of matched indices for navigation
  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [searchQuery, searchFilter]);

  // Jump to specific match in the message stream
  const jumpToMatch = (index: number) => {
    if (filteredMessages.length === 0) return;
    const targetMsg = filteredMessages[index];
    if (targetMsg) {
      const el = messageRefs.current[targetMsg.id];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  const handleNextMatch = () => {
    if (filteredMessages.length === 0) return;
    const nextIdx = (currentMatchIndex + 1) % filteredMessages.length;
    setCurrentMatchIndex(nextIdx);
    jumpToMatch(nextIdx);
  };

  const handlePrevMatch = () => {
    if (filteredMessages.length === 0) return;
    const prevIdx = (currentMatchIndex - 1 + filteredMessages.length) % filteredMessages.length;
    setCurrentMatchIndex(prevIdx);
    jumpToMatch(prevIdx);
  };

  // Helper to highlight matching text in message content
  const renderHighlightedText = (text: string, query: string) => {
    if (!query.trim()) return text;

    const trimmed = query.trim();
    // Escape regex characters
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) =>
      part.toLowerCase() === trimmed.toLowerCase() ? (
        <mark
          key={i}
          className="bg-amber-400 text-slate-950 font-semibold px-1 rounded-sm shadow-xs"
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const pinnedCount = messages.filter((m) => m.isPinned).length;

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col h-full bg-slate-950 overflow-hidden relative"
      style={backgroundImage ? {
        backgroundImage: `linear-gradient(rgba(2, 6, 23, 0.62), rgba(2, 6, 23, 0.72)), url("${backgroundImage}")`,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
        backgroundAttachment: 'fixed',
      } : undefined}
    >
      {/* Top Header */}
      <div className="px-3 py-2.5 sm:px-6 sm:py-3.5 border-b border-slate-800 bg-slate-900/60 backdrop-blur-md flex items-center justify-between gap-2 shrink-0 z-10">
        <div className="flex items-center space-x-3 min-w-0">
          {recipientUser ? (
            /* Direct Message Header */
            <div className="flex items-center space-x-3 min-w-0">
              <div className="relative shrink-0">
                <div
                  style={{ backgroundColor: recipientUser.avatarColor }}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow-sm"
                >
                  {recipientUser.avatarImage ? (
                    <img src={recipientUser.avatarImage} alt="" className="h-full w-full rounded-xl object-cover" />
                  ) : recipientUser.avatarEmoji}
                </div>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-slate-900 ${
                    recipientUser.status === 'online'
                      ? 'bg-emerald-500'
                      : recipientUser.status === 'away'
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`}
                />
              </div>
              <div className="min-w-0">
                <h2 className="text-slate-100 font-bold text-base truncate flex items-center gap-2">
                  <span>{recipientUser.username}</span>
                  {recipientUser.role === 'admin' && (
                    <span className="hidden min-[380px]:inline-flex text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 px-1.5 py-0.5 rounded font-mono">
                      ADMIN
                    </span>
                  )}
                  <span className="hidden min-[380px]:inline-flex text-xs px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full font-medium">
                    1-on-1 LAN
                  </span>
                </h2>
                <p className="text-xs text-slate-400 truncate">
                  {recipientUser.customStatus ||
                    (recipientUser.status === 'online' ? t.online : recipientUser.status)}
                </p>
              </div>
            </div>
          ) : (
            /* Channel Header */
            <div className="min-w-0">
              <h2 className="text-slate-100 font-bold text-base flex items-center gap-2 truncate">
                <span className="text-indigo-400 font-mono text-lg">#</span>
                <span>
                  {channel && lang === 'km' && channel.nameKm
                    ? channel.nameKm
                    : channel?.name || 'general'}
                </span>
              </h2>
              <p className="text-xs text-slate-400 truncate">
                {channel && lang === 'km' && channel.descriptionKm
                  ? channel.descriptionKm
                  : channel?.description || ''}
              </p>
            </div>
          )}
        </div>

        {/* Header Tools */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {recipientUser && (
            <button
              type="button"
              onClick={onStartVideoCall}
              disabled={!canVideoCall}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-2 py-1.5 sm:px-2.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              title={canVideoCall ? t.videoCall : t.callUnavailable}
              aria-label={t.videoCall}
            >
              <Video className="h-4 w-4" />
              <span className="hidden sm:inline">{t.videoCall}</span>
            </button>
          )}

          {/* Whiteboard Button */}
          <button
            onClick={onOpenWhiteboard}
            className="flex items-center gap-1.5 px-2 py-1.5 sm:px-3 bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-500/20 rounded-xl text-xs font-medium transition cursor-pointer"
            title={t.whiteboard}
          >
            <Palette className="w-4 h-4 text-purple-400" />
            <span className="hidden sm:inline">{t.whiteboard}</span>
          </button>

          {/* Pinned Messages Filter */}
          <button
            onClick={() => setShowPinnedOnly(!showPinnedOnly)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${
              showPinnedOnly
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            title={t.pinnedMessages}
          >
            <Pin className="w-3.5 h-3.5" />
            {pinnedCount > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-500/30 text-amber-200 text-[10px] rounded-full font-bold">
                {pinnedCount}
              </span>
            )}
          </button>

          {/* Search Toggle Button */}
          <button
            onClick={() => {
              const nextState = !showSearch;
              setShowSearch(nextState);
              if (!nextState) {
                setSearchQuery('');
                setSearchFilter('all');
              }
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${
              showSearch || searchQuery.trim()
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            title={`${t.searchMessages} (Ctrl+F)`}
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.searchMessages.replace('...', '')}</span>
          </button>
        </div>
      </div>

      {/* Advanced Collapsible Search Bar with Filters & Navigation */}
      {showSearch && (
        <div className="px-4 sm:px-6 py-3 bg-slate-900 border-b border-slate-800 space-y-2.5 animate-in slide-in-from-top-3 duration-200 shadow-xl shrink-0">
          {/* Main Search Input & Navigation Controls */}
          <div className="flex items-center gap-2.5">
            <div className="relative flex-1 flex items-center bg-slate-950 border border-slate-800 focus-within:border-indigo-500 rounded-xl px-3 py-1.5 transition">
              <Search className="w-4 h-4 text-indigo-400 shrink-0 mr-2.5" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="p-1 text-slate-400 hover:text-slate-100 rounded transition cursor-pointer"
                  title={t.clearSearch}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Results Match Count & Prev/Next Arrows */}
            {searchQuery.trim() && (
              <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 text-xs font-mono shrink-0">
                <span className="text-slate-300 font-semibold">
                  {filteredMessages.length > 0 ? `${currentMatchIndex + 1}/${filteredMessages.length}` : '0'}
                </span>
                <span className="text-slate-500 text-[10px]">
                  {t.matchesFound}
                </span>

                <div className="flex items-center gap-0.5 ml-1 border-l border-slate-800 pl-1.5">
                  <button
                    onClick={handlePrevMatch}
                    disabled={filteredMessages.length === 0}
                    className="p-1 text-slate-400 hover:text-slate-100 disabled:opacity-30 rounded hover:bg-slate-800 transition cursor-pointer"
                    title={t.prevMatch}
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleNextMatch}
                    disabled={filteredMessages.length === 0}
                    className="p-1 text-slate-400 hover:text-slate-100 disabled:opacity-30 rounded hover:bg-slate-800 transition cursor-pointer"
                    title={t.nextMatch}
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Close Search Button */}
            <button
              onClick={() => {
                setShowSearch(false);
                setSearchQuery('');
                setSearchFilter('all');
              }}
              className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition cursor-pointer shrink-0"
              title="Close search (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Filter Chips */}
          <div className="flex items-center gap-1.5 flex-wrap text-xs pt-0.5">
            <span className="text-slate-500 text-[11px] font-medium flex items-center gap-1 mr-1">
              <SlidersHorizontal className="w-3 h-3" />
              {lang === 'km' ? 'ចម្រាញ់តាម៖' : 'Filter by:'}
            </span>

            {[
              { id: 'all', label: t.filterAll },
              { id: 'text', label: lang === 'km' ? 'អត្ថបទ' : 'Text' },
              { id: 'images', label: t.filterMedia },
              { id: 'files', label: t.filterFiles },
              { id: 'voice', label: t.filterVoice },
              { id: 'sketches', label: t.filterSketches },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setSearchFilter(id as SearchFilterType)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  searchFilter === id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {label}
              </button>
            ))}

            {/* Clear All Filters Button */}
            {(searchQuery.trim() || searchFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchFilter('all');
                }}
                className="ml-auto text-[11px] text-slate-400 hover:text-indigo-400 underline underline-offset-2 transition cursor-pointer"
              >
                {t.clearSearch}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Message Stream */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 sm:px-6 py-4 sm:py-6 space-y-3 sm:space-y-4">
        {filteredMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-2xl">
              {searchQuery.trim() ? '🔍' : '💬'}
            </div>
            <p className="text-sm font-medium text-slate-400 max-w-sm">
              {searchQuery.trim()
                ? `${t.noMatches} "${searchQuery}"`
                : showPinnedOnly
                ? t.noPinnedMessages
                : t.noMessagesYet}
            </p>
            {searchQuery.trim() && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchFilter('all');
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-400 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                {t.clearSearch}
              </button>
            )}
          </div>
        ) : (
          filteredMessages.map((msg, index) => {
            const isMe = msg.senderId === currentUser?.userId;
            const isSystem = msg.type === 'system';
            const isCurrentSearchMatch =
              searchQuery.trim() &&
              filteredMessages[currentMatchIndex]?.id === msg.id;

            if (isSystem) {
              return (
                <div
                  key={msg.id}
                  ref={(el) => {
                    messageRefs.current[msg.id] = el;
                  }}
                  className="flex justify-center my-2"
                >
                  <div
                    className={`flex items-center gap-2 px-3 py-1 rounded-full text-[11px] shadow-sm transition ${
                      isCurrentSearchMatch
                        ? 'bg-amber-500/20 border-2 border-amber-400 text-amber-200'
                        : 'bg-slate-900/80 border border-slate-800 text-slate-400'
                    }`}
                  >
                    <span>{msg.senderAvatar?.emoji || 'ℹ️'}</span>
                    <span>{renderHighlightedText(msg.text, searchQuery)}</span>
                    <span className="text-slate-600 font-mono">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                ref={(el) => {
                  messageRefs.current[msg.id] = el;
                }}
                onPointerDown={(event) => startMessagePress(event, msg.id)}
                onPointerUp={clearMessagePressTimer}
                onPointerCancel={clearMessagePressTimer}
                onPointerLeave={clearMessagePressTimer}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setActiveMessageActionsId(msg.id);
                }}
                className={`group relative flex gap-3 transition-all duration-300 rounded-2xl p-1 ${
                  isCurrentSearchMatch
                    ? 'ring-2 ring-amber-400/80 bg-amber-500/10'
                    : ''
                } ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar */}
                <div className="shrink-0 self-end mb-1">
                  <div
                    style={{ backgroundColor: msg.senderAvatar?.color || '#6366f1' }}
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shadow-sm"
                  >
                    {msg.senderAvatar?.image ? (
                      <img src={msg.senderAvatar.image} alt="" className="h-full w-full rounded-xl object-cover" />
                    ) : msg.senderAvatar?.emoji || '👤'}
                  </div>
                </div>

                {/* Message Body Container */}
                <div className={`max-w-[85%] sm:max-w-[70%] space-y-1 ${isMe ? 'items-end' : 'items-start'}`}>
                  {/* Sender Name & Timestamp */}
                  <div
                    className={`flex items-center gap-2 text-[11px] text-slate-400 px-1 ${
                      isMe ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <span className="font-semibold text-slate-300">
                      {isMe ? t.you : renderHighlightedText(msg.senderName, searchQuery)}
                    </span>
                    <span className="text-slate-500 font-mono text-[10px] flex items-center gap-1">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {isMe && renderReadStatus(msg)}
                    </span>
                    {msg.isPinned && (
                      <span className="text-amber-400 flex items-center gap-0.5 text-[10px]">
                        <Pin className="w-2.5 h-2.5 fill-amber-400" />
                      </span>
                    )}
                  </div>

                  {/* Reply Quote Banner */}
                  {msg.replyTo && (
                    <div
                      className={`text-xs px-2.5 py-1.5 rounded-lg border text-slate-300 mb-1 flex items-center gap-1.5 max-w-full truncate ${
                        isMe
                          ? 'bg-indigo-950/40 border-indigo-800/60 text-right'
                          : 'bg-slate-900 border-slate-800 text-left'
                      }`}
                    >
                      <Reply className="w-3 h-3 text-indigo-400 shrink-0" />
                      <span className="font-semibold text-indigo-300 shrink-0">
                        {msg.replyTo.senderName}:
                      </span>
                      <span className="truncate opacity-80">{msg.replyTo.text}</span>
                    </div>
                  )}

                  {/* Message Bubble Content */}
                  <div
                    className={`relative p-3.5 rounded-2xl shadow-md text-sm leading-relaxed break-words ${
                      isMe
                        ? 'bg-indigo-600 text-white rounded-br-none'
                        : 'bg-slate-900 border border-slate-800 text-slate-100 rounded-bl-none'
                    }`}
                  >
                    {/* 1. Voice Audio Clip */}
                    {msg.type === 'audio' && msg.fileUrl && (
                      <div className="flex items-center gap-3 p-1">
                        <button
                          onClick={() => togglePlayAudio(msg.id, msg.fileUrl!)}
                          className={`w-10 h-10 rounded-full flex items-center justify-center transition cursor-pointer shadow-md ${
                            isMe
                              ? 'bg-white text-indigo-600 hover:bg-slate-100'
                              : 'bg-indigo-600 text-white hover:bg-indigo-500'
                          }`}
                        >
                          {playingAudioId === msg.id ? (
                            <Pause className="w-4 h-4 fill-current" />
                          ) : (
                            <Play className="w-4 h-4 fill-current ml-0.5" />
                          )}
                        </button>
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold">{t.audioMessage}</span>
                          <span className="text-[11px] opacity-75">{formatBytes(msg.fileSize)}</span>
                        </div>
                      </div>
                    )}

                    {/* 2. File Attachment */}
                    {msg.type === 'file' && msg.fileUrl && (
                      <div className="space-y-2">
                        {msg.fileType?.startsWith('image/') ? (
                          <div className="relative group/img rounded-xl overflow-hidden cursor-pointer max-w-md bg-slate-950">
                            <img
                              src={msg.fileUrl}
                              alt={t.previewImage}
                              className="w-full max-h-72 object-cover rounded-xl transition hover:opacity-95"
                              onClick={() => setPreviewImage(msg.fileUrl!)}
                            />
                            <button
                              onClick={() => setPreviewImage(msg.fileUrl!)}
                              className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg opacity-0 group-hover/img:opacity-100 transition"
                            >
                              <Maximize2 className="w-4 h-4" />
                            </button>
                          </div>
                        ) : msg.fileType?.startsWith('video/') ? (
                          <VideoAttachment src={msg.fileUrl} fileName={msg.fileName} lang={lang} />
                        ) : (
                          <div
                            className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border ${
                              isMe
                                ? 'bg-indigo-700/60 border-indigo-500/50'
                                : 'bg-slate-950 border-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="p-2 bg-indigo-500/20 text-indigo-300 rounded-lg shrink-0">
                                <FileText className="w-5 h-5" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] text-slate-400">
                                  {formatBytes(msg.fileSize)}
                                </p>
                              </div>
                            </div>
                            <a
                              href={msg.fileUrl}
                              download={msg.fileName || 'download'}
                              className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition shrink-0 cursor-pointer"
                              title={t.downloadFile}
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 3. Whiteboard Sketch */}
                    {msg.type === 'sketch' && msg.fileUrl && (
                      <div className="space-y-1.5">
                        <div
                          onClick={() => setPreviewImage(msg.fileUrl!)}
                          className="rounded-xl overflow-hidden bg-[#090d16] border border-slate-800 cursor-pointer hover:border-purple-500/50 transition p-1"
                        >
                          <img
                            src={msg.fileUrl}
                            alt="Whiteboard Sketch"
                            className="w-full max-h-64 object-contain rounded-lg"
                          />
                        </div>
                        <p className="text-[11px] text-purple-300 font-medium flex items-center gap-1">
                          <Palette className="w-3 h-3" />
                          <span>{t.whiteboardTitle}</span>
                        </p>
                      </div>
                    )}

                    {/* 4. Regular Text Message */}
                    {msg.type === 'text' && (
                      editingMessage?.id === msg.id ? (
                        <form onSubmit={handleSaveEditedMessage} className="min-w-[220px] space-y-2">
                          <textarea
                            autoFocus
                            value={editingMessage.text}
                            onChange={(event) =>
                              setEditingMessage((current) =>
                                current ? { ...current, text: event.target.value } : current
                              )
                            }
                            aria-label={t.editMessage}
                            rows={Math.min(5, Math.max(2, editingMessage.text.split('\n').length))}
                            className="w-full resize-y rounded-lg border border-indigo-400/50 bg-slate-950/80 px-2.5 py-2 text-sm text-white outline-none focus:border-indigo-400"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingMessage(null)}
                              className="rounded-lg px-2.5 py-1 text-xs text-slate-300 transition hover:bg-slate-800"
                            >
                              {t.cancel}
                            </button>
                            <button
                              type="submit"
                              disabled={!editingMessage.text.trim()}
                              className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {t.saveEdit}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="whitespace-pre-wrap select-text">
                          {renderHighlightedText(msg.text, searchQuery)}
                        </div>
                      )
                    )}

                    {/* Timestamp and read status ticks inside bubble */}
                    <div
                      className={`flex items-center justify-end gap-1 text-[10px] font-mono pt-1 select-none ${
                        isMe ? 'text-indigo-200/80' : 'text-slate-500'
                      }`}
                    >
                      <span>
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {isMe && renderReadStatus(msg)}
                    </div>
                  </div>

                  {/* Reaction Badges Row */}
                  {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {Object.entries(msg.reactions).map(([emoji, reacters]) => {
                        const hasReacted = currentUser && reacters.includes(currentUser.username);
                        return (
                          <button
                            key={emoji}
                            onClick={() => onSendReaction(msg.id, emoji)}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition cursor-pointer border ${
                              hasReacted
                                ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200'
                                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                            }`}
                            title={reacters.join(', ')}
                          >
                            <span>{emoji}</span>
                            <span className="text-[10px] font-mono">{reacters.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {activeMessageActionsId === msg.id && (
                  <div
                    data-message-actions
                    className={`absolute top-0 z-20 flex max-w-[calc(100vw-4rem)] flex-wrap items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-1.5 py-1 shadow-xl ${
                      isMe ? 'right-12' : 'left-12'
                    }`}
                  >
                    {/* Quick Reactions */}
                    {QUICK_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => {
                          setActiveMessageActionsId(null);
                          onSendReaction(msg.id, emoji);
                        }}
                        className="hover:scale-125 transition-transform text-xs p-1 cursor-pointer"
                        aria-label={`React ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}

                    <div className="w-px h-3.5 bg-slate-800 mx-0.5" />

                    {/* Reply Button */}
                    <button
                      onClick={() => {
                        setReplyTo({ id: msg.id, senderName: msg.senderName, text: msg.text });
                        setActiveMessageActionsId(null);
                      }}
                      className="p-1 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800 transition cursor-pointer"
                      title={t.replyingTo}
                      aria-label={t.replyingTo}
                    >
                      <Reply className="w-3.5 h-3.5" />
                    </button>

                    {/* Pin Button */}
                    <button
                      onClick={() => {
                        onTogglePin(msg.id);
                        setActiveMessageActionsId(null);
                      }}
                      className={`flex items-center gap-1 rounded px-1.5 py-1 text-[11px] transition hover:bg-slate-800 cursor-pointer ${
                        msg.isPinned ? 'text-amber-400' : 'text-slate-400 hover:text-slate-100'
                      }`}
                      title={msg.isPinned ? t.unpinMessage : t.pinMessage}
                    >
                      <Pin className="w-3.5 h-3.5" />
                      <span>{msg.isPinned ? t.unpinMessage : t.pinMessage}</span>
                    </button>

                    {isMe && (
                      msg.type === 'text' && (
                        <button
                          onClick={() => {
                            setActiveMessageActionsId(null);
                            setEditingMessage({ id: msg.id, text: msg.text });
                          }}
                          className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 cursor-pointer"
                          title={t.editMessage}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>{t.editMessage}</span>
                        </button>
                      )
                    )}

                    {isMe && (
                      <button
                        onClick={() => {
                          setActiveMessageActionsId(null);
                          if (window.confirm(t.confirmDeleteMessage)) {
                            onDeleteMessage(msg.id);
                          }
                        }}
                        className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-rose-400 transition hover:bg-rose-500/10 hover:text-rose-300 cursor-pointer"
                        title={t.deleteMessage}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{t.deleteMessage}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing Indicator Bar */}
      {typingUsers.length > 0 && (
        <div className="px-6 py-1 bg-slate-950/80 text-[11px] text-indigo-400 font-medium flex items-center gap-1.5 animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
          <span>
            {typingUsers.join(', ')} {t.typing}
          </span>
        </div>
      )}

      {/* Reply-To Preview Bar */}
      {replyTo && (
        <div className="px-6 py-2 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 truncate text-slate-300">
            <Reply className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="font-semibold text-indigo-400">{t.replyingTo} {replyTo.senderName}:</span>
            <span className="truncate opacity-80">{replyTo.text}</span>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="p-1 text-slate-400 hover:text-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* File Uploading Progress Indicator */}
      {isUploading && (
        <div className="px-6 py-2 bg-indigo-950/80 border-t border-indigo-500/30 flex items-center gap-2 text-xs text-indigo-300 animate-pulse">
          <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
          <span>{lang === 'km' ? 'កំពុងផ្ទុកឡើងឯកសារ...' : 'Uploading file to local network...'}</span>
        </div>
      )}

      {/* Bottom Message Input Bar */}
      <div className="p-2.5 sm:p-4 border-t border-slate-800 bg-slate-900/80 backdrop-blur-md shrink-0">
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Voice Recording Mode View */}
        {isRecording ? (
          <div className="flex items-center justify-between p-3 bg-rose-950/40 border border-rose-500/40 rounded-2xl animate-pulse">
            <div className="flex items-center space-x-3 text-rose-300">
              <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
              <span className="font-semibold text-sm">{t.recording}</span>
              <span className="font-mono text-sm font-bold bg-rose-900/60 px-2 py-0.5 rounded-lg border border-rose-700/60">
                {formatTime(recordingSeconds)}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={cancelRecording}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition cursor-pointer"
              >
                {t.cancelRecord}
              </button>
              <button
                onClick={stopAndSendRecording}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold transition cursor-pointer shadow-md shadow-rose-600/30"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{t.sendRecord}</span>
              </button>
            </div>
          </div>
        ) : (
          /* Normal Message Input View */
          <div className="flex flex-col space-y-2">
            {/* Popover Emoji Picker */}
            {showEmojiPicker && (
              <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-wrap gap-2 max-w-sm mb-1 animate-in zoom-in-95 duration-100">
                {PICKER_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      setInputText((prev) => prev + emoji);
                      setShowEmojiPicker(false);
                    }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-slate-800 transition hover:scale-110 cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-end gap-1.5 sm:gap-2 bg-slate-950 border border-slate-800 focus-within:border-indigo-500/80 rounded-2xl p-2 transition">
              {/* Media & Tools Buttons */}
              <div className="flex items-center space-x-0.5 sm:space-x-1 self-start sm:self-end sm:pb-1 text-slate-400">
                {/* File Upload */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="p-1.5 sm:p-2 hover:text-indigo-400 hover:bg-slate-900 rounded-xl transition cursor-pointer disabled:opacity-50"
                  title={t.uploadFile}
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                {/* Whiteboard / Canvas */}
                <button
                  type="button"
                  onClick={onOpenWhiteboard}
                  className="hidden min-[380px]:block p-1.5 sm:p-2 hover:text-purple-400 hover:bg-slate-900 rounded-xl transition cursor-pointer"
                  title={t.whiteboard}
                >
                  <Palette className="w-4 h-4" />
                </button>

                {/* Emoji Picker */}
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="p-1.5 sm:p-2 hover:text-amber-400 hover:bg-slate-900 rounded-xl transition cursor-pointer"
                  title="Emoji"
                >
                  <Smile className="w-4 h-4" />
                </button>

                {/* Voice Note */}
                <button
                  type="button"
                  onClick={startRecording}
                  className="p-1.5 sm:p-2 hover:text-rose-400 hover:bg-slate-900 rounded-xl transition cursor-pointer"
                  title={t.voiceHoldToRecord}
                >
                  <Mic className="w-4 h-4" />
                </button>
              </div>

              <div className="flex w-full min-w-0 items-end gap-2 sm:flex-1">
                {/* Text Area */}
                <textarea
                  value={inputText}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={t.typeMessage}
                  rows={1}
                  className="min-w-0 flex-1 bg-transparent text-slate-100 placeholder-slate-500 text-sm px-2 py-2 focus:outline-none resize-none max-h-32 min-h-[38px] leading-relaxed"
                />

                {/* Send Button */}
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!inputText.trim()}
                  className={`p-2.5 rounded-xl transition cursor-pointer self-end ${
                    inputText.trim()
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                  title={t.send}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Lightbox Modal for Image Preview */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md cursor-zoom-out animate-in fade-in duration-150"
        >
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-5 right-5 p-2 bg-slate-800/80 text-white rounded-full hover:bg-slate-700 transition"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={previewImage}
            alt="Preview"
            className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl"
          />
        </div>
      )}
    </div>
  );
};
