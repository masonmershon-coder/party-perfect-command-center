"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

function getSpeechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  const w = window as SpeechWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechToText(options?: {
  lang?: string;
  /** Hold continuous listening open while talking (press-and-hold mic). */
  continuous?: boolean;
  onFinalTranscript?: (text: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = useRef(options?.onFinalTranscript);
  const continuousRef = useRef(Boolean(options?.continuous));
  const wantListenRef = useRef(false);

  useEffect(() => {
    onFinalRef.current = options?.onFinalTranscript;
  }, [options?.onFinalTranscript]);

  useEffect(() => {
    continuousRef.current = Boolean(options?.continuous);
  }, [options?.continuous]);

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognitionCtor()));
  }, []);

  const stop = useCallback(() => {
    wantListenRef.current = false;
    const recognition = recognitionRef.current;
    if (!recognition) {
      setListening(false);
      return;
    }
    try {
      recognition.stop();
    } catch {
      // ignore
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError(
        "Voice input isn’t supported in this browser. Use Chrome or Safari over HTTPS.",
      );
      return;
    }

    setError(null);
    setInterim("");
    wantListenRef.current = true;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
    }

    const recognition = new Ctor();
    recognition.continuous = continuousRef.current;
    recognition.interimResults = true;
    recognition.lang = options?.lang ?? "en-US";

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) finalText += piece;
        else interimText += piece;
      }
      if (interimText) setInterim(interimText.trim());
      if (finalText.trim()) {
        setInterim("");
        onFinalRef.current?.(finalText.trim());
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") {
        if (!wantListenRef.current) setListening(false);
        return;
      }
      setError(
        event.error === "not-allowed"
          ? "Microphone permission blocked. Allow mic access for this site and try again."
          : `Voice error: ${event.error}`,
      );
      wantListenRef.current = false;
      setListening(false);
    };

    recognition.onend = () => {
      // Some browsers end mid-hold; restart while user still wants to talk.
      if (wantListenRef.current && continuousRef.current) {
        try {
          recognition.start();
          setListening(true);
          return;
        } catch {
          // fall through
        }
      }
      setListening(false);
      setInterim("");
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setError("Couldn’t start the microphone. Try again.");
      wantListenRef.current = false;
      setListening(false);
    }
  }, [options?.lang]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  useEffect(() => {
    return () => {
      wantListenRef.current = false;
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
    };
  }, []);

  return {
    supported,
    listening,
    interim,
    error,
    start,
    stop,
    toggle,
    clearError: () => setError(null),
  };
}
