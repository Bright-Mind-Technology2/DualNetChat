import React, { useState } from 'react';
import {
  Lock,
  User as UserIcon,
  Wifi,
  Eye,
  EyeOff,
  Laptop,
  Smartphone,
  Tablet,
  Monitor,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Sun,
  Moon,
} from 'lucide-react';
import { User, LanInfo } from '../types/chat';
import { Language, translations } from '../translations';

interface AuthScreenProps {
  onAuthenticated: (user: User, token: string) => void;
  lanInfo: LanInfo | null;
  latency: number;
  lang: Language;
  onToggleLang: () => void;
  isLightMode: boolean;
  onToggleTheme: () => void;
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

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onAuthenticated,
  lanInfo,
  latency,
  lang,
  onToggleLang,
  isLightMode,
  onToggleTheme,
}) => {
  const t = translations[lang];
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Login form state
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register form state
  const [regUsername, setRegUsername] = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regEmoji, setRegEmoji] = useState('⚡');
  const [regColor, setRegColor] = useState('#6366f1');
  const [regDevice, setRegDevice] = useState<'desktop' | 'mobile' | 'tablet' | 'laptop'>('laptop');

  // Status & error feedback
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Handle Login submission
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginUsername.trim(),
          password: loginPassword,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('bm_token', data.token);
        localStorage.setItem('bm_auth_user', JSON.stringify(data.user));
        localStorage.setItem('bm_username', data.user.username);
        localStorage.setItem('bm_avatar_color', data.user.avatarColor);
        localStorage.setItem('bm_avatar_emoji', data.user.avatarEmoji);
        localStorage.setItem('bm_device_type', data.user.deviceType);
        onAuthenticated(data.user, data.token);
      } else {
        const errKey = data.error as keyof typeof t;
        setErrorMessage(t[errKey] || t.loginFailed);
      }
    } catch (err: any) {
      setErrorMessage(t.loginFailed);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Register submission
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (regPassword !== regConfirmPassword) {
      setErrorMessage(t.passwordMismatch);
      return;
    }

    if (regPassword.length < 4) {
      setErrorMessage(t.passwordError);
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: regUsername.trim().toLowerCase(),
          displayName: regDisplayName.trim() || regUsername.trim(),
          password: regPassword,
          role: 'user',
          avatarColor: regColor,
          avatarEmoji: regEmoji,
          deviceType: regDevice,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('bm_token', data.token);
        localStorage.setItem('bm_auth_user', JSON.stringify(data.user));
        localStorage.setItem('bm_username', data.user.username);
        localStorage.setItem('bm_avatar_color', data.user.avatarColor);
        localStorage.setItem('bm_avatar_emoji', data.user.avatarEmoji);
        localStorage.setItem('bm_device_type', data.user.deviceType);
        onAuthenticated(data.user, data.token);
      } else {
        const errKey = data.error as keyof typeof t;
        setErrorMessage(t[errKey] || t.registerFailed);
      }
    } catch (err: any) {
      setErrorMessage(t.registerFailed);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-min-viewport min-h-screen w-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 overflow-y-auto selection:bg-indigo-500 selection:text-white">
      {/* Top Navbar */}
      <header className="w-full max-w-5xl mx-auto flex items-center justify-between py-2">
        <div className="flex items-center space-x-2.5">
          <img
            src="/bright-mind-logo.png"
            alt="Bright Mind"
            className="h-9 w-9 rounded-xl object-contain"
          />
          <div>
            <h1 className="font-bold text-slate-100 text-base tracking-tight leading-none">
              Bright Mind
            </h1>
            <p className="text-[11px] text-indigo-400 font-medium mt-0.5">
              {t.appSubtitle}
            </p>
          </div>
        </div>

        {/* Right Tools: Language & LAN status */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:flex items-center space-x-2 px-3 py-1 bg-slate-900 border border-slate-800 rounded-full text-xs text-slate-300">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>{t.connectedLAN}</span>
            {latency > 0 && <span className="font-mono text-emerald-400 font-bold">{latency}ms</span>}
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            title={isLightMode ? t.switchToDarkMode : t.switchToLightMode}
            aria-label={isLightMode ? t.switchToDarkMode : t.switchToLightMode}
            aria-pressed={isLightMode}
            className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-amber-500 transition hover:bg-slate-800 cursor-pointer"
          >
            {isLightMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
          <button
            onClick={onToggleLang}
            className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 rounded-xl text-xs font-bold uppercase transition cursor-pointer"
          >
            {lang === 'km' ? 'EN' : 'ខ្មែរ'}
          </button>
        </div>
      </header>

      {/* Main Authentication Card */}
      <main className="w-full max-w-md mx-auto my-auto py-6">
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl">
          {/* Header Banner */}
          <div className="p-6 text-center border-b border-slate-800/80 bg-gradient-to-b from-indigo-950/30 to-transparent">
            <div className="inline-flex p-3 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-3 shadow-inner">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <h2 className={`${lang === 'km' ? 'khmer-display' : ''} text-xl font-bold text-slate-100 tracking-tight`}>
              {mode === 'login' ? t.login : t.register}
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
              {t.authSubtitle}
            </p>

            {/* Toggle Tabs */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950 rounded-2xl border border-slate-800/80 mt-5">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMessage('');
                }}
                className={`py-2 text-xs font-semibold rounded-xl transition cursor-pointer ${
                  mode === 'login'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.login}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setErrorMessage('');
                }}
                className={`py-2 text-xs font-semibold rounded-xl transition cursor-pointer ${
                  mode === 'register'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.register}
              </button>
            </div>
          </div>

          {/* Error Message Alert */}
          {errorMessage && (
            <div className="mx-6 mt-4 p-3 bg-rose-950/50 border border-rose-500/40 rounded-xl flex items-center gap-2.5 text-xs text-rose-300 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Form Content */}
          <div className="p-6">
            {mode === 'login' ? (
              /* LOGIN FORM */
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {t.usernameLabel}
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      required
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      placeholder="e.g. sovathanak"
                      className="w-full pl-9 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                      autoFocus
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {t.passwordLabel}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                    <input
                      type={showLoginPassword ? 'text' : 'password'}
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 p-0.5"
                    >
                      {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-2 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition cursor-pointer shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>{t.login}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <div className="pt-2 text-center">
                  <p className="text-xs text-slate-400">
                    {t.dontHaveAccount}{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setMode('register');
                        setErrorMessage('');
                      }}
                      className="text-indigo-400 hover:underline font-semibold cursor-pointer"
                    >
                      {t.registerNow}
                    </button>
                  </p>
                </div>
              </form>
            ) : (
              /* REGISTER FORM */
              <form onSubmit={handleRegister} className="space-y-4">
                {/* Live Avatar Preview */}
                <div className="flex items-center gap-3 p-3 bg-slate-950 rounded-2xl border border-slate-800">
                  <div
                    style={{ backgroundColor: regColor }}
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-md ring-2 ring-white/10 shrink-0"
                  >
                    {regEmoji}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-200 truncate">
                      {regDisplayName || regUsername || 'Bright Peer'}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      @{regUsername.toLowerCase() || 'handle'}
                    </p>
                    <span className="text-[10px] text-emerald-400 font-medium">
                      ✓ Ready for LAN
                    </span>
                  </div>
                </div>

                {/* Username */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {t.usernameLabel}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-500 text-sm font-mono">@</span>
                    <input
                      type="text"
                      required
                      minLength={3}
                      maxLength={20}
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                      placeholder="sovathanak"
                      className="w-full pl-8 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                      autoFocus
                    />
                  </div>
                </div>

                {/* Display Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {t.displayNameLabel}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={30}
                    value={regDisplayName}
                    onChange={(e) => setRegDisplayName(e.target.value)}
                    placeholder="Sovathanak Leng"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                {/* Avatar Emoji Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {t.avatarEmoji}
                  </label>
                  <div className="grid grid-cols-8 gap-1.5 p-2 bg-slate-950 rounded-xl border border-slate-800 max-h-28 overflow-y-auto">
                    {EMOJI_OPTIONS.map((em) => (
                      <button
                        type="button"
                        key={em}
                        onClick={() => setRegEmoji(em)}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-base transition cursor-pointer ${
                          regEmoji === em
                            ? 'bg-indigo-600/40 ring-2 ring-indigo-500 scale-110'
                            : 'hover:bg-slate-800'
                        }`}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Avatar Color Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {t.avatarColor}
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {COLOR_OPTIONS.map((col) => (
                      <button
                        type="button"
                        key={col}
                        onClick={() => setRegColor(col)}
                        style={{ backgroundColor: col }}
                        className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                          regColor === col
                            ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900'
                            : 'hover:scale-110'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Passwords */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-400 uppercase">
                      {t.passwordLabel}
                    </label>
                    <div className="relative">
                      <input
                        type={showRegPassword ? 'text' : 'password'}
                        required
                        minLength={4}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-400 uppercase">
                      {t.confirmPasswordLabel}
                    </label>
                    <div className="relative">
                      <input
                        type={showRegPassword ? 'text' : 'password'}
                        required
                        minLength={4}
                        value={regConfirmPassword}
                        onChange={(e) => setRegConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                      />
                    </div>
                  </div>
                </div>

                {/* Device Type */}
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {[
                    { type: 'laptop', label: 'Laptop', icon: Laptop },
                    { type: 'mobile', label: 'Phone', icon: Smartphone },
                    { type: 'tablet', label: 'Tablet', icon: Tablet },
                    { type: 'desktop', label: 'Desktop', icon: Monitor },
                  ].map(({ type, label, icon: Icon }) => (
                    <button
                      type="button"
                      key={type}
                      onClick={() => setRegDevice(type as any)}
                      className={`flex flex-col items-center justify-center p-2 rounded-xl border text-[11px] font-medium transition cursor-pointer gap-1 ${
                        regDevice === type
                          ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-2 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition cursor-pointer shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>{t.register}</span>
                      <CheckCircle2 className="w-4 h-4" />
                    </>
                  )}
                </button>

                <div className="pt-2 text-center">
                  <p className="text-xs text-slate-400">
                    {t.alreadyHaveAccount}{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setErrorMessage('');
                      }}
                      className="text-indigo-400 hover:underline font-semibold cursor-pointer"
                    >
                      {t.loginNow}
                    </button>
                  </p>
                </div>
              </form>
            )}

          </div>
        </div>
      </main>

      {/* Footer info */}
      <footer className="w-full max-w-md mx-auto text-center py-2 text-xs text-slate-500">
        <p className="flex items-center justify-center gap-1.5">
          <Wifi className="w-3.5 h-3.5 text-indigo-400" />
          <span>{t.noInternetNeeded}</span>
        </p>
      </footer>
    </div>
  );
};
