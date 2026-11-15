import { useCallback, useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { User } from '../types/chat';
import { Language, translations } from '../translations';

export interface VideoCallState {
  callId: string;
  peerId: string;
  peerName: string;
  status: 'incoming' | 'calling' | 'connecting' | 'connected';
  offer?: RTCSessionDescriptionInit;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
}

export function useVideoCall(socket: Socket | null, currentUser: User | null, lang: Language) {
  const [call, setCall] = useState<VideoCallState | null>(null);
  const [notice, setNotice] = useState('');
  const callRef = useRef<VideoCallState | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const connectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<Array<{
    callId: string;
    senderId: string;
    candidate: RTCIceCandidateInit;
  }>>([]);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = translations[lang];
  const currentUserId = currentUser?.userId;

  const getMediaErrorMessage = useCallback((error: unknown) => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      return t.cameraPermissionError;
    }
    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        return t.cameraPermissionDenied;
      }
      if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        return t.cameraDeviceNotFound;
      }
      if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        return t.cameraDeviceBusy;
      }
    }
    return t.cameraPermissionError;
  }, [t.cameraDeviceBusy, t.cameraDeviceNotFound, t.cameraPermissionDenied, t.cameraPermissionError]);

  const updateCall = useCallback((next: VideoCallState | null) => {
    callRef.current = next;
    activeCallIdRef.current = next?.callId || null;
    setCall(next);
  }, []);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(''), 4000);
  }, []);

  const finishCall = useCallback((notifyPeer: boolean, message?: string) => {
    const activeCall = callRef.current;
    if (notifyPeer && activeCall) {
      socket?.emit('call:end', { recipientId: activeCall.peerId, callId: activeCall.callId });
    }
    connectionRef.current?.close();
    connectionRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    pendingCandidatesRef.current = [];
    updateCall(null);
    if (message) showNotice(message);
  }, [showNotice, socket, updateCall]);

  const createConnection = useCallback((activeCall: VideoCallState) => {
    const connection = new RTCPeerConnection({ iceServers: [] });
    connectionRef.current = connection;
    connection.onicecandidate = (event) => {
      if (event.candidate && callRef.current?.callId === activeCall.callId) {
        socket?.emit('call:ice', {
          recipientId: activeCall.peerId,
          callId: activeCall.callId,
          candidate: event.candidate.toJSON(),
        });
      }
    };
    connection.ontrack = (event) => {
      const stream = event.streams[0] || remoteStreamRef.current || new MediaStream();
      if (!event.streams[0]) stream.addTrack(event.track);
      remoteStreamRef.current = stream;
      const latestCall = callRef.current;
      if (latestCall?.callId === activeCall.callId) {
        updateCall({ ...latestCall, remoteStream: stream });
      }
    };
    connection.onconnectionstatechange = () => {
      const latestCall = callRef.current;
      if (latestCall?.callId !== activeCall.callId) return;
      if (connection.connectionState === 'connected') {
        updateCall({ ...latestCall, status: 'connected' });
      } else if (connection.connectionState === 'failed') {
        finishCall(false, t.callUnavailable);
      }
    };
    return connection;
  }, [finishCall, socket, t.callUnavailable, updateCall]);

  const addPendingCandidates = useCallback(async (connection: RTCPeerConnection, callId: string) => {
    const candidates = pendingCandidatesRef.current.filter((item) => item.callId === callId);
    pendingCandidatesRef.current = pendingCandidatesRef.current.filter((item) => item.callId !== callId);
    for (const { candidate } of candidates) {
      try {
        await connection.addIceCandidate(candidate);
      } catch (error) {
        console.error('Failed to add video-call ICE candidate:', error);
      }
    }
  }, []);

  const startCall = useCallback(async (peer: User) => {
    if (!socket?.connected || callRef.current) {
      showNotice(t.callUnavailable);
      return;
    }

    const activeCall: VideoCallState = {
      callId: globalThis.crypto?.randomUUID?.() || `call-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      peerId: peer.userId,
      peerName: peer.username,
      status: 'calling',
    };
    updateCall(activeCall);

    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        finishCall(false, t.cameraPermissionError);
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      if (activeCallIdRef.current !== activeCall.callId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      localStreamRef.current = stream;
      const connection = createConnection({ ...activeCall, localStream: stream });
      stream.getTracks().forEach((track) => connection.addTrack(track, stream));
      updateCall({ ...activeCall, localStream: stream });
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      socket.emit('call:offer', {
        recipientId: peer.userId,
        callId: activeCall.callId,
        offer: connection.localDescription,
      });
    } catch (error) {
      console.error('Could not start video call:', error);
      finishCall(false, getMediaErrorMessage(error));
    }
  }, [createConnection, finishCall, getMediaErrorMessage, showNotice, socket, t.callUnavailable, updateCall]);

  const acceptCall = useCallback(async () => {
    const activeCall = callRef.current;
    if (!socket?.connected || !activeCall?.offer || activeCall.status !== 'incoming') return;

    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        finishCall(false, t.cameraPermissionError);
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      if (activeCallIdRef.current !== activeCall.callId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      localStreamRef.current = stream;
      const connection = createConnection({ ...activeCall, localStream: stream });
      stream.getTracks().forEach((track) => connection.addTrack(track, stream));
      await connection.setRemoteDescription(activeCall.offer);
      await addPendingCandidates(connection, activeCall.callId);
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      socket.emit('call:answer', {
        recipientId: activeCall.peerId,
        callId: activeCall.callId,
        answer: connection.localDescription,
      });
      updateCall({ ...activeCall, status: 'connecting', localStream: stream });
    } catch (error) {
      console.error('Could not accept video call:', error);
      socket.emit('call:reject', { recipientId: activeCall.peerId, callId: activeCall.callId });
      finishCall(false, getMediaErrorMessage(error));
    }
  }, [addPendingCandidates, createConnection, finishCall, getMediaErrorMessage, socket, updateCall]);

  const rejectCall = useCallback(() => {
    const activeCall = callRef.current;
    if (activeCall) {
      socket?.emit('call:reject', { recipientId: activeCall.peerId, callId: activeCall.callId });
    }
    finishCall(false);
  }, [finishCall, socket]);

  useEffect(() => {
    if (!socket || !currentUserId) return;

    const handleIncoming = (incoming: {
      callId: string;
      callerId: string;
      callerName: string;
      offer: RTCSessionDescriptionInit;
    }) => {
      if (callRef.current) {
        socket.emit('call:reject', { recipientId: incoming.callerId, callId: incoming.callId });
        return;
      }
      updateCall({
        callId: incoming.callId,
        peerId: incoming.callerId,
        peerName: incoming.callerName,
        status: 'incoming',
        offer: incoming.offer,
      });
    };

    const handleAnswered = async (answer: {
      callId: string;
      callerId: string;
      answer: RTCSessionDescriptionInit;
    }) => {
      const activeCall = callRef.current;
      if (!activeCall || activeCall.callId !== answer.callId || activeCall.peerId !== answer.callerId) return;
      try {
        const connection = connectionRef.current;
        if (!connection) return;
        await connection.setRemoteDescription(answer.answer);
        await addPendingCandidates(connection, answer.callId);
        updateCall({ ...activeCall, status: 'connecting' });
      } catch (error) {
        console.error('Failed to set video-call answer:', error);
        finishCall(false, t.callUnavailable);
      }
    };

    const handleIce = async (data: {
      callId: string;
      senderId: string;
      candidate: RTCIceCandidateInit;
    }) => {
      const activeCall = callRef.current;
      if (!activeCall) {
        pendingCandidatesRef.current.push(data);
        return;
      }
      if (activeCall.callId !== data.callId || activeCall.peerId !== data.senderId) return;
      const connection = connectionRef.current;
      if (!connection?.remoteDescription) {
        pendingCandidatesRef.current.push(data);
        return;
      }
      try {
        await connection.addIceCandidate(data.candidate);
      } catch (error) {
        console.error('Failed to add video-call ICE candidate:', error);
      }
    };

    const handleUnavailable = (data: { callId: string }) => {
      if (callRef.current?.callId === data.callId) finishCall(false, t.callUnavailable);
    };
    const handleRejected = (data: { callId: string; senderId: string }) => {
      const activeCall = callRef.current;
      if (activeCall?.callId === data.callId && activeCall.peerId === data.senderId) {
        finishCall(false, t.callRejected);
      }
    };
    const handleEnded = (data: { callId: string; senderId: string }) => {
      const activeCall = callRef.current;
      if (activeCall?.callId === data.callId && activeCall.peerId === data.senderId) {
        finishCall(false, t.callEnded);
      }
    };
    const handleDisconnect = () => finishCall(false, t.callUnavailable);

    socket.on('call:incoming', handleIncoming);
    socket.on('call:answered', handleAnswered);
    socket.on('call:ice', handleIce);
    socket.on('call:unavailable', handleUnavailable);
    socket.on('call:rejected', handleRejected);
    socket.on('call:ended', handleEnded);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('call:incoming', handleIncoming);
      socket.off('call:answered', handleAnswered);
      socket.off('call:ice', handleIce);
      socket.off('call:unavailable', handleUnavailable);
      socket.off('call:rejected', handleRejected);
      socket.off('call:ended', handleEnded);
      socket.off('disconnect', handleDisconnect);
      finishCall(false);
    };
  }, [addPendingCandidates, currentUserId, finishCall, socket, t.callEnded, t.callRejected, t.callUnavailable, updateCall]);

  useEffect(() => {
    if (!call || (call.status !== 'calling' && call.status !== 'incoming')) return;
    const timer = setTimeout(() => finishCall(true, t.callUnavailable), 45000);
    return () => clearTimeout(timer);
  }, [call, finishCall, t.callUnavailable]);

  useEffect(() => () => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    connectionRef.current?.close();
  }, []);

  return {
    call,
    notice,
    startCall,
    acceptCall,
    rejectCall,
    endCall: () => finishCall(true),
  };
}
