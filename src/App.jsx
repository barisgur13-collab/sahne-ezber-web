import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, Play, ChevronRight, Trash2, 
  BookOpen, FastForward, Pause, HelpCircle, 
  Lock, Unlock, Timer, Check, List, X, Moon, Sun, FileText
} from 'lucide-react';

// Word dosyalarını tarayıcıda okumak için gerekli kütüphane
const MAMMOTH_URL = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.4.21/mammoth.browser.min.js";

const App = () => {
  const [script, setScript] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [selectedCharacters, setSelectedCharacters] = useState([]); 
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isHintVisible, setIsHintVisible] = useState(false);
  const [inputText, setInputText] = useState('');
  const [mode, setMode] = useState('input'); 
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [progress, setProgress] = useState(0); 
  const [showProgressBar, setShowProgressBar] = useState(true); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [speedLevel, setSpeedLevel] = useState(3); 
  
  const timerRef = useRef(null);
  const mammothRef = useRef(null);

  // Kütüphaneyi dinamik yükle
  useEffect(() => {
    const scriptTag = document.createElement('script');
    scriptTag.src = MAMMOTH_URL;
    scriptTag.async = true;
    scriptTag.onload = () => { mammothRef.current = window.mammoth; };
    document.body.appendChild(scriptTag);
    return () => { if (document.body.contains(scriptTag)) document.body.removeChild(scriptTag); };
  }, []);

  const calculateDelay = (text) => {
    const wordCount = (text || "").split(/\s+/).length;
    const multipliers = { 1: 800, 2: 600, 3: 400, 4: 250, 5: 150 };
    return (wordCount * multipliers[speedLevel]) + 1000;
  };

  const parseScript = (text) => {
    // Yapışık isimleri (Örn: "...yapma.TOM :") ayır
    let preProcessed = text.replace(/([a-zçğıöşü0-9.!?\)\]])\s*([A-ZÇĞİÖŞÜ\s]{2,35})\s*[:\-\u2013\u2014]/g, "$1\n$2: ");
    const rawLines = preProcessed.split(/[\r\n]+/).map(line => line.trim()).filter(line => line !== '');
    
    const knownCharacters = new Set();
    const separatorRegex = /^([A-ZÇĞİÖŞÜa-zçğıöşü0-9\s\(\)\[\]\.]{2,35}?)\s*[:\-\u2013\u2014]\s*(.*)/;
    const allCapsRegex = /^([A-ZÇĞİÖŞÜ0-9\s\(\)\[\]\.]{2,35})$/;

    rawLines.forEach(line => {
      let nameMatch = line.match(separatorRegex) || line.match(allCapsRegex);
      if (nameMatch) {
        let name = (nameMatch[1] || nameMatch[0]).toUpperCase().trim();
        if (name.split(/\s+/).length <= 5 && !/^\d+$/.test(name)) knownCharacters.add(name);
      }
    });

    const sortedNames = Array.from(knownCharacters).sort((a, b) => b.length - a.length);

    const parsed = [];
    let currentCharacter = 'BİLGİ';
    let currentText = [];

    rawLines.forEach(line => {
      let foundName = null;
      let speech = null;

      for (const name of sortedNames) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`^(${escaped})(?:\\s*[:\\-\\u2013\\u2014]?\\s+|\\s*[:\\-\\u2013\\u2014]\\s*)(.*)`, 'i');
        let match = line.match(regex);
        if (match) { foundName = match[1].toUpperCase().trim(); speech = match[2].trim(); break; }
      }

      if (foundName) {
        if (currentText.length > 0) parsed.push({ character: currentCharacter, text: currentText.join(' ') });
        currentCharacter = foundName;
        currentText = speech ? [speech] : [];
      } else {
        currentText.push(line);
      }
    });

    if (currentText.length > 0) parsed.push({ character: currentCharacter, text: currentText.join(' ') });

    setScript(parsed);
    setCharacters([...new Set(parsed.map(p => p.character))].filter(c => c !== 'BİLGİ'));
    setMode('select');
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    if (file.name.endsWith('.docx')) {
      if (!mammothRef.current) return;
      reader.onload = async (ev) => {
        const result = await mammothRef.current.extractRawText({ arrayBuffer: ev.target.result });
        setInputText(result.value.replace(/\u000B/g, '\n'));
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (ev) => setInputText(ev.target.result);
      reader.readAsText(file);
    }
  };

  useEffect(() => {
    if (mode === 'practice' && isAutoPlaying && script[currentIndex]) {
      const isMyRole = selectedCharacters.includes(script[currentIndex].character);
      if (isLocked || !isMyRole || (isMyRole && isRevealed)) {
        const delay = calculateDelay(script[currentIndex].text);
        setProgress(0);
        setTimeout(() => setProgress(100), 50);
        timerRef.current = setTimeout(() => {
          if (currentIndex < script.length - 1) {
            const nextIdx = currentIndex + 1;
            setIsHintVisible(false);
            setIsRevealed(isLocked || !selectedCharacters.includes(script[nextIdx].character));
            setCurrentIndex(nextIdx);
          } else { setIsAutoPlaying(false); setMode('select'); }
        }, delay);
        return () => clearTimeout(timerRef.current);
      }
    }
  }, [currentIndex, isAutoPlaying, mode, speedLevel, isRevealed, isLocked]);

  const removeCharacter = (name) => {
    setCharacters(prev => prev.filter(c => c !== name));
    setSelectedCharacters(prev => prev.filter(c => c !== name));
    setScript(prev => prev.map(l => l.character === name ? {...l, character: 'BİLGİ'} : l));
  };

  return (
    <div className={`${isDarkMode ? 'dark bg-slate-900 text-white' : 'bg-slate-50 text-slate-900'} min-h-screen transition-colors p-4`}>
      <div className={`max-w-2xl mx-auto rounded-3xl shadow-2xl overflow-hidden border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
        <div className={`${isDarkMode ? 'bg-indigo-900' : 'bg-indigo-600'} p-5 text-white flex justify-between items-center`}>
          <div>
            <h1 className="font-bold flex items-center gap-2"><BookOpen size={20}/> Sahne Ezber</h1>
            <p className="text-[10px] opacity-70">{selectedCharacters.length > 0 ? selectedCharacters.join(', ') : 'Barış için Hazırlandı'}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 hover:bg-white/10 rounded-full">
              {isDarkMode ? <Sun size={18} className="text-amber-400"/> : <Moon size={18}/>}
            </button>
            {mode !== 'input' && (
              <>
                <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-white/10 rounded-full"><List size={18}/></button>
                <button onClick={() => { setMode('input'); setInputText(''); setIsAutoPlaying(false); }} className="p-2 hover:bg-white/10 rounded-full"><Trash2 size={18}/></button>
              </>
            )}
          </div>
        </div>

        <div className="p-6">
          {mode === 'input' && (
            <div className="space-y-4">
              <div className={`text-center p-6 border-2 border-dashed rounded-xl ${isDarkMode ? 'bg-slate-700/30 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                <FileText className="mx-auto mb-2 opacity-30" size={32}/>
                <input type="file" accept=".docx,.txt" onChange={handleFileUpload} className="hidden" id="fileIn" />
                <label htmlFor="fileIn" className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-xs font-bold cursor-pointer">Dosya Seç (.docx / .txt)</label>
              </div>
              <textarea 
                className={`w-full h-40 p-3 rounded-xl border outline-none text-sm ${isDarkMode ? 'bg-slate-700 border-slate-600' : 'bg-white'}`}
                placeholder="KARAKTER: Replik..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
              <button onClick={() => parseScript(inputText)} disabled={!inputText.trim()} className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold">Metni İşle</button>
            </div>
          )}

          {mode === 'select' && (
            <div className="space-y-4">
              <h2 className="text-center font-bold text-indigo-500 text-sm">Rollerini Seç</h2>
              <div className="grid gap-2">
                {characters.map(char => (
                  <div key={char} className={`flex items-center justify-between p-3 border rounded-xl ${selectedCharacters.includes(char) ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-200'}`}>
                    <button onClick={() => setSelectedCharacters(prev => prev.includes(char) ? prev.filter(c => c !== char) : [...prev, char])} className="flex-1 flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${selectedCharacters.includes(char) ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{char[0]}</div>
                      <span className="text-sm font-medium">{char}</span>
                    </button>
                    <button onClick={() => removeCharacter(char)} className="p-2 text-slate-400 hover:text-rose-500"><Trash2 size={16}/></button>
                  </div>
                ))}
              </div>
              <button onClick={() => { setCurrentIndex(0); setMode('practice'); setIsAutoPlaying(true); setIsRevealed(isLocked || !selectedCharacters.includes(script[0]?.character)); }} disabled={selectedCharacters.length === 0} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg">Ezbere Başla</button>
            </div>
          )}

          {mode === 'practice' && script[currentIndex] && (
            <div className="space-y-6">
              <div className={`p-4 rounded-2xl border ${isDarkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50'}`}>
                <div className="flex justify-between items-center mb-4">
                  <button onClick={() => setIsAutoPlaying(!isAutoPlaying)} className={`px-4 py-2 rounded-lg text-[10px] font-bold flex gap-2 ${isAutoPlaying ? 'bg-green-500/20 text-green-500' : 'bg-slate-500/20 text-slate-500'}`}>
                    {isAutoPlaying ? <FastForward size={14}/> : <Pause size={14}/>} {isAutoPlaying ? 'Akış Açık' : 'Durduruldu'}
                  </button>
                  <span className="text-[10px] opacity-40 font-mono">{currentIndex + 1} / {script.length}</span>
                </div>
                <input type="range" min="1" max="5" value={speedLevel} onChange={(e) => setSpeedLevel(parseInt(e.target.value))} className="w-full h-1 bg-slate-300 rounded-lg appearance-none accent-indigo-600 mb-2" />
                <div className="flex justify-between text-[8px] opacity-50 uppercase font-bold">
                  <span>Hız: {{1:'Çok Yavaş', 2:'Yavaş', 3:'Normal', 4:'Hızlı', 5:'Çok Hızlı'}[speedLevel]}</span>
                  <button onClick={() => setShowProgressBar(!showProgressBar)}>{showProgressBar ? 'Gizle' : 'Göster'}</button>
                </div>
              </div>

              {showProgressBar && (
                <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 transition-all ease-linear" style={{ width: `${progress}%`, transitionDuration: progress === 100 ? `${calculateDelay(script[currentIndex].text)}ms` : '0ms' }} />
                </div>
              )}

              <div className="min-h-[220px] flex flex-col justify-center items-center text-center">
                <h3 className={`text-[10px] font-black mb-6 tracking-widest uppercase ${selectedCharacters.includes(script[currentIndex].character) ? 'text-indigo-500 underline' : 'opacity-30'}`}>{script[currentIndex].character}</h3>
                {selectedCharacters.includes(script[currentIndex].character) && !isLocked ? (
                  <div className="w-full space-y-4">
                    <p className={`text-xl font-serif italic transition-all duration-700 ${isRevealed ? 'opacity-100 blur-0' : 'opacity-0 blur-xl absolute invisible'}`}>"{script[currentIndex].text}"</p>
                    {!isRevealed && (
                      <div className="space-y-4 animate-pulse">
                        {isHintVisible ? <p className="text-xs italic text-indigo-400">"{script[currentIndex].text.split(' ').slice(0,3).join(' ')}..."</p> : <div className="opacity-30"><HelpCircle size={32} className="mx-auto mb-2"/><p className="text-[10px] font-bold">SIRA SENDE</p></div>}
                        {!isHintVisible && <button onClick={() => setIsHintVisible(true)} className="text-[10px] font-bold border-b border-indigo-500 text-indigo-500">İpucu Al</button>}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xl font-medium leading-relaxed">"{script[currentIndex].text}"</p>
                )}
              </div>

              <div className="flex gap-2">
                <button onClick={() => { if (!isRevealed) setIsRevealed(true); else if (currentIndex < script.length - 1) { const next = currentIndex+1; setIsHintVisible(false); setIsRevealed(isLocked || !selectedCharacters.includes(script[next].character)); setCurrentIndex(next); } }} disabled={isLocked} className={`flex-1 py-5 rounded-2xl font-bold shadow-xl ${isLocked ? 'bg-slate-100 text-slate-300' : (selectedCharacters.includes(script[currentIndex].character) && !isRevealed ? 'bg-amber-500 text-white' : 'bg-indigo-600 text-white')}`}>
                  {currentIndex === script.length - 1 && (isRevealed || isLocked) ? 'BİTİR' : (selectedCharacters.includes(script[currentIndex].character) && !isRevealed ? 'CEVABI GÖR' : 'SONRAKİ')}
                </button>
                <button onClick={() => { setIsLocked(!isLocked); if (!isLocked) setIsRevealed(true); }} className={`w-16 flex items-center justify-center rounded-2xl ${isLocked ? 'bg-rose-500 text-white' : 'bg-slate-200'}`}>{isLocked ? <Lock size={20}/> : <Unlock size={20}/>}</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {isSidebarOpen && <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />}
      <div className={`fixed top-0 right-0 w-72 h-full shadow-2xl z-50 transform transition-transform duration-300 flex flex-col ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'} ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
        <div className={`p-4 text-white font-bold text-xs flex justify-between items-center ${isDarkMode ? 'bg-indigo-900' : 'bg-indigo-600'}`}><span>AKKIŞ LİSTESİ</span><button onClick={() => setIsSidebarOpen(false)}><X size={20}/></button></div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {script.map((line, idx) => (
            <button key={idx} onClick={() => { setCurrentIndex(idx); setIsRevealed(isLocked || !selectedCharacters.includes(line.character)); setIsHintVisible(false); setIsSidebarOpen(false); }} className={`w-full text-left p-2 rounded-lg border text-[10px] ${idx === currentIndex ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-100'}`}>
              <div className="flex justify-between opacity-50"><span>{idx+1}. {line.character}</span>{selectedCharacters.includes(line.character) && <Check size={10} className="text-indigo-500"/>}</div>
              <div className="truncate italic opacity-80">"{line.text}"</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default App;