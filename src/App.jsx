import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, Play, ChevronRight, Trash2, 
  BookOpen, FastForward, Pause, HelpCircle, 
  Lock, Unlock, Timer, Check, List, X, Moon, Sun, FileText, Flame
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
  
  // YENİ: Seri (Streak) state'leri
  const [streak, setStreak] = useState(0);
  const [hintUsed, setHintUsed] = useState(false);
  const [charCounts, setCharCounts] = useState({});

  const timerRef = useRef(null);
  const mammothRef = useRef(null);

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

    const counts = {};
    parsed.forEach(p => {
      if (p.character !== 'BİLGİ') {
        counts[p.character] = (counts[p.character] || 0) + 1;
      }
    });
    setCharCounts(counts);

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
          if (!hintUsed && isMyRole) {
            setStreak(prev => prev + 1); // Sadece kendi rolünde seriyi artır
          }
          if (currentIndex < script.length - 1) {
            const nextIdx = currentIndex + 1;
            setIsHintVisible(false);
            setHintUsed(false);
            setIsRevealed(isLocked || !selectedCharacters.includes(script[nextIdx].character));
            setCurrentIndex(nextIdx);
          } else { setIsAutoPlaying(false); setMode('select'); }
        }, delay);
        return () => clearTimeout(timerRef.current);
      }
    }
  }, [currentIndex, isAutoPlaying, mode, speedLevel, isRevealed, isLocked, hintUsed]);

  const removeCharacter = (name) => {
    setCharacters(prev => prev.filter(c => c !== name));
    setSelectedCharacters(prev => prev.filter(c => c !== name));
    setScript(prev => prev.map(l => l.character === name ? {...l, character: 'BİLGİ'} : l));
  };

  const getStreakStyle = (s) => {
    if (s < 20) return { bg: 'bg-orange-500/20', border: 'border-orange-500/30', text: 'text-orange-100', icon: 'text-orange-400 fill-orange-400', flames: 1 };
    if (s < 40) return { bg: 'bg-red-500/20', border: 'border-red-500/30', text: 'text-red-100', icon: 'text-red-500 fill-red-500', flames: 2 };
    if (s < 60) return { bg: 'bg-purple-500/20', border: 'border-purple-500/30', text: 'text-purple-100', icon: 'text-purple-400 fill-purple-400', flames: 3 };
    return { bg: 'bg-fuchsia-500/20', border: 'border-fuchsia-500/30', text: 'text-fuchsia-100', icon: 'text-fuchsia-400 fill-fuchsia-400 animate-pulse', flames: 4 };
  };

  return (
    // Arka plan bg-slate-50 yerine bg-white yapıldı (Full Beyaz Görünüm)
    <div className={`${isDarkMode ? 'dark bg-slate-900 text-white' : 'bg-white text-slate-900'} min-h-screen transition-colors p-4 md:p-8`}>
      <div className={`max-w-2xl mx-auto rounded-3xl shadow-2xl overflow-hidden border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        
        <div className={`${isDarkMode ? 'bg-indigo-900' : 'bg-indigo-600'} p-6 flex justify-between items-center`}>
          <div>
            {/* Başlık Beyaz Yapıldı */}
            <h1 className="font-bold flex items-center gap-2 text-white text-xl">
              <BookOpen size={24}/> Sahne Ezber
            </h1>
            {/* Altına by bbg eklendi */}
            <p className="text-[11px] text-white opacity-80 mt-1 font-medium tracking-wide uppercase">
              BY BBG {selectedCharacters.length > 0 && `| ${selectedCharacters.join(', ')}`}
            </p>
          </div>
          <div className="flex gap-2 items-center text-white">
            {streak >= 3 && (
              <div className={`flex items-center gap-1 ${getStreakStyle(streak).bg} px-3 py-1.5 rounded-full font-bold text-xs animate-bounce border ${getStreakStyle(streak).border}`}>
                {Array.from({ length: getStreakStyle(streak).flames }).map((_, i) => (
                  <Flame key={i} size={16} className={getStreakStyle(streak).icon} />
                ))}
                <span className={getStreakStyle(streak).text}>{streak} Seri</span>
              </div>
            )}
            <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
              {isDarkMode ? <Sun size={18} className="text-amber-400"/> : <Moon size={18}/>}
            </button>
            {mode !== 'input' && (
              <>
                <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-white/20 rounded-full transition-colors"><List size={18}/></button>
                <button onClick={() => { setMode('input'); setInputText(''); setIsAutoPlaying(false); setStreak(0); }} className="p-2 hover:bg-white/20 rounded-full transition-colors"><Trash2 size={18}/></button>
              </>
            )}
          </div>
        </div>

        <div className="p-6 md:p-8">
          {mode === 'input' && (
            <div className="space-y-4">
              <div className={`text-center p-8 border-2 border-dashed rounded-2xl ${isDarkMode ? 'bg-slate-700/30 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                <FileText className="mx-auto mb-3 text-indigo-400" size={40}/>
                <input type="file" accept=".docx,.txt" onChange={handleFileUpload} className="hidden" id="fileIn" />
                <label htmlFor="fileIn" className="bg-indigo-600 hover:bg-indigo-700 transition-colors text-white px-6 py-3 rounded-xl text-sm font-bold cursor-pointer inline-block">Dosya Seç (.docx / .txt)</label>
              </div>
              <textarea 
                className={`w-full h-48 p-4 rounded-2xl border outline-none text-sm focus:ring-2 focus:ring-indigo-500 transition-shadow ${isDarkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'}`}
                placeholder="Örn:&#10;HAMLET: Olmak ya da olmamak...&#10;OPHELIA: Güzel prensim?"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
              <button onClick={() => parseScript(inputText)} disabled={!inputText.trim()} className="w-full bg-slate-900 hover:bg-black transition-colors text-white py-4 rounded-2xl font-bold text-lg">Metni İşle</button>
            </div>
          )}

          {mode === 'select' && (
            <div className="space-y-5">
              <h2 className="text-center font-bold text-indigo-600 text-lg">Rollerini Seç</h2>
              <div className="grid gap-3">
                {characters.map(char => (
                  <div key={char} className={`flex items-center justify-between p-3 border rounded-2xl transition-all ${selectedCharacters.includes(char) ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <button onClick={() => setSelectedCharacters(prev => prev.includes(char) ? prev.filter(c => c !== char) : [...prev, char])} className="flex-1 flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${selectedCharacters.includes(char) ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{char[0]}</div>
                      <span className="text-base font-semibold">{char} <span className="text-xs text-slate-400 font-normal ml-1">({charCounts[char]} Replik)</span></span>
                    </button>
                    <button onClick={() => removeCharacter(char)} className="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"><Trash2 size={20}/></button>
                  </div>
                ))}
              </div>
              <button onClick={() => { setCurrentIndex(0); setMode('practice'); setIsAutoPlaying(true); setStreak(0); setHintUsed(false); setIsRevealed(isLocked || !selectedCharacters.includes(script[0]?.character)); }} disabled={selectedCharacters.length === 0} className="w-full bg-indigo-600 hover:bg-indigo-700 transition-transform active:scale-95 text-white py-4 rounded-3xl font-bold text-lg shadow-lg">Ezbere Başla</button>
            </div>
          )}

          {mode === 'practice' && script[currentIndex] && (
            <div className="space-y-6">
              <div className={`p-5 rounded-3xl border ${isDarkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-100'}`}>
                <div className="flex justify-between items-center mb-4">
                  <button onClick={() => setIsAutoPlaying(!isAutoPlaying)} className={`px-4 py-2 rounded-xl text-xs font-bold flex gap-2 transition-colors ${isAutoPlaying ? 'bg-green-100 text-green-600' : 'bg-slate-200 text-slate-500'}`}>
                    {isAutoPlaying ? <FastForward size={16}/> : <Pause size={16}/>} {isAutoPlaying ? 'Akış Açık' : 'Durduruldu'}
                  </button>
                  <span className="text-xs opacity-40 font-mono font-medium">{currentIndex + 1} / {script.length}</span>
                </div>
                <input type="range" min="1" max="5" value={speedLevel} onChange={(e) => setSpeedLevel(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-indigo-600 mb-2" />
                <div className="flex justify-between text-[9px] opacity-60 uppercase font-bold tracking-wider">
                  <span>Hız: {{1:'Çok Yavaş', 2:'Yavaş', 3:'Normal', 4:'Hızlı', 5:'Çok Hızlı'}[speedLevel]}</span>
                  <button onClick={() => setShowProgressBar(!showProgressBar)} className="hover:text-indigo-500 transition-colors">{showProgressBar ? 'Çubuğu Gizle' : 'Çubuğu Göster'}</button>
                </div>
              </div>

              {showProgressBar && (
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 transition-all ease-linear" style={{ width: `${progress}%`, transitionDuration: progress === 100 ? `${calculateDelay(script[currentIndex].text)}ms` : '0ms' }} />
                </div>
              )}

              <div className="min-h-[260px] flex flex-col justify-center items-center text-center">
                
                {/* Önceki Replik Hatırlatıcı (Özellikle sırası geldiğinde çok net görünsün) */}
                {selectedCharacters.includes(script[currentIndex].character) && currentIndex > 0 && !isLocked && !isRevealed && (
                  <div className="w-full max-w-lg mb-8 bg-indigo-50 border-l-4 border-indigo-400 p-4 rounded-r-2xl shadow-sm animate-in fade-in slide-in-from-top-4">
                    <p className="text-[10px] font-black text-indigo-400 mb-1 uppercase tracking-widest text-left">
                      Az Önce ({script[currentIndex-1].character})
                    </p>
                    <p className="text-slate-600 italic text-left text-sm leading-relaxed">
                      "{script[currentIndex-1].text}"
                    </p>
                  </div>
                )}

                <h3 className={`text-xs font-black mb-6 tracking-widest uppercase ${selectedCharacters.includes(script[currentIndex].character) ? 'text-indigo-600' : 'opacity-40'}`}>
                  {script[currentIndex].character}
                </h3>
                
                {selectedCharacters.includes(script[currentIndex].character) && !isLocked ? (
                  <div className="w-full space-y-4">
                    <p className={`text-2xl font-serif italic transition-all duration-700 ${isRevealed ? 'opacity-100 blur-0' : 'opacity-0 blur-xl absolute invisible'}`}>"{script[currentIndex].text}"</p>
                    
                    {!isRevealed && (
                      <div className="space-y-5 animate-pulse">
                        {isHintVisible ? (
                          <p className="text-base italic text-indigo-500 font-medium bg-indigo-50 inline-block px-4 py-2 rounded-xl">"{script[currentIndex].text.split(' ').slice(0,3).join(' ')}..."</p> 
                        ) : (
                          <div className="opacity-40 text-indigo-900">
                            <HelpCircle size={40} className="mx-auto mb-3"/>
                            <p className="text-xs font-black tracking-widest">SIRA SENDE</p>
                          </div>
                        )}
                        {!isHintVisible && (
                          <button 
                            onClick={() => {
                              setIsHintVisible(true);
                              setHintUsed(true);
                              setStreak(0); // İpucu alınca seri sıfırlanır
                            }} 
                            className="text-xs font-bold border-b-2 border-indigo-500 text-indigo-600 hover:text-indigo-800 transition-colors pb-1"
                          >
                            İpucu Al
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-2xl font-medium leading-relaxed">"{script[currentIndex].text}"</p>
                )}
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => { 
                    if (!isRevealed) { 
                      setIsRevealed(true); 
                      if (!hintUsed && selectedCharacters.includes(script[currentIndex].character)) {
                        setStreak(prev => prev + 1); // Sadece kendi rolünde seriyi arttır
                      }
                    } else if (currentIndex < script.length - 1) { 
                      const next = currentIndex+1; 
                      // Diğer rollerde seri artışını kaldırdık
                      setIsHintVisible(false); 
                      setHintUsed(false); // Yeni replikte ipucunu sıfırla
                      setIsRevealed(isLocked || !selectedCharacters.includes(script[next].character)); 
                      setCurrentIndex(next); 
                    } 
                  }} 
                  disabled={isLocked} 
                  className={`flex-1 py-5 rounded-3xl font-bold text-lg shadow-lg active:scale-95 transition-all ${isLocked ? 'bg-slate-100 text-slate-300 shadow-none' : (selectedCharacters.includes(script[currentIndex].character) && !isRevealed ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-indigo-600 text-white hover:bg-indigo-700')}`}
                >
                  {currentIndex === script.length - 1 && (isRevealed || isLocked) ? 'EZBERİ BİTİR' : (selectedCharacters.includes(script[currentIndex].character) && !isRevealed ? 'CEVABI GÖR' : 'SONRAKİ REPLİK')}
                </button>
                <button 
                  onClick={() => { setIsLocked(!isLocked); if (!isLocked) setIsRevealed(true); }} 
                  className={`w-20 flex items-center justify-center rounded-3xl shadow-md transition-colors ${isLocked ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                  {isLocked ? <Lock size={24}/> : <Unlock size={24}/>}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {isSidebarOpen && <div className="fixed inset-0 bg-slate-900/60 z-40 backdrop-blur-sm transition-opacity" onClick={() => setIsSidebarOpen(false)} />}
      <div className={`fixed top-0 right-0 w-80 h-full shadow-2xl z-50 transform transition-transform duration-300 flex flex-col ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'} ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
        <div className={`p-5 text-white font-bold text-sm flex justify-between items-center shadow-md ${isDarkMode ? 'bg-indigo-900' : 'bg-indigo-600'}`}>
          <span className="flex items-center gap-2"><List size={18}/> SAHNE AKIŞI</span>
          <button onClick={() => setIsSidebarOpen(false)} className="hover:bg-white/20 p-1 rounded-full transition-colors"><X size={20}/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {script.map((line, idx) => (
            <button key={idx} onClick={() => { setCurrentIndex(idx); setIsRevealed(isLocked || !selectedCharacters.includes(line.character)); setIsHintVisible(false); setHintUsed(false); setIsSidebarOpen(false); }} className={`w-full text-left p-3 rounded-xl border text-xs transition-colors ${idx === currentIndex ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100 hover:bg-slate-50'}`}>
              <div className="flex justify-between opacity-60 font-bold mb-1">
                <span className={idx === currentIndex ? 'text-indigo-600' : ''}>
                  {idx+1}. {line.character} {charCounts[line.character] && <span className="text-[9px] font-normal lowercase ml-1">({charCounts[line.character]} replik)</span>}
                </span>
                {selectedCharacters.includes(line.character) && <Check size={14} className="text-indigo-500"/>}
              </div>
              <div className={`truncate italic ${idx === currentIndex ? 'text-indigo-900 font-medium' : 'text-slate-600'}`}>"{line.text}"</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default App;