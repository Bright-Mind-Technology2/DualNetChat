import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import SocialFeatures from "./SocialFeatures.jsx";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  FileText,
  MessageCircle,
  Paperclip,
  Send,
  ShieldCheck,
  Smile,
  Sparkles,
  UsersRound,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

function initials(name = "") {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => Array.from(part)[0] || "")
      .join("")
      .toUpperCase() || "?"
  );
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatFileSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getOrCreateUserId() {
  const existing = localStorage.getItem("bright-mind-user-id");
  if (existing) return existing;
  const generated = globalThis.crypto?.randomUUID?.() || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === "x" ? value : (value & 3) | 8).toString(16);
  });
  localStorage.setItem("bright-mind-user-id", generated);
  return generated;
}

function getInitialRoom() {
  const savedRoom = localStorage.getItem("bright-mind-room") || "";
  return ["general", "study", "project"].includes(savedRoom)
    ? "lobby"
    : savedRoom || "lobby";
}

function Avatar({ name, avatar, small = false }) {
  const palette = [
    "avatar-mint",
    "avatar-blue",
    "avatar-peach",
    "avatar-yellow",
  ];
  const colorIndex =
    Array.from(name || "?").reduce((sum, char) => sum + char.charCodeAt(0), 0) %
    palette.length;
  return (
    <span
      className={`avatar ${small ? "avatar-small" : ""} ${palette[colorIndex]}`}
    >
      {avatar ? <img src={avatar} alt="" /> : initials(name)}
    </span>
  );
}

function Welcome({ onJoin }) {
  const [nameDraft, setNameDraft] = useState("");

  function submit(event) {
    event.preventDefault();
    const cleanName = nameDraft.trim().replace(/\s+/g, " ").slice(0, 24);
    if (cleanName) onJoin(cleanName);
  }

  return (
    <main className="welcome-page">
      <div className="welcome-topline">
        <a
          className="brand brand-dark"
          href="#top"
          aria-label="Bright Mind Chat"
        >
          <span className="brand-mark">
            <Sparkles size={20} />
          </span>
          <span>
            bright mind<span className="brand-dot">.</span>
            <small>CHAT, CONNECT, CREATE</small>
          </span>
        </a>
        <span className="welcome-local">
          <span className="live-dot" /> YOUR PEOPLE, ONE ROOM AWAY
        </span>
      </div>
      <section className="welcome-content" id="top">
        <div className="welcome-copy">
          <p className="eyebrow">
            <span>01</span> A little room for big ideas
          </p>
          <h1>
            Good thoughts
            <br />
            travel <em>together.</em>
          </h1>
          <p className="welcome-description">
            ជជែក រៀន និងចែករំលែកឯកសារ ជាមួយមិត្តភក្តិរបស់អ្នក។
            ដាក់ឈ្មោះដើម្បីចូលរួម។
          </p>
          <form className="join-form" onSubmit={submit}>
            <label htmlFor="join-name">ឈ្មោះដែលអ្នកចង់ប្រើ</label>
            <div className="join-input-row">
              <input
                id="join-name"
                autoComplete="nickname"
                autoFocus
                maxLength={24}
                onChange={(event) => setNameDraft(event.target.value)}
                placeholder="ឧ. សុភា"
                value={nameDraft}
              />
              <button
                className="join-button"
                type="submit"
                disabled={!nameDraft.trim()}
                aria-label="ចូលរួម chat"
              >
                <ArrowUpRight size={21} />
              </button>
            </div>
            <span className="join-note">
              <ShieldCheck size={14} />{" "}
              ឈ្មោះរបស់អ្នកត្រូវបានរក្សាទុកតែលើឧបករណ៍នេះ
            </span>
          </form>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="art-grid" />
          <div className="art-sun">B</div>
          <div className="art-note art-note-one">
            <span className="note-avatar note-green">S</span>
            <span>
              Ideas look better
              <br />
              when shared.
            </span>
            <span className="note-spark">✳</span>
          </div>
          <div className="art-note art-note-two">
            <span className="note-avatar note-blue">M</span>
            <span>
              See you in
              <br />
              the study room
            </span>
            <span className="note-tail" />
          </div>
          <div className="art-caption">
            <span>
              BRIGHT MINDS
              <br />
              MEET HERE
            </span>
            <ArrowUpRight size={17} />
          </div>
        </div>
      </section>
      <footer className="welcome-footer">
        <span>BRIGHT MIND CHAT</span>
        <span>MADE FOR GOOD CONVERSATIONS</span>
        <span>01 — 03</span>
      </footer>
    </main>
  );
}

