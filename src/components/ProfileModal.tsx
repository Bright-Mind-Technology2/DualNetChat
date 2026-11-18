import React, { useEffect, useState } from 'react';
import { X, UserCheck, Smartphone, Laptop, Monitor, Tablet, Sparkles, ImagePlus, Trash2, Upload } from 'lucide-react';
import { User } from '../types/chat';
import { Language, translations } from '../translations';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onSave: (data: Partial<User>) => void;
  backgroundImage: string | null;
  onChangeBackground: (image: string | null) => boolean;
  lang: Language;
}

const EMOJI_OPTIONS = [
  '⚡', '💡', '🚀', '🌟', '🔥', '🎨', '🦁', '🦉', '🦊', '🍀', '💎', '🎯',
  '☕', '🎧', '💻', '🎮', '🦄', '🌈', '🛸', '🤖', '🐯', '🐼', '🌸', '✨'
];

const COLOR_OPTIONS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#f97316', // Orange
  '#eab308', // Amber
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#14b8a6', // Teal
];

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSave,
  backgroundImage,
  onChangeBackground,
  lang,
}) => {
  const t = translations[lang];

  const [username, setUsername] = useState(currentUser?.username || '');
  const [avatarEmoji, setAvatarEmoji] = useState(currentUser?.avatarEmoji || '⚡');
  const [avatarColor, setAvatarColor] = useState(currentUser?.avatarColor || '#6366f1');
  const [avatarImage, setAvatarImage] = useState(currentUser?.avatarImage || '');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [avatarInputKey, setAvatarInputKey] = useState(0);
  const [deviceType, setDeviceType] = useState<'desktop' | 'mobile' | 'tablet' | 'laptop'>(
    currentUser?.deviceType || 'laptop'
  );
  const [status, setStatus] = useState<'online' | 'busy' | 'away'>(
    currentUser?.status === 'offline' ? 'online' : currentUser?.status || 'online'
  );
  const [customStatus, setCustomStatus] = useState(currentUser?.customStatus || '');
  const [backgroundError, setBackgroundError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setAvatarImage(currentUser?.avatarImage || '');
      setAvatarError('');
    }
  }, [isOpen, currentUser?.avatarImage]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      username: username.trim() || 'Bright Peer',
      avatarEmoji,
      avatarColor,
      avatarImage,
      deviceType,
      status,
      customStatus: customStatus.trim(),
    });
    onClose();
  };

  const handleAvatarFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setAvatarError('');
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setAvatarError(t.avatarImageTypeError);
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setAvatarError(t.avatarImageSizeError);
      return;
    }

    setIsUploadingAvatar(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        if (typeof reader.result !== 'string') {
          throw new Error('Image file could not be read');
        }

        const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `avatar-${Date.now()}.${extension}`,
            type: file.type,
            data: reader.result,
          }),
        });
        const result = await response.json();
        if (!response.ok || !result.success || typeof result.url !== 'string') {
          throw new Error(result.error || 'Avatar upload failed');
        }

        setAvatarImage(result.url);
        onSave({ avatarImage: result.url });
      } catch (error) {
        console.error('Failed to upload avatar image:', error);
        setAvatarError(t.avatarImageUploadError);
      } finally {
        setIsUploadingAvatar(false);
      }
    };
    reader.onerror = () => {
      setIsUploadingAvatar(false);
      setAvatarError(t.avatarImageReadError);
    };

    try {
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Failed to read avatar image:', error);
      setIsUploadingAvatar(false);
      setAvatarError(t.avatarImageReadError);
    }
  };

  const handleBackgroundFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setBackgroundError('');
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setBackgroundError(t.backgroundImageTypeError);
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      setBackgroundError(t.backgroundImageSizeError);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string' || !onChangeBackground(reader.result)) {
        setBackgroundError(t.backgroundImageSaveError);
      }
    };
    reader.onerror = () => setBackgroundError(t.backgroundImageReadError);

    try {
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Failed to read background image:', error);
      setBackgroundError(t.backgroundImageReadError);
    }
  };

  const handleRemoveBackground = () => {
    setBackgroundError('');
    if (!onChangeBackground(null)) {
      setBackgroundError(t.backgroundImageSaveError);
    }
  };

  const handleRemoveAvatarImage = () => {
    setAvatarImage('');
    setAvatarInputKey((key) => key + 1);
    setAvatarError('');
    onSave({ avatarImage: '' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className={`${lang === 'km' ? 'khmer-display' : ''} font-semibold text-slate-100 text-lg`}>
              {t.changeNickname}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[80vh]">
          {/* Avatar Preview */}
          <div className="flex flex-col items-center gap-2">
            <div
              style={{ backgroundColor: avatarColor }}
              className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl shadow-xl ring-4 ring-slate-800 transition-transform hover:scale-105"
            >
              {avatarImage ? (
                <img src={avatarImage} alt={t.avatarImageAlt} className="h-full w-full rounded-2xl object-cover" />
              ) : avatarEmoji}
            </div>
            <span className="text-xs text-slate-400 font-medium">
              {username || 'Bright Peer'}
            </span>
          </div>

          {/* Custom Avatar Image */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t.avatarImage}
            </label>
            <div className="flex items-center gap-3">
              <label className={`flex cursor-pointer items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-600/20 px-3 py-2.5 text-sm font-medium text-indigo-200 transition hover:bg-indigo-600/30 ${isUploadingAvatar ? 'pointer-events-none opacity-60' : ''}`}>
                <Upload className="h-4 w-4" />
                <span>{isUploadingAvatar ? t.uploadingAvatar : t.chooseImage}</span>
                <input
                  key={avatarInputKey}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={isUploadingAvatar}
                  onChange={handleAvatarFile}
                />
              </label>
              {avatarImage && (
                <button
                  type="button"
                  onClick={handleRemoveAvatarImage}
                  className="rounded-xl border border-slate-700 px-3 py-2.5 text-sm text-slate-300 transition hover:border-rose-500/40 hover:text-rose-300"
                >
                  {t.removeAvatarImage}
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-500">{t.avatarImageHelp}</p>
            {avatarError && <p role="alert" className="text-xs text-rose-300">{avatarError}</p>}
          </div>

          {/* Nickname input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t.nickname}
            </label>
            <input
              type="text"
              required
              maxLength={25}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500 transition"
              placeholder="e.g. Sovathanak, Sokha, Vathana..."
            />
          </div>

          {/* Emoji Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t.avatarEmoji}
            </label>
            <div className="grid grid-cols-8 gap-1.5 p-2 bg-slate-950 rounded-xl border border-slate-800/80 max-h-32 overflow-y-auto">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  type="button"
                  key={emoji}
                  onClick={() => setAvatarEmoji(emoji)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg transition cursor-pointer ${
                    avatarEmoji === emoji
                      ? 'bg-indigo-600/40 ring-2 ring-indigo-500 scale-110'
                      : 'hover:bg-slate-800'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Color Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t.avatarColor}
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {COLOR_OPTIONS.map((col) => (
                <button
                  type="button"
                  key={col}
                  onClick={() => setAvatarColor(col)}
                  style={{ backgroundColor: col }}
                  className={`w-7 h-7 rounded-full transition-transform cursor-pointer ${
                    avatarColor === col
                      ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900'
                      : 'hover:scale-110'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Device Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t.deviceType}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { type: 'laptop', label: 'Laptop', icon: Laptop },
                { type: 'mobile', label: 'Mobile', icon: Smartphone },
                { type: 'tablet', label: 'Tablet', icon: Tablet },
                { type: 'desktop', label: 'Desktop', icon: Monitor },
              ].map(({ type, label, icon: Icon }) => (
                <button
                  type="button"
                  key={type}
                  onClick={() => setDeviceType(type as any)}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs font-medium transition cursor-pointer gap-1 ${
                    deviceType === type
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Status Selection */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'online', label: t.online, color: 'bg-emerald-500' },
              { id: 'away', label: t.away, color: 'bg-amber-500' },
              { id: 'busy', label: t.busy, color: 'bg-rose-500' },
            ].map(({ id, label, color }) => (
              <button
                type="button"
                key={id}
                onClick={() => setStatus(id as any)}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-medium transition cursor-pointer ${
                  status === id
                    ? 'bg-slate-800 border-slate-600 text-white shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${color}`} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Custom Status */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t.customStatus}
            </label>
            <input
              type="text"
              maxLength={60}
              value={customStatus}
              onChange={(e) => setCustomStatus(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500 transition"
              placeholder={lang === 'km' ? 'ឧទាហរណ៍៖ កំពុងធ្វើការ, រៀនសូត្រ, ទំនេរ...' : 'e.g. In a meeting, coding, free to chat...'}
            />
          </div>

          {/* Chat Background */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t.chatBackground}
            </label>
            <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3">
              <div
                className="h-14 w-20 shrink-0 rounded-lg border border-slate-700 bg-slate-900 bg-cover bg-center"
                style={backgroundImage ? { backgroundImage: `url("${backgroundImage}")` } : undefined}
                aria-label={backgroundImage ? t.backgroundImageSelected : t.defaultBackground}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-200">
                  {backgroundImage ? t.backgroundImageSelected : t.defaultBackground}
                </p>
                <p className="mt-1 text-[10px] text-slate-500">{t.backgroundImageHelp}</p>
              </div>
              <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-600/20 px-2.5 py-2 text-xs font-medium text-indigo-200 transition hover:bg-indigo-600/30">
                <ImagePlus className="h-4 w-4" />
                <span>{t.chooseImage}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={handleBackgroundFile}
                />
              </label>
              {backgroundImage && (
                <button
                  type="button"
                  onClick={handleRemoveBackground}
                  title={t.removeBackground}
                  aria-label={t.removeBackground}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-rose-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            {backgroundError && (
              <p role="alert" className="text-xs text-rose-300">{backgroundError}</p>
            )}
          </div>

          {/* Actions */}
          <div className="pt-2 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition cursor-pointer"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={isUploadingAvatar}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 text-white rounded-xl text-sm font-medium transition shadow-md shadow-indigo-600/20 cursor-pointer flex items-center gap-1.5"
            >
              <UserCheck className="w-4 h-4" />
              <span>{t.save}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
