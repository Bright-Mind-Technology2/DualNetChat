import React, { useState } from 'react';
import { X, Hash, Plus, UserPlus } from 'lucide-react';
import { Friend } from '../types/chat';
import { Language, translations } from '../translations';

interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (channel: {
    name: string;
    nameKm?: string;
    description?: string;
    descriptionKm?: string;
    memberIds: string[];
  }) => void;
  friends: Friend[];
  lang: Language;
}

export const CreateChannelModal: React.FC<CreateChannelModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  friends,
  lang,
}) => {
  const t = translations[lang];
  const [name, setName] = useState('');
  const [nameKm, setNameKm] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onCreate({
      name: name.trim().toLowerCase().replace(/\s+/g, '-'),
      nameKm: nameKm.trim() || name.trim(),
      description: description.trim() || 'Custom local channel',
      descriptionKm: description.trim() || 'បន្ទប់ជជែកបង្កើតថ្មី',
      memberIds: selectedFriendIds,
    });

    setName('');
    setNameKm('');
    setDescription('');
    setSelectedFriendIds([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <Hash className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-slate-100 text-lg">
              {t.addChannel}
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
        <form onSubmit={handleSubmit} className="max-h-[80dvh] overflow-y-auto p-4 sm:p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t.channelName}
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 font-mono">
                #
              </span>
              <input
                type="text"
                required
                maxLength={30}
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '-'))}
                className="w-full pl-8 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500 font-mono transition"
                placeholder="project-talk"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <UserPlus className="h-4 w-4 text-indigo-400" />
              <span>{t.inviteFriends}</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">{t.privateChannelHint}</p>
            {friends.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-800 bg-slate-950/50 p-3 text-center text-xs text-slate-500">
                {t.noFriendsToInvite}
              </p>
            ) : (
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/50 p-2">
                {friends.map((friend) => {
                  const isSelected = selectedFriendIds.includes(friend.userId);
                  return (
                    <label
                      key={friend.userId}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg p-2 transition ${
                        isSelected ? 'bg-indigo-500/10' : 'hover:bg-slate-800/70'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(event) => {
                          setSelectedFriendIds((previous) =>
                            event.target.checked
                              ? [...previous, friend.userId]
                              : previous.filter((id) => id !== friend.userId)
                          );
                        }}
                        className="h-4 w-4 accent-indigo-500"
                      />
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: friend.avatarColor }}
                      >
                        {friend.avatarImage ? (
                          <img src={friend.avatarImage} alt="" className="h-full w-full rounded-lg object-cover" />
                        ) : friend.avatarEmoji}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                        {friend.username}
                      </span>
                      <span className="truncate text-xs text-slate-500">@{friend.handle}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t.channelNameKm}
            </label>
            <input
              type="text"
              maxLength={40}
              value={nameKm}
              onChange={(e) => setNameKm(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500 transition"
              placeholder="កិច្ចពិភាក្សាការងារ"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t.channelDesc}
            </label>
            <textarea
              rows={2}
              maxLength={120}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500 transition resize-none"
              placeholder={lang === 'km' ? 'គោលបំណងនៃបន្ទប់នេះ...' : 'What is this channel about?'}
            />
          </div>

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
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition shadow-md shadow-indigo-600/20 cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{t.create}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
