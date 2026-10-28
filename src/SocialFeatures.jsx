import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Gamepad2,
  Group,
  ImagePlus,
  MessageCircle,
  Mic,
  MicOff,
  Phone,
  Search,
  UserPlus,
  UsersRound,
  Video,
  VideoOff,
  X,
} from "lucide-react";

function shortName(name = "") {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0] || "").join("").toUpperCase() || "?";
}

function Avatar({ name, avatar, small = false }) {
  const colors = ["avatar-mint", "avatar-blue", "avatar-peach", "avatar-yellow"];
  const color = Array.from(name || "?").reduce((sum, character) => sum + character.charCodeAt(0), 0) % colors.length;
  return (
    <span className={`avatar ${small ? "avatar-small" : ""} ${colors[color]}`}>
      {avatar ? <img src={avatar} alt="" /> : shortName(name)}
    </span>
  );
}

function privateRoom(firstId, secondId) {
  return `dm:${[firstId, secondId].sort().join(":")}`;
}

function SocialFeatures({ socket, userId, name, avatar, socialData, chattingWith, onSelectRoom, onProfileUpdated, onNotice }) {
  const [modal, setModal] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [profileName, setProfileName] = useState(name);
  const [avatarDraft, setAvatarDraft] = useState(avatar || "");
  const [pending, setPending] = useState(false);
  const [game, setGame] = useState(null);
  const [incomingGame, setIncomingGame] = useState(null);
  const [call, setCall] = useState(null);
  const [muted, setMuted] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [searchNotice, setSearchNotice] = useState("");
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const pendingIceRef = useRef([]);
  const callRef = useRef(null);
  const startCallerRef = useRef(null);
  const signalHandlerRef = useRef(null);
  const cleanupCallRef = useRef(null);
  const friends = socialData?.friends || [];
  const incomingRequests = socialData?.incoming || [];
  const outgoingRequests = socialData?.outgoing || [];
  const visibleResults = modal === "friends" && query.trim().length >= 2 ? results : [];

  useEffect(() => {
    if (!socket || modal !== "friends" || query.trim().length < 2) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      socket.emit("users:search", { query: query.trim() }, (result) => {
        setResults(result?.users || []);
      });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [socket, modal, query]);

  useEffect(() => {
    if (!socket) return undefined;
    const onGameInvite = (invite) => setIncomingGame(invite);
    const onGameState = (nextGame) => {
      setGame(nextGame);
      setIncomingGame(null);
    };
    const onGameClosed = () => {
      setGame(null);
      setIncomingGame(null);
      onNotice("ការអញ្ជើញលេងត្រូវបានបិទ។");
    };
    const onCallIncoming = (details) => {
      callRef.current = { ...details, status: "incoming", peer: details.peer };
      setCall(callRef.current);
    };
    const onCallAccepted = (details) => startCallerRef.current?.(details);
    const onCallSignal = (details) => signalHandlerRef.current?.(details);
    const onCallEnded = (details) => {
      if (callRef.current?.callId !== details.callId) return;
      cleanupCallRef.current?.();
      setCall(null);
      if (details.reason === "declined") onNotice("មិត្តរបស់អ្នកមិនអាចទទួលការហៅបានទេ។");
    };
    socket.on("game:incoming", onGameInvite);
    socket.on("game:state", onGameState);
    socket.on("game:closed", onGameClosed);
    socket.on("call:incoming", onCallIncoming);
    socket.on("call:accepted", onCallAccepted);
    socket.on("call:signal", onCallSignal);
    socket.on("call:ended", onCallEnded);
    return () => {
      socket.off("game:incoming", onGameInvite);
      socket.off("game:state", onGameState);
      socket.off("game:closed", onGameClosed);
      socket.off("call:incoming", onCallIncoming);
      socket.off("call:accepted", onCallAccepted);
      socket.off("call:signal", onCallSignal);
      socket.off("call:ended", onCallEnded);
    };
  }, [socket, onNotice]);

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    if (remoteVideoRef.current && remoteStreamRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
  }, [call]);

  const cleanupCall = useEffectEvent(() => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
  });

  async function prepareMedia(currentCall) {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("ការហៅត្រូវការគេហទំព័រ HTTPS លើទូរស័ព្ទ។ localhost អាចប្រើបានសម្រាប់សាកល្បង។");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: currentCall.video });
    pendingIceRef.current = [];
    localStreamRef.current = stream;
    remoteStreamRef.current = new MediaStream();
    const connection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    peerConnectionRef.current = connection;
    for (const track of stream.getTracks()) connection.addTrack(track, stream);
    connection.ontrack = (event) => {
      for (const track of event.streams[0]?.getTracks() || [event.track]) remoteStreamRef.current.addTrack(track);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
      setCall((current) => current ? { ...current, status: "active" } : current);
    };
    connection.onicecandidate = (event) => {
      if (event.candidate) socket.emit("call:signal", {
        callId: currentCall.callId,
        userId: currentCall.peer.userId,
        signal: { candidate: event.candidate },
      });
    };
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return connection;
  }

  const startCaller = useEffectEvent(async (details) => {
    const previousCall = callRef.current;
    if (!previousCall || previousCall.callId !== details.callId) return;
    const nextCall = { ...previousCall, peer: details.peer, status: "connecting" };
    callRef.current = nextCall;
    setCall(nextCall);
    try {
      const connection = await prepareMedia(nextCall);
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      socket.emit("call:signal", {
        callId: nextCall.callId,
        userId: nextCall.peer.userId,
        signal: { description: connection.localDescription },
      });
    } catch (error) {
      onNotice(error.message || "មិនអាចចាប់ផ្តើមការហៅបានទេ។");
      socket.emit("call:end", { callId: nextCall.callId });
    }
  });

  const handleCallSignal = useEffectEvent(async ({ callId, userId: senderId, signal }) => {
    const currentCall = callRef.current;
    const connection = peerConnectionRef.current;
    if (!currentCall || currentCall.callId !== callId || !connection) return;
    try {
      if (signal.description?.type === "offer") {
        await connection.setRemoteDescription(signal.description);
        for (const candidate of pendingIceRef.current) await connection.addIceCandidate(candidate);
        pendingIceRef.current = [];
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        socket.emit("call:signal", { callId, userId: senderId, signal: { description: connection.localDescription } });
      } else if (signal.description?.type === "answer") {
        await connection.setRemoteDescription(signal.description);
        for (const candidate of pendingIceRef.current) await connection.addIceCandidate(candidate);
        pendingIceRef.current = [];
      } else if (signal.candidate) {
        if (connection.remoteDescription) await connection.addIceCandidate(signal.candidate);
        else pendingIceRef.current.push(signal.candidate);
      }
    } catch {
      onNotice("ការភ្ជាប់ call មិនបានទេ។ សូមសាកល្បងហៅម្ដងទៀត។");
    }
  });

  useEffect(() => {
    cleanupCallRef.current = cleanupCall;
    startCallerRef.current = startCaller;
    signalHandlerRef.current = handleCallSignal;
  });

  function openProfile() {
    setProfileName(name);
    setAvatarDraft(avatar || "");
    setModal("profile");
  }

  function requestFriend(targetId) {
    socket.emit("friend:request", { userId: targetId }, (result) => {
      setSearchNotice(result?.ok ? "បានផ្ញើ friend request ហើយ។" : result?.error || "ផ្ញើសំណើមិនបានទេ។");
    });
  }

  function respondFriend(targetId, accept) {
    socket.emit("friend:respond", { userId: targetId, accept }, (result) => {
      if (!result?.ok) setSearchNotice(result?.error || "មិនអាចកែប្រែសំណើបានទេ។");
    });
  }

  function saveProfile(event) {
    event.preventDefault();
    setPending(true);
    socket.emit("profile:update", { name: profileName, avatar: avatarDraft }, (result) => {
      setPending(false);
      if (!result?.ok) return setSearchNotice(result?.error || "រក្សាទុក profile មិនបានទេ។");
      onProfileUpdated(result.profile);
      setModal("");
    });
  }

  function chooseAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 250 * 1024) {
      setSearchNotice("រូបត្រូវជា PNG, JPG ឬ WebP និងតិចជាង 250 KB។");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatarDraft(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  function createGroup(event) {
    event.preventDefault();
    setPending(true);
    socket.emit("group:create", { name: groupName, members: selectedFriends }, (result) => {
      setPending(false);
      if (!result?.ok) return setSearchNotice(result?.error || "បង្កើត group មិនបានទេ។");
      onSelectRoom(`group:${result.group.id}`);
      setGroupName("");
      setSelectedFriends([]);
      setModal("");
    });
  }

  function toggleGroupFriend(friendId) {
    setSelectedFriends((current) => current.includes(friendId) ? current.filter((id) => id !== friendId) : [...current, friendId]);
  }

  function inviteGame() {
    if (!chattingWith) return;
    socket.emit("game:invite", { userId: chattingWith.userId }, (result) => {
      if (result?.ok) setGame(result.game);
      else onNotice(result?.error || "មិនអាចអញ្ជើញលេងបានទេ។");
    });
  }

  function respondGame(accept) {
    if (!incomingGame) return;
    socket.emit("game:respond", { gameId: incomingGame.id, accept }, (result) => {
      if (!result?.ok) onNotice(result?.error || "មិនអាចឆ្លើយតបការអញ្ជើញបានទេ។");
      setIncomingGame(null);
      if (!accept) setGame(null);
    });
  }

  function moveGame(cell) {
    if (!game) return;
    socket.emit("game:move", { gameId: game.id, cell }, (result) => {
      if (!result?.ok) onNotice(result?.error || "មិនអាចដាក់សញ្ញាបានទេ។");
    });
  }

  function beginCall(video) {
    if (!chattingWith) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      onNotice("ការហៅត្រូវការគេហទំព័រ HTTPS លើទូរស័ព្ទ។ localhost អាចប្រើបានសម្រាប់សាកល្បង។");
      return;
    }
    socket.emit("call:invite", { userId: chattingWith.userId, video }, (result) => {
      if (!result?.ok) return onNotice(result?.error || "មិនអាចហៅមិត្តរបស់អ្នកបានទេ។");
      const nextCall = { callId: result.callId, peer: result.peer, video, status: "ringing", outgoing: true };
      callRef.current = nextCall;
      setCall(nextCall);
    });
  }

  async function respondCall(accept) {
    const currentCall = callRef.current;
    if (!currentCall) return;
    if (!accept) {
      socket.emit("call:respond", { callId: currentCall.callId, accept: false });
      callRef.current = null;
      setCall(null);
      return;
    }
    try {
      const preparedCall = { ...currentCall, status: "connecting" };
      callRef.current = preparedCall;
      setCall(preparedCall);
      await prepareMedia(preparedCall);
      const result = await new Promise((resolve) => {
        socket.emit("call:respond", { callId: preparedCall.callId, accept: true }, resolve);
      });
      if (!result?.ok) throw new Error(result?.error || "មិនអាចទទួលការហៅបានទេ។");
      const acceptedCall = { ...preparedCall, peer: result.peer };
      callRef.current = acceptedCall;
      setCall(acceptedCall);
    } catch (error) {
      cleanupCallRef.current?.();
      socket.emit("call:respond", { callId: currentCall.callId, accept: false });
      callRef.current = null;
      setCall(null);
      onNotice(error.message || "មិនអាចប្រើ microphone/camera បានទេ។");
    }
  }

  function endCall() {
    if (callRef.current) socket.emit("call:end", { callId: callRef.current.callId });
    cleanupCallRef.current?.();
    callRef.current = null;
    setCall(null);
  }

  function toggleMute() {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) audioTrack.enabled = !audioTrack.enabled;
    setMuted(Boolean(audioTrack?.enabled === false));
  }

  function toggleVideo() {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) videoTrack.enabled = !videoTrack.enabled;
    setVideoEnabled(Boolean(videoTrack?.enabled));
  }

  function closeModal() {
    setModal("");
    setSearchNotice("");
    setQuery("");
  }

  const activeGamePlayer = game?.players.find((player) => player.userId === userId);
  const gameStatus = !game ? "" : game.status === "pending" ? "កំពុងរង់ចាំការឆ្លើយតប..." : game.status === "finished" ? game.winner === "draw" ? "ស្មើគ្នា!" : game.winner === userId ? "អ្នកឈ្នះ!" : "មិត្តរបស់អ្នកឈ្នះ!" : game.players.find((player) => player.mark === game.turn)?.userId === userId ? "វេនអ្នក" : "កំពុងរង់ចាំមិត្ត...";

  return (
    <>
      <div className="social-shortcuts">
        <button type="button" onClick={() => { setSearchNotice(""); setModal("friends"); }}><UserPlus size={15} /><span>មិត្តភក្តិ</span><small>{friends.length}</small></button>
        <button type="button" onClick={() => { setSearchNotice(""); setModal("group"); }}><Group size={15} /><span>បង្កើត group</span></button>
        <button type="button" onClick={openProfile}><ImagePlus size={15} /><span>កែ profile</span></button>
        {chattingWith && <>
          <button type="button" onClick={inviteGame}><Gamepad2 size={15} /><span>លេង XO</span></button>
          <button type="button" onClick={() => beginCall(false)}><Phone size={15} /><span>ហៅសំឡេង</span></button>
          <button type="button" onClick={() => beginCall(true)}><Video size={15} /><span>ហៅវីដេអូ</span></button>
        </>}
      </div>

      {modal && createPortal(
        <div className="social-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
          {modal === "friends" && <section className="social-modal friends-modal" role="dialog" aria-modal="true" aria-labelledby="friends-title">
            <button className="social-close" type="button" aria-label="បិទ" onClick={closeModal}><X size={18} /></button>
            <span className="social-eyebrow">YOUR PEOPLE</span><h2 id="friends-title">មិត្តភក្តិ</h2>
            <label className="social-search"><Search size={17} /><input autoFocus placeholder="ស្វែងរកតាមឈ្មោះ..." value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            {searchNotice && <p className="social-notice" role="status">{searchNotice}</p>}
            {visibleResults.length > 0 && <div className="social-list"><span className="social-list-label">លទ្ធផលស្វែងរក</span>{visibleResults.map((person) => <div className="social-person" key={person.userId}>
              <Avatar name={person.name} avatar={person.avatar} small /><span className="social-person-copy"><strong>{person.name}</strong><small>អ្នកប្រើ Bright Mind Chat</small></span>
              <button className="social-icon-action" type="button" title="បន្ថែមមិត្ត" aria-label={`បន្ថែម ${person.name}`} onClick={() => requestFriend(person.userId)}><UserPlus size={17} /></button>
            </div>)}</div>}
            {incomingRequests.length > 0 && <div className="social-list"><span className="social-list-label">សំណើមកដល់ · {incomingRequests.length}</span>{incomingRequests.map((person) => <div className="social-person" key={person.userId}>
              <Avatar name={person.name} avatar={person.avatar} small /><span className="social-person-copy"><strong>{person.name}</strong><small>ចង់បន្ថែមអ្នកជាមិត្ត</small></span>
              <button className="social-icon-action action-accept" type="button" title="ទទួល" aria-label={`ទទួល ${person.name}`} onClick={() => respondFriend(person.userId, true)}><Check size={17} /></button>
              <button className="social-icon-action action-decline" type="button" title="បដិសេធ" aria-label={`បដិសេធ ${person.name}`} onClick={() => respondFriend(person.userId, false)}><X size={17} /></button>
            </div>)}</div>}
            {outgoingRequests.length > 0 && <div className="social-list"><span className="social-list-label">បានផ្ញើសំណើ</span>{outgoingRequests.map((person) => <div className="social-person" key={person.userId}>
              <Avatar name={person.name} avatar={person.avatar} small /><span className="social-person-copy"><strong>{person.name}</strong><small>កំពុងរង់ចាំការឆ្លើយតប</small></span><span className="pending-mark">WAITING</span>
            </div>)}</div>}
            <div className="social-list"><span className="social-list-label">មិត្តភក្តិ · {friends.length}</span>{friends.map((friend) => <div className="social-person" key={friend.userId}>
              <Avatar name={friend.name} avatar={friend.avatar} small /><span className="social-person-copy"><strong>{friend.name}</strong><small>ជជែក ឬលេងជាមួយគ្នា</small></span>
              <button className="social-icon-action" type="button" title="បើក chat" aria-label={`Chat ជាមួយ ${friend.name}`} onClick={() => { onSelectRoom(privateRoom(userId, friend.userId)); closeModal(); }}><MessageCircle size={17} /></button>
            </div>)}{friends.length === 0 && <p className="social-empty">មិនទាន់មានមិត្តភក្តិទេ។ ស្វែងរកឈ្មោះខាងលើដើម្បីបន្ថែម។</p>}</div>
          </section>}

          {modal === "group" && <form className="social-modal" role="dialog" aria-modal="true" aria-labelledby="group-title" onSubmit={createGroup}>
            <button className="social-close" type="button" aria-label="បិទ" onClick={closeModal}><X size={18} /></button><span className="social-eyebrow">A PLACE FOR EVERYONE</span><h2 id="group-title">បង្កើត group</h2>
            <label className="social-field-label" htmlFor="group-name">ឈ្មោះ group</label><input id="group-name" className="social-input" maxLength={40} placeholder="ឧ. ក្រុមការងារគម្រោង" value={groupName} onChange={(event) => setGroupName(event.target.value)} />
            <span className="social-list-label">ជ្រើសរើសមិត្តភក្តិ</span><div className="group-picks">{friends.map((friend) => <label className="group-pick" key={friend.userId}><input type="checkbox" checked={selectedFriends.includes(friend.userId)} onChange={() => toggleGroupFriend(friend.userId)} /><Avatar name={friend.name} avatar={friend.avatar} small /><span>{friend.name}</span></label>)}{friends.length === 0 && <p className="social-empty">បន្ថែមមិត្តភក្តិជាមុនសិន ដើម្បីបង្កើត group។</p>}</div>
            {searchNotice && <p className="social-notice" role="status">{searchNotice}</p>}
            <button className="social-primary" type="submit" disabled={pending || !groupName.trim() || selectedFriends.length === 0}><UsersRound size={16} /> បង្កើត group</button>
          </form>}

          {modal === "profile" && <form className="social-modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title" onSubmit={saveProfile}>
            <button className="social-close" type="button" aria-label="បិទ" onClick={closeModal}><X size={18} /></button><span className="social-eyebrow">YOUR PROFILE</span><h2 id="profile-title">កែ profile</h2>
            <label className="profile-photo-pick"><Avatar name={profileName} avatar={avatarDraft} /><span><ImagePlus size={16} /> ប្ដូររូប profile<small>PNG, JPG ឬ WebP · អតិបរមា 250 KB</small></span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseAvatar} /></label>
            <label className="social-field-label" htmlFor="profile-display-name">ឈ្មោះដែលអ្នកប្រើក្នុង chat</label><input id="profile-display-name" className="social-input" autoFocus maxLength={24} value={profileName} onChange={(event) => setProfileName(event.target.value)} />
            {searchNotice && <p className="social-notice" role="status">{searchNotice}</p>}<button className="social-primary" type="submit" disabled={pending || !profileName.trim()}><Check size={16} /> រក្សាទុក</button>
          </form>}
        </div>, document.body,
      )}

      {(incomingGame || game) && createPortal(
        <div className="social-backdrop game-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && game?.status === "finished") setGame(null); }}>
          <section className="social-modal game-modal" role="dialog" aria-modal="true" aria-labelledby="game-title">
            <button className="social-close" type="button" aria-label="បិទហ្គេម" onClick={() => { if (game?.status === "finished") setGame(null); }}><X size={18} /></button>
            <span className="social-eyebrow">BRIGHT MIND ARCADE</span><h2 id="game-title">Tic-Tac-Toe</h2>
            {incomingGame && !game ? <><p className="game-invite-copy"><Avatar name={incomingGame.players[0].name} avatar={incomingGame.players[0].avatar} small /> <strong>{incomingGame.players[0].name}</strong> អញ្ជើញអ្នកលេង XO</p><div className="game-invite-actions"><button className="social-primary" type="button" onClick={() => respondGame(true)}>លេងជាមួយគ្នា</button><button className="social-secondary" type="button" onClick={() => respondGame(false)}>ពេលក្រោយ</button></div></> : game && <>
              <div className="game-player-strip">{game.players.map((player) => <span className={`game-player ${game.turn === player.mark && game.status === "playing" ? "turn-active" : ""}`} key={player.userId}><Avatar name={player.name} avatar={player.avatar} small /><strong>{player.name}</strong><small>{player.mark}</small></span>)}</div>
              <p className="game-status">{gameStatus}</p><div className="game-board" aria-label="Tic-Tac-Toe board">{game.board.map((mark, cell) => <button key={cell} type="button" className={`game-cell ${mark === "X" ? "cell-x" : mark === "O" ? "cell-o" : ""}`} disabled={game.status !== "playing" || game.turn !== activeGamePlayer?.mark || Boolean(mark)} onClick={() => moveGame(cell)} aria-label={`ប្រអប់ ${cell + 1}${mark ? ` ${mark}` : " ទទេ"}`}>{mark || ""}</button>)}</div>
              {game.status === "finished" && <button className="social-secondary game-dismiss" type="button" onClick={() => setGame(null)}>បិទ</button>}
            </>}
          </section>
        </div>, document.body,
      )}

      {call && createPortal(
        <div className="social-backdrop call-backdrop">
          <section className="social-modal call-modal" role="dialog" aria-modal="true" aria-labelledby="call-title">
            <button className="social-close" type="button" aria-label="បិទ call" onClick={endCall}><X size={18} /></button>
            <span className="social-eyebrow">{call.video ? "VIDEO CALL" : "VOICE CALL"}</span><h2 id="call-title">{call.status === "incoming" ? "ការហៅចូល" : call.status === "active" ? "កំពុងនិយាយ" : "កំពុងហៅ..."}</h2>
            {call.status === "incoming" && <p className="call-peer"><Avatar name={call.peer?.name} avatar={call.peer?.avatar} />{call.peer?.name} កំពុងហៅអ្នក</p>}
            <div className={`call-media ${call.video ? "call-video" : "call-audio"}`}>
              <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />
              {call.video && <video ref={localVideoRef} autoPlay muted playsInline className="local-video" />}
              {!call.video && <div className="call-avatar"><Avatar name={call.peer?.name} avatar={call.peer?.avatar} /></div>}
              {call.status !== "incoming" && <span className="call-state">{call.status === "active" ? "បានភ្ជាប់" : "កំពុងភ្ជាប់..."}</span>}
            </div>
            {call.status === "incoming" ? <div className="call-controls"><button className="call-accept" type="button" onClick={() => respondCall(true)}><Phone size={17} /> ទទួល</button><button className="call-end" type="button" onClick={() => respondCall(false)}><Phone size={17} /> បដិសេធ</button></div> : <div className="call-controls"><button className={`call-toggle ${muted ? "toggle-active" : ""}`} type="button" title={muted ? "បើក microphone" : "បិទ microphone"} onClick={toggleMute}>{muted ? <MicOff size={18} /> : <Mic size={18} />}</button>{call.video && <button className={`call-toggle ${!videoEnabled ? "toggle-active" : ""}`} type="button" title="បើក/បិទ video" onClick={toggleVideo}>{videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}</button>}<button className="call-end" type="button" onClick={endCall}><Phone size={17} /> បិទការហៅ</button></div>}
          </section>
        </div>, document.body,
      )}
    </>
  );
}

export default SocialFeatures;