import React, { useState } from 'react';
import {
  Wifi,
  WifiOff,
  Hash,
  Plus,
  Users,
  QrCode,
  Home,
  Trash2,
  Settings,
  Volume2,
  VolumeX,
  Laptop,
  Smartphone,
  Tablet,
  Monitor,
  FolderDown,
  Palette,
  MessageSquare,
  Sparkles,
  LogOut,
  UserPlus,
  Search,
  UserMinus,
  Ban,
  Unlock,
} from 'lucide-react';
import { User, Friend, FriendSearchResult, Channel } from '../types/chat';
import { Language, translations } from '../translations';
import { soundManager } from '../utils/audio';

interface SidebarProps {
  channels: Channel[];
  activeChannelId: string;
  onSelectChannel: (channelId: string) => void;
  onBackToWelcome: () => void;
  onDeleteChannel: (channelId: string) => void;
  users: User[];
  friends: Friend[];
  blockedUsers: Friend[];
  unreadCounts: Record<string, number>;
  currentUser: User | null;
  activeDmUserId: string | null;
  onSelectDmUser: (userId: string) => void;
  onSearchUsers: (username: string) => Promise<{ success: boolean; users: FriendSearchResult[]; message?: string }>;
  onAddFriend: (username: string) => Promise<{ success: boolean; message: string }>;
  onRemoveFriend: (friendId: string) => Promise<{ success: boolean; message?: string }>;
  onBlockFriend: (friendId: string) => Promise<{ success: boolean; message?: string }>;
  onUnblockUser: (userId: string) => Promise<{ success: boolean; message?: string }>;
  isConnected: boolean;
  latency: number;
  lang: Language;
  onToggleLang: () => void;
  onOpenConnectModal: () => void;
  onOpenProfileModal: () => void;
  onOpenCreateChannelModal: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onLogout: () => void;
}

const getDeviceIcon = (device?: string) => {
  switch (device) {
    case 'mobile':
      return <Smartphone className="w-3 h-3" />;
    case 'tablet':
      return <Tablet className="w-3 h-3" />;
    case 'desktop':
      return <Monitor className="w-3 h-3" />;
    default:
      return <Laptop className="w-3 h-3" />;
  }
};

const getChannelIcon = (id: string) => {
  if (id === 'files-hub') return <FolderDown className="w-4 h-4 text-emerald-400" />;
  if (id === 'whiteboard-room') return <Palette className="w-4 h-4 text-purple-400" />;
  return <Hash className="w-4 h-4 text-indigo-400" />;
};