function App() {
  const [userId] = useState(getOrCreateUserId);
  const [name, setName] = useState(
    () => localStorage.getItem("bright-mind-name") || "",
  );
  const [avatar, setAvatar] = useState(
    () => localStorage.getItem("bright-mind-avatar") || "",
  );
  const [activeRoom, setActiveRoom] = useState(getInitialRoom);
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [socialData, setSocialData] = useState({ friends: [], incoming: [], outgoing: [], groups: [] });
  const [activeSocket, setActiveSocket] = useState(null);
  const [connection, setConnection] = useState("connecting");
  const [draft, setDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const socketRef = useRef(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const directIds = activeRoom.startsWith("dm:") ? activeRoom.slice(3).split(":") : [];
  const chattingWith = socialData.friends.find((friend) => directIds.includes(friend.userId) && friend.userId !== userId) || null;
  const activeGroup = socialData.groups.find((group) => `group:${group.id}` === activeRoom) || null;
  const isLobby = activeRoom === "lobby";
  const room = isLobby
    ? {
        id: "lobby",
        label: "សាររបស់ខ្ញុំ",
        english: "YOUR SPACE",
        description: "ជ្រើសមិត្តភក្តិ ឬបង្កើត group ដើម្បីចាប់ផ្តើម",
      }
    : chattingWith
      ? { id: activeRoom, label: chattingWith.name, english: "Private chat", description: "ជជែកជាលក្ខណៈឯកជន" }
      : activeGroup
        ? { id: activeRoom, label: activeGroup.name, english: "Group chat", description: "ជជែកជាមួយក្រុមរបស់អ្នក" }
        : { id: activeRoom, label: "Chat", english: "Chat", description: "ជជែកជាមួយមិត្តភក្តិ" };

  useEffect(() => {
    if (!name) return undefined;
    const socket = io({ auth: { userId, name, avatar, room: activeRoom }, reconnection: true });
    socketRef.current = socket;
    socket.on("connect", () => {
      setActiveSocket(socket);
      setConnection("online");
      setNotice("");
    });
    socket.on("disconnect", () => {
      setActiveSocket(null);
      setConnection("offline");
    });
    socket.on("connect_error", () => {
      setActiveSocket(null);
      setConnection("offline");
    });
    socket.on("profile:ready", (profile) => {
      if (!profile) return;
      setName(profile.name);
      setAvatar(profile.avatar || "");
      localStorage.setItem("bright-mind-name", profile.name);
      localStorage.setItem("bright-mind-avatar", profile.avatar || "");
    });
    socket.on("social:data", setSocialData);
    socket.on("history", (payload) => {
      if (payload.room === activeRoom) setMessages(payload.messages);
    });
    socket.on("message:new", (message) => {
      if (message.room === activeRoom) {
        setMessages((current) =>
          current.some((item) => item.id === message.id)
            ? current
            : [...current, message],
        );
      }
    });
    socket.on("presence:update", (payload) => {
      if (payload.room === activeRoom) setOnlineUsers(payload.users);
    });
    socket.on("message:profile-updated", (profile) => {
      setMessages((current) => current.map((message) => message.senderId === profile.userId
        ? { ...message, sender: profile.name, senderAvatar: profile.avatar }
        : message));
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
      setActiveSocket((current) => current === socket ? null : current);
    };
  }, [userId, name, avatar, activeRoom]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages]);

  function join(nameToUse) {
    localStorage.setItem("bright-mind-name", nameToUse);
    setConnection("connecting");
    setName(nameToUse);
  }

  function updateLocalProfile(profile) {
    setName(profile.name);
    setAvatar(profile.avatar || "");
    localStorage.setItem("bright-mind-name", profile.name);
    localStorage.setItem("bright-mind-avatar", profile.avatar || "");
  }

  function selectRoom(roomId) {
    localStorage.setItem("bright-mind-room", roomId);
    setMessages([]);
    setOnlineUsers([]);
    setConnection("connecting");
    setActiveRoom(roomId);
  }

  function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !socketRef.current?.connected) return;
    socketRef.current.emit("message:send", { text }, (result) => {
      if (result?.ok) setDraft("");
      else
        setNotice(result?.error || "សារមិនទាន់បានផ្ញើទេ។ សូមសាកល្បងម្ដងទៀត។");
    });
  }

  async function shareFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setNotice("ឯកសារត្រូវតែមានទំហំតិចជាង 20 MB។");
      return;
    }
    if (connection !== "online") {
      setNotice("សូមភ្ជាប់ទៅ server មុនពេលផ្ញើឯកសារ។");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    setUploading(true);
    setNotice("");
    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: { "x-chat-user": userId, "x-chat-room": activeRoom },
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "ផ្ញើឯកសារមិនបានទេ។");
    } catch (error) {
      setNotice(error.message || "ផ្ញើឯកសារមិនបានទេ។ សូមសាកល្បងម្ដងទៀត។");
    } finally {
      setUploading(false);
    }
  }

  if (!name) return <Welcome onJoin={join} />;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#chat"
          aria-label="Bright Mind Chat home"
          onClick={(event) => {
            event.preventDefault();
            selectRoom("lobby");
          }}
        >
          <span className="brand-mark">
            <Sparkles size={19} />
          </span>
          <span>
            bright mind<span className="brand-dot">.</span>
            <small>CHAT, CONNECT, CREATE</small>
          </span>
        </a>
        <div className="side-section-label">
          <span>មិត្តភក្តិ និងក្រុម</span>
          <span>{(socialData.friends.length + socialData.groups.length).toString().padStart(2, "0")}</span>
        </div>
        <div className="social-room-list">
          {socialData.friends.map((friend) => {
            const friendRoom = `dm:${[userId, friend.userId].sort().join(":")}`;
            return (
              <button
                className={`room-link social-room-link ${activeRoom === friendRoom ? "room-active" : ""}`}
                key={friend.userId}
                onClick={() => selectRoom(friendRoom)}
                type="button"
              >
                <Avatar name={friend.name} avatar={friend.avatar} small />
                <span className="room-label"><strong>{friend.name}</strong><small>មិត្តភក្តិ</small></span>
              </button>
            );
          })}
          {socialData.groups.map((group) => (
            <button
              className={`room-link social-room-link ${activeRoom === `group:${group.id}` ? "room-active" : ""}`}
              key={group.id}
              onClick={() => selectRoom(`group:${group.id}`)}
              type="button"
            >
              <span className="room-number"><UsersRound size={14} /></span>
              <span className="room-label"><strong>{group.name}</strong><small>Group chat</small></span>
            </button>
          ))}
          {socialData.friends.length === 0 && socialData.groups.length === 0 && (
            <p className="social-empty sidebar-empty">បន្ថែមមិត្តភក្តិ ឬបង្កើត group ដើម្បីចាប់ផ្តើម។</p>
          )}
        </div>
        <SocialFeatures
          socket={activeSocket}
          userId={userId}
          name={name}
          avatar={avatar}
          socialData={socialData}
          chattingWith={chattingWith}
          onSelectRoom={selectRoom}
          onProfileUpdated={updateLocalProfile}
          onNotice={setNotice}
        />
        <div className="sidebar-note">
          <div className="note-top">
            <span className="note-icon">
              <MessageCircle size={15} />
            </span>
            <span>SPACE TO THINK</span>
          </div>
          <p>គំនិតល្អៗចាប់ផ្តើមពីការសន្ទនា។</p>
          <span className="note-line" />
        </div>
        <div className="profile-button">
          <Avatar name={name} avatar={avatar} small />
          <span className="profile-copy">
            <strong>{name}</strong>
            <small>គណនីរបស់ខ្ញុំ</small>
          </span>
          <span className="profile-edit" title="ប្ដូរឈ្មោះ">
            <ArrowUpRight size={15} />
          </span>
        </div>
      </aside>

      <section className="chat-panel" id="chat">
        <header className="chat-header">
          <div className="chat-heading">
            <span className="header-kicker">
              BRIGHT MIND / {room.english.toUpperCase()}
            </span>
            <h1>
              {room.label}
              <span className="heading-period">.</span>
            </h1>
            <p>{room.description}</p>
          </div>
          <div className="header-actions">
            <div
              className={`connection-pill connection-${connection}`}
              title={
                connection === "online"
                  ? "បានភ្ជាប់ទៅ server"
                  : "កំពុងភ្ជាប់ទៅ server"
              }
            >
              {connection === "online" ? (
                <Wifi size={14} />
              ) : (
                <WifiOff size={14} />
              )}
              <span>
                {connection === "online"
                  ? "ភ្ជាប់រួច"
                  : connection === "connecting"
                    ? "កំពុងភ្ជាប់"
                    : "មិនទាន់ភ្ជាប់"}
              </span>
            </div>
            <span className="header-divider" />
            <div
              className="header-people"
              title={`${onlineUsers.length} នាក់ online`}
            >
              <UsersRound size={17} />
              <span>{onlineUsers.length}</span>
            </div>
          </div>
        </header>
        <div className="room-banner">
          <span className="banner-mark">
            <Sparkles size={15} />
          </span>
          <span>
            <strong>{room.english}</strong>
            <span className="banner-separator">/</span>
            {room.description}
          </span>
          {!isLobby && (
            <span className="banner-live">
              <span className="live-dot" /> LIVE ROOM
            </span>
          )}
        </div>

        <section
          className="message-list"
          aria-label={`សារក្នុងបន្ទប់ ${room.label}`}
          aria-live="polite"
        >
          {isLobby ? (
            <div className="empty-state">
              <div className="empty-illustration">
                <UsersRound size={24} />
                <span className="empty-spark">✳</span>
              </div>
              <span className="empty-kicker">YOUR PEOPLE, YOUR SPACE</span>
              <h2>ចាប់ផ្តើមជជែកជាមួយមិត្ត</h2>
              <p>បន្ថែមមិត្តភក្តិ ឬបង្កើត group ដើម្បីចាប់ផ្តើម chat។</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-illustration">
                <MessageCircle size={24} />
                <span className="empty-spark">✳</span>
              </div>
              <span className="empty-kicker">A FRESH PAGE</span>
              <h2>ចាប់ផ្តើមការសន្ទនា</h2>
              <p>
                សរសេរសារដំបូងក្នុងបន្ទប់ <strong>{room.label}</strong> នេះ។
              </p>
            </div>
          ) : (
            <div className="messages-wrap">
              <div className="day-divider">
                <span>សារថ្មីៗ</span>
              </div>
              {messages.map((message) => {
                const ownMessage = message.senderId === userId || message.sender === name;
                return (
                  <article
                    className={`message-row ${ownMessage ? "message-own" : ""}`}
                    key={message.id}
                  >
                    {!ownMessage && <Avatar name={message.sender} avatar={message.senderAvatar} small />}
                    <div className="message-body">
                      <div className="message-meta">
                        {!ownMessage && <strong>{message.sender}</strong>}
                        <time dateTime={message.createdAt}>
                          {formatTime(message.createdAt)}
                        </time>
                        {ownMessage && (
                          <Check size={13} className="message-check" />
                        )}
                      </div>
                      <div
                        className={`message-bubble ${ownMessage ? "bubble-own" : ""}`}
                      >
                        {message.text && <p>{message.text}</p>}
                        {message.fileUrl && (
                          <a
                            className="file-attachment"
                            href={message.fileUrl}
                            download={message.fileName}
                          >
                            <span className="file-icon">
                              <FileText size={18} />
                            </span>
                            <span className="file-copy">
                              <strong>{message.fileName}</strong>
                              <small>{formatFileSize(message.fileSize)}</small>
                            </span>
                            <ArrowDownToLine
                              size={16}
                              className="file-download"
                            />
                          </a>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </section>

        {notice && (
          <div className="notice-bar" role="status">
            <span>{notice}</span>
            <button
              type="button"
              aria-label="បិទសារ"
              onClick={() => setNotice("")}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {!isLobby && <footer className="composer-area">
          <form className="composer" onSubmit={sendMessage}>
            <textarea
              aria-label="សរសេរសារ"
              maxLength={2000}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={`សរសេរសារទៅកាន់ ${room.label}...`}
              rows={1}
              value={draft}
            />
            <div className="composer-tools">
              <div className="composer-left">
                <input
                  ref={fileInputRef}
                  className="visually-hidden"
                  onChange={shareFile}
                  type="file"
                />
                <button
                  className="tool-button"
                  type="button"
                  title="ផ្ញើឯកសារ (អតិបរមា 20 MB)"
                  aria-label="ផ្ញើឯកសារ"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? (
                    <span className="upload-spinner" />
                  ) : (
                    <Paperclip size={17} />
                  )}
                </button>
                <span className="composer-hint">
                  <Smile size={14} /> Shift + Enter សម្រាប់បន្ទាត់ថ្មី
                </span>
              </div>
              <button
                className="send-button"
                type="submit"
                disabled={!draft.trim() || connection !== "online"}
                aria-label="ផ្ញើសារ"
              >
                <span>ផ្ញើ</span>
                <Send size={15} />
              </button>
            </div>
          </form>
          <p className="composer-footnote">
            សាររបស់អ្នកនឹងឃើញដោយអ្នកគ្រប់គ្នាក្នុងបន្ទប់នេះ
          </p>
        </footer>}
      </section>

      <aside className="people-panel">
        <div className="people-heading">
          <span className="side-section-label">មនុស្សក្នុងបន្ទប់</span>
          <span className="people-count">
            {onlineUsers.length.toString().padStart(2, "0")}
          </span>
        </div>
        <div className="online-label">
          <span className="live-dot" /> ONLINE NOW
        </div>
        <div className="people-list">
          {onlineUsers.map((person) => (
            <div className="person-row" key={person.userId}>
              <div className="person-avatar-wrap">
                <Avatar name={person.name} avatar={person.avatar} small />
                <span className="person-online" />
              </div>
              <span className="person-copy">
                <strong>
                  {person.name}
                  {person.userId === userId ? " (អ្នក)" : ""}
                </strong>
                <small>{person.userId === userId ? "នៅទីនេះ" : "កំពុងជជែក"}</small>
              </span>
            </div>
          ))}
          {onlineUsers.length === 0 && (
            <p className="people-empty">កំពុងស្វែងរកអ្នកប្រើ...</p>
          )}
        </div>
        <div className="people-footer">
          <span className="footer-star">✳</span>
          <p>
            “A bright mind
            <br />
            is a shared mind.”
          </p>
          <span className="quote-credit">BRIGHT MIND NOTEBOOK · 01</span>
        </div>
        <div className="network-note">
          <Wifi size={15} />
          <span>
            ដំណើរការតាម Wi-Fi ក្នុងតំបន់
            <br />
            ឬតាមអ៊ីនធឺណិត
          </span>
        </div>
      </aside>

    </main>
  );
}

export default App;
