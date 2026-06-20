// 语音输入：Web Speech API 优先，Tauri 下 MediaRecorder + ASR API 回退

import { isTauri, transcribeAudio } from "../api/tauri";
import {
  loadVoiceControlEnabled,
  loadVoiceSendEnabled,
} from "./guiPrefs";

/** Web Speech API 类型扩展 */
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly [index: number]: { transcript: string };
}

interface SpeechRecognitionEventLike extends Event {
  readonly results: SpeechRecognitionResultLike[];
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

/** 是否支持任一语音识别路径 */
export function voiceInputSupported(): boolean {
  if (typeof window === "undefined") return false;
  const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  return Boolean(SR) || isTauri();
}

/** 将 AudioBuffer 编码为 WAV Blob（16-bit PCM mono） */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = 1;
  const sampleRate = buffer.sampleRate;
  const samples = buffer.getChannelData(0);
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return new Blob([header, pcm.buffer], { type: "audio/wav" });
}

/** Blob → base64 data URL */
async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** MediaRecorder 录音并转 WAV base64，供 Tauri ASR */
async function recordViaMediaDevices(maxMs = 30_000): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  try {
    const ctx = new AudioContext();
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const done = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));
      recorder.onerror = () => reject(new Error("录音失败"));
    });
    recorder.start();
    await new Promise((r) => setTimeout(r, maxMs));
    recorder.stop();
    const raw = await done;
    const arrayBuf = await raw.arrayBuffer();
    const audioBuf = await ctx.decodeAudioData(arrayBuf.slice(0));
    const wav = audioBufferToWav(audioBuf);
    await ctx.close();
    return blobToDataUrl(wav);
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

export interface VoiceCaptureCallbacks {
  /** 插入或追加转写文本 */
  onTranscript: (text: string, final: boolean) => void;
  /** voice-send 模式下自动发送 */
  onAutoSend?: (text: string) => void;
  /** 当前 Composer 全文（voice-control 用） */
  getCurrentText?: () => string;
  locale?: "zh" | "en";
}

export interface VoiceCaptureController {
  listening: boolean;
  supported: boolean;
  /** 开始/停止一次录音 */
  toggleListening: () => Promise<void>;
  /** 强制停止 */
  stop: () => void;
}

/**
 * 创建语音采集控制器（Composer 挂载/卸载时配对使用）。
 * 优先 Web Speech；桌面无 Speech 时走 MediaRecorder + Tauri transcribe_audio。
 */
export function createVoiceCapture(cb: VoiceCaptureCallbacks): VoiceCaptureController {
  let listening = false;
  let recognition: SpeechRecognitionLike | null = null;
  let mediaAbort: AbortController | null = null;

  const SR = typeof window !== "undefined"
    ? window.SpeechRecognition ?? window.webkitSpeechRecognition
    : undefined;

  const supported = Boolean(SR) || isTauri();

  /** 判断是否应自动发送（句末标点） */
  const maybeAutoSend = (text: string) => {
    if (!loadVoiceSendEnabled() || !cb.onAutoSend) return;
    const t = text.trim();
    if (/[.。!！?？]$/.test(t)) {
      cb.onAutoSend(t);
    }
  };

  /** Tauri MediaRecorder + ASR 路径 */
  const captureViaTauri = async () => {
    mediaAbort = new AbortController();
    try {
      const dataUrl = await recordViaMediaDevices(25_000);
      if (mediaAbort.signal.aborted) return;
      const text = await transcribeAudio({
        wavBase64: dataUrl,
        voiceControl: loadVoiceControlEnabled(),
        currentText: cb.getCurrentText?.() ?? "",
      });
      if (!text.trim()) return;
      cb.onTranscript(text, true);
      maybeAutoSend(text);
    } catch (e) {
      const msg = (e as Error).message;
      alert(cb.locale === "zh" ? `语音识别失败：${msg}` : `Voice failed: ${msg}`);
    } finally {
      listening = false;
      mediaAbort = null;
    }
  };

  /** Web Speech 路径 */
  const startSpeech = () => {
    if (!SR) return;
    recognition = new SR();
    recognition.lang = cb.locale === "zh" ? "zh-CN" : "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (ev) => {
      let interim = "";
      let finalText = "";
      for (const res of ev.results) {
        const t = res[0]?.transcript ?? "";
        if (res.isFinal) finalText += t;
        else interim += t;
      }
      if (interim) cb.onTranscript(interim, false);
      if (finalText) {
        cb.onTranscript(finalText, true);
        maybeAutoSend(finalText);
      }
    };
    recognition.onerror = () => {
      listening = false;
    };
    recognition.onend = () => {
      listening = false;
    };
    recognition.start();
    listening = true;
  };

  return {
    get listening() {
      return listening;
    },
    supported,
    async toggleListening() {
      if (listening) {
        recognition?.stop();
        mediaAbort?.abort();
        listening = false;
        return;
      }
      if (SR) {
        startSpeech();
        return;
      }
      if (isTauri()) {
        listening = true;
        await captureViaTauri();
        return;
      }
      alert(cb.locale === "zh" ? "当前环境不支持语音输入" : "Voice input not supported");
    },
    stop() {
      recognition?.abort();
      mediaAbort?.abort();
      listening = false;
    },
  };
}
