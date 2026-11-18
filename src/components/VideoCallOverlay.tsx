import React, { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { Language, translations } from '../translations';
import { VideoCallState } from '../services/useVideoCall';

interface VideoCallOverlayProps {
  call: VideoCallState | null;
  notice: string;
  lang: Language;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
}

export const VideoCallOverlay: React.FC<VideoCallOverlayProps> = ({
  call,
  notice,
  lang,
  onAccept,
  onReject,
  onEnd,
}) => {
  const t = translations[lang];
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = localVideoRef.current;
    if (!video) return;
    video.srcObject = call?.localStream || null;
    if (call?.localStream) void video.play().catch((error) => console.error('Local video playback failed:', error));
  }, [call?.localStream]);

  useEffect(() => {
    const video = remoteVideoRef.current;
    if (!video) return;
    video.srcObject = call?.remoteStream || null;
    if (call?.remoteStream) void video.play().catch((error) => console.error('Remote video playback failed:', error));
  }, [call?.remoteStream]);

  if (!call) {
    return notice ? (
      <div role="status" className="fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-xl border border-rose-500/30 bg-slate-900 px-4 py-3 text-sm text-slate-100 shadow-xl">
        {notice}
      </div>
    ) : null;
  }

  if (call.status === 'incoming') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 text-center shadow-2xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300">
            <Video className="h-8 w-8" />
          </div>
          <h2 className={`${lang === 'km' ? 'khmer-display' : ''} mt-4 text-lg font-semibold text-slate-100`}>{t.incomingCall}</h2>
          <p className="mt-1 text-slate-300">{call.peerName}</p>
          <div className="mt-6 flex justify-center gap-4">
            <button type="button" onClick={onReject} className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500">
              <PhoneOff className="h-4 w-4" />
              {t.rejectCall}
            </button>
            <button type="button" onClick={onAccept} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500">
              <Phone className="h-4 w-4" />
              {t.answerCall}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 p-3 backdrop-blur-sm sm:p-6">
      <div className="relative flex h-full max-h-[850px] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <h2 className="font-semibold text-slate-100">{call.peerName}</h2>
            <p className="text-xs text-slate-400">
              {call.status === 'calling' ? t.calling : call.status === 'connected' ? t.videoCall : t.connectingCall}
            </p>
          </div>
          <Video className="h-5 w-5 text-emerald-400" />
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
          {call.remoteStream ? (
            <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-contain" />
          ) : (
            <div className="text-center text-slate-400">
              <Video className="mx-auto h-10 w-10 opacity-60" />
              <p className="mt-3 text-sm">{call.status === 'calling' ? t.calling : t.connectingCall}</p>
            </div>
          )}
          {call.localStream && (
            <video ref={localVideoRef} autoPlay playsInline muted className="absolute bottom-4 right-4 aspect-video w-28 rounded-xl border border-white/30 bg-slate-800 object-cover shadow-lg sm:w-44" />
          )}
        </div>

        <div className="flex justify-center border-t border-slate-800 p-4">
          <button type="button" onClick={onEnd} className="flex items-center gap-2 rounded-full bg-rose-600 px-5 py-3 text-sm font-semibold text-white hover:bg-rose-500">
            <PhoneOff className="h-4 w-4" />
            {t.endCall}
          </button>
        </div>
      </div>
    </div>
  );
};
