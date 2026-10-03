"use client";

/**
 * Voice in / voice out using the browser's built-in Web Speech APIs.
 *
 * Deliberately keyless: Chrome, Edge and the Electron shell both ship
 * `SpeechRecognition` and `speechSynthesis`, so dictation and read-aloud work
 * with no provider key, no audio upload and no per-minute cost. Everywhere
 * else (Firefox, Safari) the features report themselves unsupported and the UI
 * hides the buttons rather than failing at click time.
 *
 * The DOM types for these APIs are not in the TS DOM lib yet, so the minimum
 * surface we rely on is declared here.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResultLike };
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isDictationSupported(): boolean {
  return !!recognitionCtor();
}

export function isSpeechOutputSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// Feature detection cannot run during SSR, and a bare useState would either
// hydrate-mismatch or need a setState-in-effect. useSyncExternalStore gives the
// server a stable `false` and the client the real answer without either.
const noopSubscribe = () => () => {};

function useBrowserFeature(check: () => boolean): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    check,
    () => false
  );
}

export function useDictationSupported(): boolean {
  return useBrowserFeature(isDictationSupported);
}

export function useSpeechOutputSupported(): boolean {
  return useBrowserFeature(isSpeechOutputSupported);
}

/* -------------------------------------------------------------------------- */
/* dictation                                                                   */
/* -------------------------------------------------------------------------- */

export interface DictationOptions {
  lang?: string;
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
}

/**
 * Hold-to-talk / toggle-to-talk dictation.
 *
 * Interim text is streamed out so the composer fills in live, and the final
 * transcript is delivered once per utterance. `reset` clears both so a new
 * utterance never inherits the previous draft.
 */
export function useDictation(options: DictationOptions = {}) {
  const supported = useDictationSupported();
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");
  // The callbacks live in a ref so a re-render (new inline lambdas every time)
  // never invalidates the recognition object that is already running.
  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  }, [options]);

  useEffect(
    () => () => {
      try {
        recRef.current?.abort();
      } catch {
        /* already stopped */
      }
      recRef.current = null;
    },
    []
  );

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      /* nothing to stop */
    }
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      optsRef.current.onError?.("Dictation needs Chrome, Edge or the GodEye desktop app");
      return;
    }
    if (recRef.current) return;
    const rec = new Ctor();
    rec.lang = optsRef.current.lang || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    finalRef.current = "";

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0]?.transcript || "";
        if (r.isFinal) finalRef.current = `${finalRef.current}${finalRef.current ? " " : ""}${text.trim()}`;
        else interim += text;
      }
      if (interim) optsRef.current.onInterim?.(finalRef.current ? `${finalRef.current} ${interim.trim()}` : interim.trim());
    };
    rec.onerror = (e) => {
      // "aborted"/"no-speech" are the normal outcomes of a stop or a quiet mic.
      if (e.error !== "aborted" && e.error !== "no-speech") {
        optsRef.current.onError?.(e.error === "not-allowed" ? "Microphone permission denied" : `Dictation error: ${e.error}`);
      }
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      const final = finalRef.current.trim();
      if (final) optsRef.current.onFinal?.(final);
    };

    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch (e) {
      recRef.current = null;
      setListening(false);
      optsRef.current.onError?.(String((e as Error)?.message || e));
    }
  }, []);

  const toggle = useCallback(() => {
    if (recRef.current) stop();
    else start();
  }, [start, stop]);

  return { supported, listening, start, stop, toggle };
}

/* -------------------------------------------------------------------------- */
/* read-aloud                                                                  */
/* -------------------------------------------------------------------------- */

export interface SpeakOptions {
  lang?: string;
  rate?: number;
  pitch?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

let currentUtterance: SpeechSynthesisUtterance | null = null;

export function stopSpeaking(): void {
  if (!isSpeechOutputSupported()) return;
  currentUtterance = null;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* nothing queued */
  }
}

/** Strip markdown/code fences so the synthesiser reads prose, not syntax. */
function speakableText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " code block omitted. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6000);
}

export function speak(markdown: string, options: SpeakOptions = {}): boolean {
  if (!isSpeechOutputSupported()) return false;
  const text = speakableText(markdown);
  if (!text) return false;
  stopSpeaking();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = options.lang || "en-US";
  if (options.rate) u.rate = options.rate;
  if (options.pitch) u.pitch = options.pitch;
  u.onstart = () => options.onStart?.();
  u.onend = () => {
    if (currentUtterance === u) currentUtterance = null;
    options.onEnd?.();
  };
  u.onerror = (e) => {
    if ((e as SpeechSynthesisErrorEvent)?.error === "interrupted" || (e as SpeechSynthesisErrorEvent)?.error === "canceled") return;
    if (currentUtterance === u) currentUtterance = null;
    options.onError?.(`Speech output failed: ${(e as SpeechSynthesisErrorEvent)?.error || "unknown"}`);
    options.onEnd?.();
  };
  currentUtterance = u;
  window.speechSynthesis.speak(u);
  return true;
}

/**
 * Speak the newest assistant message as it lands. Returns a controller so the
 * caller can cancel mid-reply (e.g. the user starts typing).
 */
export function useAutoSpeak(enabled: boolean, onError?: (message: string) => void) {
  const supported = useSpeechOutputSupported();
  const lastSpoken = useRef("");
  const cbRef = useRef(onError);
  useEffect(() => {
    cbRef.current = onError;
  }, [onError]);

  const speakMessage = useCallback(
    (markdown: string) => {
      if (!enabled) return;
      if (!markdown.trim() || markdown === lastSpoken.current) return;
      lastSpoken.current = markdown;
      speak(markdown, { onError: (m) => cbRef.current?.(m) });
    },
    [enabled]
  );

  const cancel = useCallback(() => {
    lastSpoken.current = "";
    stopSpeaking();
  }, []);

  useEffect(() => () => stopSpeaking(), []);

  return { speakMessage, cancel, supported };
}

/** Pick the best installed voice for a language, else let the OS choose. */
export function voiceForLang(lang: string): SpeechSynthesisVoice | null {
  if (!isSpeechOutputSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  const base = lang.split("-")[0].toLowerCase();
  return voices.find((v) => v.lang?.toLowerCase() === lang.toLowerCase()) || voices.find((v) => v.lang?.toLowerCase().startsWith(base)) || null;
}
