import React, { useState, useRef } from "react";
import {
  Mic,
  MicOff,
  Volume2,
  Edit3,
  Trash2,
  ArrowLeftRight,
  Download,
  FileText,
} from "lucide-react";
import { exportToTXT, exportToPDF } from "../utils/exporter";

// Kamus terjemahan Teks ke Braille Unicode
const brailleDict = {
  a: "⠁",
  b: "⠃",
  c: "⠉",
  d: "⠙",
  e: "⠑",
  f: "⠋",
  g: "⠛",
  h: "⠓",
  i: "⠊",
  j: "⠚",
  k: "⠅",
  l: "⠇",
  m: "⠍",
  n: "⠝",
  o: "⠕",
  p: "⠏",
  q: "⠟",
  r: "⠗",
  s: "⠎",
  t: "⠞",
  u: "⠥",
  v: "⠧",
  w: "⠺",
  x: "⠭",
  y: "⠽",
  z: "⠵",
  1: "⠼⠁",
  2: "⠼⠃",
  3: "⠼⠉",
  4: "⠼⠙",
  5: "⠼⠑",
  6: "⠼⠋",
  7: "⠼⠛",
  8: "⠼⠓",
  9: "⠼⠊",
  0: "⠼⠚",
  " ": " ",
  ",": "⠂",
  ".": "⠲",
  "?": "⠦",
  "!": "⠖",
};

const textToBraille = (text) => {
  return text
    .toLowerCase()
    .split("")
    .map((char) => brailleDict[char] || char)
    .join("");
};

export default function VoiceTranslator() {
  const [text, setText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [regletMode, setRegletMode] = useState(false);

  const recognitionRef = useRef(null);

  const toggleListen = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert(
        "Browser Anda tidak mendukung Web Speech API. Gunakan Google Chrome / Edge.",
      );
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "id-ID";
    recognition.continuous = true;
    recognition.interimResults = false; // Mencegah teks berulang (stuttering)

    recognition.onresult = (event) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript) {
        setText((prev) => {
          const newText = finalTranscript.trim();
          return prev ? prev + " " + newText : newText;
        });
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const handleSpeak = () => {
    if (!text) return;
    window.speechSynthesis.cancel(); // Hentikan audio sebelumnya jika ada
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "id-ID";
    window.speechSynthesis.speak(utterance);
  };

  const brailleResult = textToBraille(text);
  const formattedBraille = regletMode
    ? brailleResult.split("").reverse().join("")
    : brailleResult;

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-6">
      {/* KOTAK INPUT TEKS & MIKROFON */}
      <div className="bg-gray-900 rounded-2xl p-4 shadow-xl border border-gray-800 flex flex-col gap-3">
        <div className="flex justify-between items-center px-2">
          <label
            htmlFor="text-input"
            className="text-gray-400 font-semibold text-sm uppercase tracking-wider"
          >
            Input Teks / Suara
          </label>
          {text && (
            <button
              onClick={() => setText("")}
              className="text-gray-500 hover:text-red-400 transition-colors"
              aria-label="Hapus semua teks"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>

        <textarea
          id="text-input"
          rows="3"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ketik teks atau tekan tombol 'Bicara'..."
          className="w-full bg-gray-950 text-white rounded-xl p-4 border border-gray-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none transition-all"
          aria-label="Kotak input teks"
        />

        <div className="flex gap-2">
          <button
            onClick={toggleListen}
            aria-label={
              isListening ? "Hentikan perekaman suara" : "Mulai rekam suara"
            }
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all shadow-lg ${
              isListening
                ? "bg-red-500/20 text-red-400 border border-red-500/50 animate-pulse"
                : "bg-emerald-600 hover:bg-emerald-500 text-white"
            }`}
          >
            {isListening ? <MicOff size={20} /> : <Mic size={20} />}
            {isListening ? "Mendengarkan..." : "Bicara"}
          </button>

          <button
            onClick={handleSpeak}
            disabled={!text}
            aria-label="Bacakan teks ini"
            className="px-4 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-blue-400 rounded-xl border border-gray-700 transition-colors flex items-center justify-center"
            title="Dengarkan Suara"
          >
            <Volume2 size={24} />
          </button>
        </div>
      </div>

      {/* HASIL BRAILLE & FITUR EKSPOR (TXT, PDF, REGLET) */}
      <div className="bg-gray-900 rounded-2xl p-6 shadow-xl border border-gray-800">
        <div className="flex flex-wrap justify-between items-center gap-2 mb-4 border-b border-gray-800 pb-3">
          <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
            <Edit3 size={20} className="text-emerald-500" /> Hasil Braille
          </h3>

          <div className="flex items-center gap-2">
            {/* OPSI TOGGLE REGLET */}
            <button
              onClick={() => setRegletMode(!regletMode)}
              aria-label={
                regletMode ? "Matikan mode reglet" : "Aktifkan mode reglet"
              }
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                regletMode
                  ? "bg-purple-600/20 text-purple-400 border-purple-500/50"
                  : "bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700"
              }`}
            >
              <ArrowLeftRight size={14} />
              Reglet {regletMode ? "ON" : "OFF"}
            </button>

            {/* TOMBOL EKSPOR TXT */}
            <button
              onClick={() =>
                exportToTXT(
                  `Teks Asli: ${text}\nBraille: ${formattedBraille}`,
                  "Hasil_Suara_Braille.txt",
                )
              }
              disabled={!text}
              className="flex items-center gap-1 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-emerald-400 px-3 py-1.5 rounded-lg border border-gray-700 transition-colors"
              title="Unduh TXT"
            >
              <FileText size={14} /> TXT
            </button>

            {/* TOMBOL EKSPOR PDF */}
            <button
              onClick={() =>
                exportToPDF(
                  formattedBraille,
                  text,
                  "Hasil Terjemahan Suara ke Braille",
                  regletMode,
                )
              }
              disabled={!text}
              className="flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors font-bold"
              title="Unduh PDF"
            >
              <Download size={14} /> PDF
            </button>
          </div>
        </div>

        {/* BOX TAMPILAN BRAILLE */}
        <div className="min-h-[100px] bg-gray-950 rounded-xl p-6 border border-gray-700 shadow-inner overflow-hidden relative">
          {regletMode && (
            <div className="absolute top-2 right-2 text-[10px] text-purple-400 uppercase font-bold bg-purple-900/30 px-2 py-1 rounded border border-purple-800/40">
              Arah Tulis: Kanan → Kiri
            </div>
          )}

          <p
            aria-label="Hasil terjemahan Braille"
            className={`text-4xl md:text-5xl text-white tracking-[0.2em] break-all flex flex-wrap transition-all duration-300 ${
              regletMode ? "justify-end" : "justify-start"
            }`}
          >
            {brailleResult ? (
              formattedBraille.split("").map((char, i) => (
                <span
                  key={i}
                  className={`inline-block ${regletMode ? "scale-x-[-1]" : ""}`}
                >
                  {char === " " ? "\u00A0\u00A0" : char}
                </span>
              ))
            ) : (
              <span className="text-gray-600 text-lg font-sans tracking-normal">
                Belum ada teks...
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
