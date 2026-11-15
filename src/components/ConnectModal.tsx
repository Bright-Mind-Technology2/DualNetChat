import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Wifi, QrCode, Copy, Check, X, Smartphone, Laptop, Globe2, ShieldCheck } from 'lucide-react';
import { LanInfo } from '../types/chat';
import { Language, translations } from '../translations';

interface ConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  lanInfo: LanInfo | null;
  lang: Language;
}

export const ConnectModal: React.FC<ConnectModalProps> = ({
  isOpen,
  onClose,
  lanInfo,
  lang,
}) => {
  const t = translations[lang];
  const [selectedIp, setSelectedIp] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Determine current host and best LAN URL
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const port = lanInfo?.port || (typeof window !== 'undefined' ? window.location.port || '3000' : '3000');
  const protocol = lanInfo?.protocol || (typeof window !== 'undefined' ? window.location.protocol.replace(':', '') : 'http');
  const lanIps = lanInfo?.lanIps || [];

  useEffect(() => {
    if (lanIps.length > 0 && !selectedIp) {
      setSelectedIp(lanIps[0]);
    }
  }, [lanIps, selectedIp]);

  // Construct target shareable URL
  const activeUrl = selectedIp
    ? `${protocol}://${selectedIp}:${port}`
    : currentOrigin || `${protocol}://localhost:${port}`;

  useEffect(() => {
    if (activeUrl) {
      QRCode.toDataURL(activeUrl, {
        width: 260,
        margin: 1.5,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('QR generation error:', err));
    }
  }, [activeUrl]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <Wifi className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-lg leading-tight">
                {t.connectOtherDevices}
              </h3>
              <p className="text-xs text-emerald-400 font-medium flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                {t.noInternetNeeded}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          <p className="text-sm text-slate-300 leading-relaxed">
            {t.connectInstructions}
          </p>
          {protocol !== 'https' && (
            <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
              {t.lanVideoHttpsWarning}
            </div>
          )}

          {/* QR Code Card */}
          <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="p-2 bg-white rounded-xl shadow-lg shrink-0">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Wi-Fi Join QR Code"
                  className="w-44 h-44 object-contain rounded-lg"
                />
              ) : (
                <div className="w-44 h-44 flex items-center justify-center text-slate-400">
                  <QrCode className="w-12 h-12 animate-pulse" />
                </div>
              )}
            </div>

            <div className="flex-1 space-y-3 text-left w-full">
              <div className="text-xs font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4" />
                {lang === 'km' ? 'ស្កេនភ្លាមៗដោយកាមេរ៉ា' : 'Scan via phone camera'}
              </div>

              <div className="space-y-1">
                <div className="text-xs text-slate-400">{t.lanIpDetected}</div>
                {lanIps.length > 1 ? (
                  <select
                    value={selectedIp}
                    onChange={(e) => setSelectedIp(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    {lanIps.map((ip) => (
                      <option key={ip} value={ip}>
                        {ip} (Wi-Fi LAN)
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-sm font-mono text-slate-200 bg-slate-800/60 px-2.5 py-1 rounded border border-slate-700/60">
                    {selectedIp || '127.0.0.1'}
                  </div>
                )}
              </div>

              <div className="pt-1">
                <button
                  onClick={handleCopy}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition shadow-md shadow-indigo-600/20 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-300" />
                      <span>{t.copied}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>{t.copyLink}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Direct Address display */}
          <div className="p-3 bg-slate-800/40 border border-slate-800 rounded-xl flex items-center justify-between text-xs font-mono text-slate-300 break-all">
            <span className="text-indigo-400 select-all">{activeUrl}</span>
            <span className="shrink-0 text-slate-500 ml-2">Port: {port}</span>
          </div>

          {/* Quick 3-Step Guide */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
            <div className="p-3 rounded-lg bg-slate-850 border border-slate-800/60 space-y-1">
              <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5 text-indigo-400" />
                {lang === 'km' ? 'ជំហានទី ១' : 'Step 1'}
              </div>
              <p className="text-slate-400">
                {lang === 'km'
                  ? 'ភ្ជាប់ឧបករណ៍ទាំងអស់ទៅ Wi-Fi ឬ Hotspot តែមួយ'
                  : 'Connect all devices to the same Wi-Fi or phone hotspot.'}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-850 border border-slate-800/60 space-y-1">
              <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                {lang === 'km' ? 'ជំហានទី ២' : 'Step 2'}
              </div>
              <p className="text-slate-400">
                {lang === 'km'
                  ? 'បើកកាមេរ៉ាទូរស័ព្ទស្កេន QR Code ឬវាយបញ្ចូល Link'
                  : 'Open camera to scan QR Code or type the LAN URL.'}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-850 border border-slate-800/60 space-y-1">
              <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                {lang === 'km' ? 'ជំហានទី ៣' : 'Step 3'}
              </div>
              <p className="text-slate-400">
                {lang === 'km'
                  ? 'ជជែក ផ្ញើសំឡេង និងរូបភាពបានរលូន 100% Offline'
                  : 'Chat, share voice clips & files 100% offline at LAN speeds.'}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-900 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl transition cursor-pointer"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
};
