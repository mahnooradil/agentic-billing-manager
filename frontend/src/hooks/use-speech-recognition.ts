"use client";

import * as React from "react";

interface RecognitionResultAlternative {
  transcript: string;
}
interface RecognitionResult {
  isFinal: boolean;
  0: RecognitionResultAlternative;
}
interface RecognitionResultList {
  length: number;
  [index: number]: RecognitionResult;
}
interface RecognitionEvent {
  resultIndex: number;
  results: RecognitionResultList;
}
interface RecognitionErrorEvent {
  error: string;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

/** Not a standard TS DOM type — read via a local cast, never a global augment. */
function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface UseSpeechRecognitionOptions {
  /** Called with the live transcript as the user speaks (interim + final). */
  onTranscript: (text: string, isFinal: boolean) => void;
  onError?: (message: string) => void;
}

/**
 * Browser speech-to-text (Web Speech API). No external dependency, no API
 * cost, nothing sent to a server — recognition runs entirely in the browser.
 * Unsupported browsers (e.g. Firefox) get `supported: false`; callers should
 * hide the mic control in that case.
 */
export function useSpeechRecognition({
  onTranscript,
  onError,
}: UseSpeechRecognitionOptions) {
  const [listening, setListening] = React.useState(false);
  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null);
  const supported = React.useMemo(
    () => getSpeechRecognitionConstructor() !== null,
    []
  );

  const stop = React.useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = React.useCallback(() => {
    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor) {
      onError?.("Voice input isn't supported in this browser.");
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang =
      typeof navigator !== "undefined" ? navigator.language : "en-US";

    recognition.onresult = (event) => {
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      const lastResult = event.results[event.results.length - 1];
      onTranscript(text, lastResult?.isFinal ?? false);
    };
    recognition.onerror = (event) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        onError?.("Couldn't hear you. Please try again.");
      }
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [onTranscript, onError]);

  // Stop listening if the component unmounts mid-recording.
  React.useEffect(() => () => stop(), [stop]);

  return { supported, listening, start, stop };
}
