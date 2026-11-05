import { useCallback, useEffect, useRef, useState } from "react";
import { A11yContext } from "./useA11y";
import { speakText } from "../utils/speech";

const STORAGE_KEY = "railuma-voice";

export function A11yProvider({ children }) {
  const [message, setMessage] = useState("");
  const [voiceOn, setVoiceOn] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const voiceRef = useRef(voiceOn);
  const timerRef = useRef(null);

  useEffect(() => {
    voiceRef.current = voiceOn;
    try {
      localStorage.setItem(STORAGE_KEY, voiceOn ? "1" : "0");
    } catch {
      /* abaikan */
    }
  }, [voiceOn]);

  // Tulis pesan ke area aria-live. Dikosongkan dulu supaya pesan yang sama
  // tetap dibacakan ulang oleh pembaca layar.
  const announce = useCallback((text) => {
    clearTimeout(timerRef.current);
    setMessage("");
    timerRef.current = setTimeout(() => setMessage(text), 60);
    if (voiceRef.current) speakText(text);
  }, []);

  return (
    <A11yContext.Provider value={{ message, announce, voiceOn, setVoiceOn }}>
      {children}
    </A11yContext.Provider>
  );
}
