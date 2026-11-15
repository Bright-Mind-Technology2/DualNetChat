// Web Audio API Synthesizer for notifications (100% offline, zero network requests)
class SoundManager {
  private audioCtx: AudioContext | null = null;
  public enabled: boolean = true;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      if (!this.audioCtx) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          this.audioCtx = new AudioCtx();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  playMessageSound() {
    if (!this.enabled) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08); // A5

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } catch {
      // Audio context may be restricted before user gesture
    }
  }

  playSendSound() {
    if (!this.enabled) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.09);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.14);
    } catch {}
  }

  playJoinSound() {
    if (!this.enabled) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.12); // C6

      gain.gain.setValueAtTime(0.09, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {}
  }
}

export const soundManager = new SoundManager();

// Cross-browser Voice Recorder with safe audio formats (Chrome, Safari iOS, Android, Firefox)
export class VoiceRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private mimeType: string = 'audio/webm';

  async start(): Promise<boolean> {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('getUserMedia not supported in this browser environment');
        return false;
      }

      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];

      // Determine best supported mimeType across Safari/Chrome/Firefox
      let selectedMime = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          selectedMime = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          selectedMime = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          selectedMime = 'audio/mp4'; // Safari iOS support
        } else if (MediaRecorder.isTypeSupported('audio/aac')) {
          selectedMime = 'audio/aac';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          selectedMime = 'audio/ogg';
        } else {
          selectedMime = '';
        }
      }

      this.mimeType = selectedMime || 'audio/webm';

      const options = selectedMime ? { mimeType: selectedMime } : undefined;
      this.mediaRecorder = new MediaRecorder(this.stream, options);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(250); // collect chunks every 250ms
      return true;
    } catch (err) {
      console.error('Microphone access or MediaRecorder start error:', err);
      this.cleanup();
      return false;
    }
  }

  stop(): Promise<{ blob: Blob; base64: string; mimeType: string } | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        this.cleanup();
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        const finalType = this.mimeType || 'audio/webm';
        const audioBlob = new Blob(this.audioChunks, { type: finalType });
        this.cleanup();

        if (audioBlob.size === 0) {
          resolve(null);
          return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
          resolve({
            blob: audioBlob,
            base64: reader.result as string,
            mimeType: finalType,
          });
        };
        reader.onerror = () => {
          resolve(null);
        };
        reader.readAsDataURL(audioBlob);
      };

      try {
        this.mediaRecorder.stop();
      } catch (err) {
        console.error('Error stopping MediaRecorder:', err);
        this.cleanup();
        resolve(null);
      }
    });
  }

  cancel() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }
    this.cleanup();
  }

  private cleanup() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
  }
}
