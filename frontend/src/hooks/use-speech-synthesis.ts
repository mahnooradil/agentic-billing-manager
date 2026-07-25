"use client";

import * as React from "react";

/**
 * Browser text-to-speech (Web Speech API, `speechSynthesis`). No external
 * dependency or API cost — speech is synthesized entirely by the browser/OS.
 */
export function useSpeechSynthesis() {
  const [speaking, setSpeaking] = React.useState(false);
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const cancel = React.useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const speak = React.useCallback(
    (text: string) => {
      if (!supported || !text.trim()) return;
      // Only one utterance at a time — a new reply interrupts the previous one.
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    },
    [supported]
  );

  // Stop any in-flight speech if the component unmounts.
  React.useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported]);

  return { supported, speaking, speak, cancel };
}
