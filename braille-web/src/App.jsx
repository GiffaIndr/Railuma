  import React, { useState } from 'react';
  import { motion, AnimatePresence } from 'framer-motion';
  import { ScanText, Mic, CheckSquare, Info, Sparkles } from 'lucide-react';

  // Import Komponen Fitur
  import BrailleScanner from './components/BrailleScanner';
  import HomeworkCorrector from './components/HomeworkCorrector';
  import VoiceTranslator from './components/VoiceTranslator';

  export default function App() {
    // State 3 Tab Utama: 'scanner', 'corrector', 'voice'
    const [activeTab, setActiveTab] = useState('scanner');

    return (
      <div className="min-h-screen bg-fuchsia-800 text-white overflow-hidden relative font-sans selection:bg-yellow-300 selection:text-black">
        
        {/* Dynamic Background Blobs (Inspirasi Pop Palette & Animated Parallax) */}
        <motion.div 
          className="fixed -top-20 -left-20 w-96 h-96 bg-yellow-400/15 rounded-full filter blur-[110px] pointer-events-none"
          animate={{ scale: [1, 1.25, 1], x: [0, 40, 0], y: [0, -30, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div 
          className="fixed top-1/3 -right-20 w-96 h-96 bg-purple-500/20 rounded-full filter blur-[130px] pointer-events-none"
          animate={{ scale: [1.2, 1, 1.2], x: [0, -40, 0], y: [0, 40, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div 
          className="fixed -bottom-20 left-1/4 w-96 h-96 bg-emerald-400/15 rounded-full filter blur-[120px] pointer-events-none"
          animate={{ scale: [1, 1.3, 1], x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative z-10 max-w-4xl mx-auto px-4 py-8 min-h-screen flex flex-col">
          
          {/* HEADER APLIKASI (Desain Ceria & Bold) */}
          <motion.header 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            {/* Badge Pop-Art */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-yellow-300 text-slate-900 font-extrabold text-xs md:text-sm shadow-[2px_2px_0px_0px_rgba(255,255,255,0.3)] mb-4 uppercase tracking-wider">
              <Sparkles size={16} className="text-slate-900 animate-bounce" />
              AI Accessibility & Learning Hub
            </div>

            <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-3">
              AI Braille <span className="text-yellow-300 underline decoration-wavy decoration-purple-400">Hub</span>
            </h1>
            <p className="text-slate-300 text-sm md:text-base font-medium max-w-lg mx-auto">
              Platform aksesibilitas interaktif untuk penerjemahan, koreksi PR, dan pembelajaran Braille berbasis AI.
            </p>
          </motion.header>

          {/* NAVIGASI 3 TAB (Pop Pill Style & Color Coded) */}
          <nav className="flex justify-center flex-wrap gap-2 md:gap-3 mb-8 bg-slate-900/90 p-2 rounded-2xl border border-slate-800 backdrop-blur-md shadow-2xl">
            
            {/* TAB 1: PEMINDAI BRAILLE */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setActiveTab('scanner')}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all duration-300 ${
                activeTab === 'scanner' 
                  ? 'bg-sky-400 text-slate-950 shadow-[0_0_20px_rgba(56,189,248,0.4)]' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <ScanText size={18} />
              <span>Pemindai Braille</span>
            </motion.button>

            {/* TAB 2: KOREKTOR PR */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setActiveTab('corrector')}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all duration-300 ${
                activeTab === 'corrector' 
                  ? 'bg-purple-400 text-slate-950 shadow-[0_0_20px_rgba(192,132,252,0.4)]' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <CheckSquare size={18} />
              <span>Korektor PR</span>
            </motion.button>

            {/* TAB 3: SUARA KE BRAILLE */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setActiveTab('voice')}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all duration-300 ${
                activeTab === 'voice' 
                  ? 'bg-emerald-400 text-slate-950 shadow-[0_0_20px_rgba(74,222,128,0.4)]' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Mic size={18} />
              <span>Suara ke Braille</span>
            </motion.button>
          </nav>

          {/* CONTAINER KOMPONEN AKTIF */}
          <main className="flex-grow">
            <AnimatePresence mode="wait">
              {activeTab === 'scanner' && (
                <motion.div
                  key="scanner"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25 }}
                >
                  <BrailleScanner />
                </motion.div>
              )}

              {activeTab === 'corrector' && (
                <motion.div
                  key="corrector"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25 }}
                >
                  <HomeworkCorrector />
                </motion.div>
              )}

              {activeTab === 'voice' && (
                <motion.div
                  key="voice"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25 }}
                >
                  <VoiceTranslator />
                </motion.div>
              )}
            </AnimatePresence>
          </main>

          {/* FOOTER */}
          <footer className="mt-12 py-4 text-center text-slate-400 text-xs flex justify-center items-center gap-1.5 border-t border-slate-800/80">
            <Info size={14} className="text-yellow-300" />
            <span>Gunakan browser Chrome/Edge terbaru untuk dukungan Kamera & Mikrofon penuh.</span>
          </footer>

        </div>
      </div>
    );
  }