export const Sidebar: React.FC<SidebarProps> = ({
  channels,
  activeChannelId,
  onSelectChannel,
  onBackToWelcome,
  onDeleteChannel,
  users,
  friends,
  blockedUsers,
  unreadCounts,
  currentUser,
  activeDmUserId,
  onSelectDmUser,
  onSearchUsers,
  onAddFriend,
  onRemoveFriend,
  onBlockFriend,
  onUnblockUser,
  isConnected,
  latency,
  lang,
  onToggleLang,
  onOpenConnectModal,
  onOpenProfileModal,
  onOpenCreateChannelModal,
  soundEnabled,
  onToggleSound,
  onLogout,
}) => {
  const t = translations[lang];
  const [friendUsername, setFriendUsername] = useState('');
  const [friendMessage, setFriendMessage] = useState('');
  const [searchResults, setSearchResults] = useState<FriendSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addingFriendId, setAddingFriendId] = useState<string | null>(null);
  const [friendActionId, setFriendActionId] = useState<string | null>(null);

  const handleSearchUsers = async (event: React.FormEvent) => {
    event.preventDefault();
    if (friendUsername.trim().length < 2 || isSearching) return;

    setIsSearching(true);
    setFriendMessage('');
    try {
      const result = await onSearchUsers(friendUsername);
      setSearchResults(result.users);
      setFriendMessage(result.message || '');
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddFriend = async (result: FriendSearchResult) => {
    if (result.isFriend || addingFriendId) return;
    setAddingFriendId(result.userId);
    setFriendMessage('');
    try {
      const response = await onAddFriend(result.handle);
      setFriendMessage(response.message);
      if (response.success) {
        setSearchResults((previous) =>
          previous.map((user) => user.userId === result.userId ? { ...user, isFriend: true } : user)
        );
      }
    } finally {
      setAddingFriendId(null);
    }
  };

  const handleFriendAction = async (
    friend: Friend,
    action: 'remove' | 'block' | 'unblock'
  ) => {
    if (friendActionId) return;
    const confirmations = {
      remove: t.confirmRemoveFriend,
      block: t.confirmBlockUser,
      unblock: t.confirmUnblockUser,
    };
    if (!window.confirm(`${confirmations[action]} ${friend.username}?`)) return;

    setFriendActionId(friend.userId);
    setFriendMessage('');
    try {
      const callback = action === 'remove'
        ? onRemoveFriend
        : action === 'block'
          ? onBlockFriend
          : onUnblockUser;
      const result = await callback(friend.userId);
      setFriendMessage(result.success
        ? action === 'remove'
          ? t.friendRemoved
          : action === 'block'
            ? t.userBlocked
            : t.userUnblocked
        : result.message || t.friendActionFailed);
    } finally {
      setFriendActionId(null);
    }
  };

  return (
    <aside className="w-[min(18rem,calc(100vw-2rem))] bg-slate-900 border-r border-slate-800 flex flex-col h-full select-none shrink-0 z-20">
      {/* App Branding & LAN Status */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <img
              src="/bright-mind-logo.png"
              alt="Bright Mind"
              className="h-10 w-10 shrink-0 rounded-xl object-contain"
            />
            <div className="min-w-0">
              <h1 className="flex items-center gap-1.5 whitespace-nowrap text-base font-bold leading-tight tracking-tight text-slate-100">
                Bright Mind
              </h1>
              <p className="truncate text-[10px] font-medium leading-4 text-indigo-300" title={t.appSubtitle}>
                {t.appSubtitle}
              </p>
            </div>
          </div>

          {/* Quick controls: Sound & Language */}
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={onToggleSound}
              title={t.soundToggle}
              aria-label={t.soundToggle}
              className={`rounded-lg p-2 transition cursor-pointer ${
                soundEnabled ? 'text-indigo-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-800'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              onClick={onToggleLang}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-200 transition hover:bg-slate-700 cursor-pointer"
            >
              {lang === 'km' ? 'EN' : 'ខ្មែរ'}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onBackToWelcome}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-500/25 bg-gradient-to-r from-indigo-600/15 to-violet-600/15 px-3 py-2 text-xs font-semibold text-indigo-200 transition hover:border-indigo-400/50 hover:from-indigo-600/25 hover:to-violet-600/25 hover:text-white cursor-pointer"
        >
          <Home className="h-4 w-4" />
          <span>{t.backToWelcome}</span>
        </button>

        {/* Local Wi-Fi Connection Pill & QR trigger */}
        <div className="flex items-center justify-between p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl">
          <div className="flex items-center space-x-2 text-xs">
            {isConnected ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
            ) : (
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500"></span>
            )}
            <div className="flex flex-col">
              <span className="font-semibold text-slate-200 leading-none">
                {isConnected ? t.connectedLAN : t.offline}
              </span>
              {isConnected && latency > 0 && (
                <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                  {t.latency}: {latency}ms
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onOpenConnectModal}
            title={t.scanToJoin}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-medium transition cursor-pointer"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>QR</span>
          </button>
        </div>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {/* Channels Section */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <span>{t.channels}</span>
            <button
              onClick={onOpenCreateChannelModal}
              title={t.addChannel}
              className="p-1 hover:text-slate-100 hover:bg-slate-800 rounded-md transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-0.5">
            {channels.map((ch) => {
              const isActive = activeDmUserId === null && activeChannelId === ch.id;
              const displayName = lang === 'km' && ch.nameKm ? ch.nameKm : ch.name;
              const unreadCount = unreadCounts[`channel:${ch.id}`] || 0;
              const canDeleteChannel = !ch.isDefault && (
                ch.createdById === currentUser?.userId || currentUser?.role === 'admin'
              );

              return (
                <div
                  key={ch.id}
                  className={`group flex w-full items-center rounded-xl text-xs font-medium transition ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-slate-100'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectChannel(ch.id)}
                    className="flex min-w-0 flex-1 items-center justify-between rounded-xl px-3 py-2 text-left"
                  >
                    <span className="flex min-w-0 items-center space-x-2.5 truncate">
                      {getChannelIcon(ch.id)}
                      <span className="truncate">{displayName}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {unreadCount > 0 && (
                        <span
                          aria-label={`${unreadCount} ${t.unreadMessages}`}
                          className="min-w-5 rounded-full bg-rose-500 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white"
                        >
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                      {ch.isDefault && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-normal">
                          LAN
                        </span>
                      )}
                    </span>
                  </button>
                  {canDeleteChannel && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(t.confirmDeleteChannel)) onDeleteChannel(ch.id);
                      }}
                      title={t.deleteChannel}
                      aria-label={`${t.deleteChannel}: ${displayName}`}
                      className="mr-1.5 shrink-0 rounded-lg p-1.5 text-slate-400 opacity-100 transition hover:bg-rose-500/20 hover:text-rose-300 focus:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Peers / Direct Messages Section */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              <span>{t.friends}</span>
            </span>
            <span className="text-[10px] font-mono text-emerald-400 font-bold">
              {friends.length}
            </span>
          </div>

          <form onSubmit={handleSearchUsers} className="flex gap-1.5 px-1 pb-2">
            <input
              value={friendUsername}
              onChange={(event) => {
                setFriendUsername(event.target.value);
                setFriendMessage('');
                setSearchResults([]);
              }}
              placeholder={t.searchUsername}
              aria-label={t.searchUsername}
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={isSearching || friendUsername.trim().length < 2}
              title={t.searchUsername}
              aria-label={t.searchUsername}
              className="rounded-lg border border-indigo-500/30 bg-indigo-600/20 px-2.5 text-indigo-300 transition hover:bg-indigo-600/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSearching ? <span className="text-xs">…</span> : <Search className="h-4 w-4" />}
            </button>
          </form>
          {searchResults.length > 0 && (
            <div className="mb-2 space-y-1 px-1">
              <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t.userSearchResults}</p>
              {searchResults.map((result) => (
                <div key={result.userId} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 p-2">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: result.avatarColor }}
                  >
                    {result.avatarImage ? (
                      <img src={result.avatarImage} alt="" className="h-full w-full rounded-lg object-cover" />
                    ) : result.avatarEmoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-200">{result.username}</p>
                    <p className="truncate text-[10px] text-slate-500">@{result.handle}</p>
                  </div>
                  {result.isFriend ? (
                    <span className="text-[10px] font-medium text-emerald-400">{t.friendAdded}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleAddFriend(result)}
                      disabled={addingFriendId !== null}
                      title={t.addFriend}
                      aria-label={`${t.addFriend} ${result.handle}`}
                      className="rounded-lg bg-indigo-600/20 p-2 text-indigo-300 transition hover:bg-indigo-600/40 disabled:opacity-50"
                    >
                      <UserPlus className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {friendMessage && (
            <p role="status" className="px-2 pb-2 text-[11px] text-slate-300">{friendMessage}</p>
          )}

          <div className="space-y-1">
            {friends.length === 0 ? (
              <div className="p-3 text-center rounded-xl bg-slate-950/40 border border-dashed border-slate-800 text-slate-500 text-xs">
                {t.noFriends}
              </div>
            ) : (
              friends.map((friend) => {
                const peer = users.find((user) => user.userId === friend.userId);
                const isActive = activeDmUserId === friend.userId;
                const unreadCount = unreadCounts[`dm:${friend.userId}`] || 0;
                const isOnline = Boolean(peer);
                const statusColor = !isOnline
                  ? 'bg-slate-600'
                  : peer?.status === 'online'
                    ? 'bg-emerald-500'
                    : peer?.status === 'away'
                    ? 'bg-amber-500'
                    : 'bg-rose-500';

                return (
                  <div
                    key={friend.userId}
                    className={`group flex w-full items-center gap-1 rounded-xl transition ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-slate-100'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectDmUser(friend.userId)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left"
                    >
                      <div className="relative shrink-0">
                        <div
                          style={{ backgroundColor: peer?.avatarColor || friend.avatarColor }}
                          className="flex h-8 w-8 items-center justify-center rounded-xl text-sm shadow-sm"
                        >
                          {peer?.avatarImage || friend.avatarImage ? (
                            <img
                              src={peer?.avatarImage || friend.avatarImage}
                              alt=""
                              className="h-full w-full rounded-xl object-cover"
                            />
                          ) : peer?.avatarEmoji || friend.avatarEmoji}
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-slate-900 ${statusColor}`}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <div className="flex min-w-0 items-center gap-1">
                            <span className="truncate text-xs font-semibold">{friend.username}</span>
                            {friend.role === 'admin' && (
                              <span className="shrink-0 rounded border border-rose-500/40 bg-rose-500/20 px-1 py-0.2 text-[9px] font-black font-mono text-rose-300">
                                ADMIN
                              </span>
                            )}
                          </div>
                          <span className="ml-1 text-slate-400 opacity-80">
                            {getDeviceIcon(peer?.deviceType || friend.deviceType)}
                          </span>
                        </div>
                        <p className="truncate text-[10px] text-slate-400">
                          {peer?.customStatus || (peer ? (peer.status === 'online' ? t.online : peer.status) : t.offline)}
                        </p>
                      </div>
                      {unreadCount > 0 && (
                        <span
                          aria-label={`${unreadCount} ${t.unreadMessages}`}
                          className="min-w-5 shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white"
                        >
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5 pr-1 opacity-100 transition md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                      <button
                        type="button"
                        disabled={friendActionId !== null}
                        onClick={() => void handleFriendAction(friend, 'remove')}
                        title={t.removeFriend}
                        aria-label={`${t.removeFriend} ${friend.username}`}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-amber-500/20 hover:text-amber-300 disabled:opacity-50"
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={friendActionId !== null}
                        onClick={() => void handleFriendAction(friend, 'block')}
                        title={t.blockUser}
                        aria-label={`${t.blockUser} ${friend.username}`}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-500/20 hover:text-rose-300 disabled:opacity-50"
                      >
                        <Ban className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {blockedUsers.length > 0 && (
            <div className="mt-4 border-t border-slate-800 pt-3">
              <p className="mb-1.5 flex items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <span>{t.blockedUsers}</span>
                <span>{blockedUsers.length}</span>
              </p>
              <div className="space-y-1">
                {blockedUsers.map((blockedUser) => (
                  <div key={blockedUser.userId} className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-slate-400">
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs grayscale"
                      style={{ backgroundColor: blockedUser.avatarColor }}
                    >
                      {blockedUser.avatarImage ? (
                        <img src={blockedUser.avatarImage} alt="" className="h-full w-full rounded-lg object-cover" />
                      ) : blockedUser.avatarEmoji}
                    </div>
                    <span className="min-w-0 flex-1 truncate text-xs">{blockedUser.username}</span>
                    <button
                      type="button"
                      disabled={friendActionId !== null}
                      onClick={() => void handleFriendAction(blockedUser, 'unblock')}
                      title={t.unblockUser}
                      aria-label={`${t.unblockUser} ${blockedUser.username}`}
                      className="rounded-lg p-1.5 text-indigo-300 transition hover:bg-indigo-500/20 hover:text-white disabled:opacity-50"
                    >
                      <Unlock className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* User Profile Footer */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/70">
        <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="relative shrink-0">
              <div
                style={{ backgroundColor: currentUser?.avatarColor || '#6366f1' }}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-base shadow-sm ring-1 ring-white/10"
              >
                {currentUser?.avatarImage ? (
                  <img src={currentUser.avatarImage} alt="" className="h-full w-full rounded-xl object-cover" />
                ) : currentUser?.avatarEmoji || '⚡'}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-slate-900" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-xs font-semibold text-slate-200 truncate">
                  {currentUser?.username || 'My Profile'}
                </span>
                {currentUser?.role === 'admin' ? (
                  <span className="text-[9px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 px-1.5 py-0.2 rounded font-mono shrink-0">
                    ADMIN
                  </span>
                ) : (
                  <span className="text-[10px] text-indigo-400">{t.you}</span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 truncate">
                {currentUser?.customStatus || (currentUser?.role === 'admin' ? t.adminRole : t.online)}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-0.5">
            <button
              onClick={onOpenProfileModal}
              title={t.profile}
              className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                if (window.confirm(t.confirmLogout)) {
                  onLogout();
                }
              }}
              title={t.logout}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
