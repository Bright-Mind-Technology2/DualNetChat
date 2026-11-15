import React, { useRef, useState, useEffect } from 'react';
import { X, Eraser, Pen, Trash2, Send, RotateCcw } from 'lucide-react';
import { Language, translations } from '../translations';
import { socketClient } from '../services/socket';

interface WhiteboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelId: string;
  lang: Language;
  onSendSketchToChat: (sketchDataUrl: string) => void;
}

interface StrokePoint {
  x: number;
  y: number;
}

interface StrokeData {
  points: StrokePoint[];
  color: string;
  size: number;
  isEraser: boolean;
}

const COLORS = [
  '#ffffff', // White
  '#f87171', // Red
  '#fb923c', // Orange
  '#facc15', // Yellow
  '#4ade80', // Green
  '#38bdf8', // Sky
  '#818cf8', // Indigo
  '#c084fc', // Purple
  '#f43f5e', // Rose
];

export const WhiteboardModal: React.FC<WhiteboardModalProps> = ({
  isOpen,
  onClose,
  channelId,
  lang,
  onSendSketchToChat,
}) => {
  const t = translations[lang];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#818cf8');
  const [size, setSize] = useState(4);
  const [isEraser, setIsEraser] = useState(false);
  const currentStrokeRef = useRef<StrokePoint[]>([]);

  // Redraw full stroke
  const drawStrokeSegment = (
    ctx: CanvasRenderingContext2D,
    p1: StrokePoint,
    p2: StrokePoint,
    strokeColor: string,
    strokeSize: number,
    eraser: boolean
  ) => {
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = eraser ? '#090d16' : strokeColor;
    ctx.lineWidth = eraser ? strokeSize * 3 : strokeSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  // Listen for socket whiteboard strokes from other peers on the LAN
  useEffect(() => {
    if (!isOpen) return;

    const socket = socketClient.socket;
    if (!socket) return;

    const handleRemoteStroke = (data: { channelId: string; stroke: StrokeData }) => {
      if (data.channelId !== channelId) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { points, color: sColor, size: sSize, isEraser: sEraser } = data.stroke;
      if (points.length < 2) return;

      for (let i = 0; i < points.length - 1; i++) {
        drawStrokeSegment(ctx, points[i], points[i + 1], sColor, sSize, sEraser);
      }
    };

    const handleRemoteClear = (data: { channelId: string }) => {
      if (data.channelId !== channelId) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    socket.on('whiteboard:stroke', handleRemoteStroke);
    socket.on('whiteboard:clear', handleRemoteClear);

    return () => {
      socket.off('whiteboard:stroke', handleRemoteStroke);
      socket.off('whiteboard:clear', handleRemoteClear);
    };
  }, [isOpen, channelId]);

  // Initialize canvas background once mounted
  useEffect(() => {
    if (isOpen && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#090d16';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX = 0;
    let clientY = 0;

    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handleStartDraw = (e: React.MouseEvent | React.TouchEvent) => {
    const coords = getCanvasCoords(e);
    setIsDrawing(true);
    currentStrokeRef.current = [coords];
  };

  const handleDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getCanvasCoords(e);
    const pts = currentStrokeRef.current;
    const lastPoint = pts[pts.length - 1];

    if (lastPoint) {
      drawStrokeSegment(ctx, lastPoint, coords, color, size, isEraser);
      pts.push(coords);

      // Throttled or immediate segment emit
      socketClient.sendWhiteboardStroke(channelId, {
        points: [lastPoint, coords],
        color,
        size,
        isEraser,
      });
    }
  };

  const handleEndDraw = () => {
    setIsDrawing(false);
    currentStrokeRef.current = [];
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    socketClient.clearWhiteboard(channelId);
  };

  const handleSendToChat = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSendSketchToChat(dataUrl);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[95vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <Pen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-base">
                {t.whiteboardTitle}
              </h3>
              <p className="text-xs text-slate-400">
                {lang === 'km'
                  ? 'គូររួមគ្នាជាមួយអ្នកដទៃនៅលើ Wi-Fi ក្នុងស្រុកភ្លាមៗ'
                  : 'Collaborative real-time canvas across Wi-Fi peers'}
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

        {/* Toolbar */}
        <div className="px-5 py-2.5 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Tools & Palette */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setIsEraser(false)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                !isEraser
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Pen className="w-3.5 h-3.5" />
              <span>{t.brush}</span>
            </button>

            <button
              onClick={() => setIsEraser(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                isEraser
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>{t.eraser}</span>
            </button>

            <div className="h-5 w-px bg-slate-800 mx-1" />

            {/* Color Palette */}
            {!isEraser && (
              <div className="flex items-center gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    style={{ backgroundColor: c }}
                    className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                      color === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900' : 'hover:scale-110'
                    }`}
                  />
                ))}
              </div>
            )}

            <div className="h-5 w-px bg-slate-800 mx-1" />

            {/* Brush Size */}
            <div className="flex items-center gap-2 text-slate-400">
              <span>{t.brushSize}:</span>
              <input
                type="range"
                min="2"
                max="24"
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
                className="w-20 accent-indigo-500 cursor-pointer"
              />
              <span className="text-slate-200 w-4 text-right font-mono">{size}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-rose-950/60 hover:text-rose-400 text-slate-300 rounded-lg transition cursor-pointer border border-slate-700"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t.clearCanvas}</span>
            </button>

            <button
              onClick={handleSendToChat}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition cursor-pointer shadow-md shadow-emerald-600/20"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{t.sendToChat}</span>
            </button>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="relative flex-1 bg-[#090d16] flex items-center justify-center p-3 overflow-hidden select-none touch-none">
          <canvas
            ref={canvasRef}
            width={900}
            height={520}
            onMouseDown={handleStartDraw}
            onMouseMove={handleDraw}
            onMouseUp={handleEndDraw}
            onMouseLeave={handleEndDraw}
            onTouchStart={handleStartDraw}
            onTouchMove={handleDraw}
            onTouchEnd={handleEndDraw}
            className="w-full h-auto max-h-[60vh] object-contain rounded-xl border border-slate-800/80 shadow-2xl cursor-crosshair bg-[#090d16]"
          />
        </div>
      </div>
    </div>
  );
};
