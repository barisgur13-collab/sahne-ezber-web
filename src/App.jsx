import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, Play, ChevronRight, ChevronLeft, Trash2, 
  BookOpen, FastForward, Pause, HelpCircle, 
  Lock, Unlock, Timer, Check, List, X, Lightbulb, MessageCircle, Zap, Loader2, Users, Plus, FolderOpen
} from 'lucide-react';

// Word dosyalarını tarayıcıda okumak için gerekli kütüphane
const MAMMOTH_URL = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.4.21/mammoth.browser.min.js";

// --- ÇEVRİMDIŞI HAFIZA (INDEXEDDB) KURULUMU ---
const DB_NAME = 'SahneEzberDB';
const STORE_NAME = 'projects';
const DB_VERSION = 1;

const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const getAllProjects = async () => {
  const db = await initDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
  });
};

const saveProjectDB = async (project) => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put(project);
  return new Promise(resolve => { tx.oncomplete = () => resolve(); });
};

const deleteProjectDB = async (id) => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).delete(id);
  return new Promise(resolve => { tx.oncomplete = () => resolve(); });
};
// ----------------------------------------------

const App = () => {
  // ANA EKRAN MODLARI: 'splash', 'library', 'input', 'select', 'practice'
  const [mode, setMode] = useState('splash'); 
  
  // VERİ STATE'LERİ
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [script, setScript] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [selectedCharacters, setSelectedCharacters] = useState([]); 
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [inputText, setInputText] = useState('');
  
  // ARAYÜZ STATE'LERİ
  const [isRevealed, setIsRevealed] = useState(false);
  const [isHintVisible, setIsHintVisible] = useState(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [progress, setProgress] = useState(0); 
  const [showProgressBar, setShowProgressBar] = useState(true); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCharModalOpen, setIsCharModalOpen] = useState(false);
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

  // Yükleme Ekranı (Splash) ve Veritabanı Okuma
  useEffect(() => {
    const loadInitialData = async () => {
      const savedProjects = await getAllProjects();
      setProjects(savedProjects.sort((a, b) => b.lastAccessed - a.lastAccessed));
      // 2 Saniyelik Splash Ekranı
      setTimeout(() => setMode('library'), 2000);
    };
    if (mode === 'splash') loadInitialData();
  }, [mode]);

  // Aktif projedeki değişiklikleri (İndeks, Karakter) anında veritabanına kaydet
  const updateProgress = async (updates) => {
    if (!activeProject) return;
    const updatedProject = { ...activeProject, ...updates, lastAccessed: Date.now() };
    setActiveProject(updatedProject);
    await saveProjectDB(updatedProject);
    
    // Kütüphaneyi de güncelle
    setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
  };

  const calculateDelay = (text) => {
    const wordCount = text.split(/\s+/).length;
    const multipliers = { 1: 600, 2: 450, 3: 300, 4: 200, 5: 120 };
    return (wordCount * multipliers[speedLevel]) + 800;
  };

  const getTotalDelay = (index) => {
    if (!script[index]) return 0;
    let delay = calculateDelay(script[index].text);
    if (isLocked && !selectedCharacters.includes(script[index].character) && selectedCharacters.includes(script[index + 1]?.character)) {
      delay += calculateDelay(script[index + 1].text);
    }
    return delay;
  };

  const parseScript = async (text) => {
    // DOCX ve gelişmiş ayrıştırma algoritması geri eklendi
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

    const uniqueChars = [...new Set(parsed.map(p => p.character))].filter(c => c !== 'BİLGİ');
    
    // Yeni Proje Oluştur
    const newProject = {
      id: Date.now().toString(),
      title: newProjectTitle.trim() || 'İsimsiz Metin',
      script: parsed,
      characters: uniqueChars,
      selectedCharacters: [],
      currentIndex: 0,
      lastAccessed: Date.now()
    };

    await saveProjectDB(newProject);
    setProjects(prev => [newProject, ...prev]);
    
    // Projeyi Yükle
    loadProject(newProject);
  };

  const loadProject = (project) => {
    setActiveProject(project);
    setScript(project.script);
    setCharacters(project.characters);
    setSelectedCharacters(project.selectedCharacters || []);
    setCurrentIndex(project.currentIndex || 0);
    setIsRevealed(false);
    setIsHintVisible(false);
    setIsAutoPlaying(false);
    
    if (!project.selectedCharacters || project.selectedCharacters.length === 0) {
      setMode('select');
    } else {
      setMode('practice');
    }
    
    // Son erişim tarihini güncelle
    saveProjectDB({ ...project, lastAccessed: Date.now() });
  };

  const handleDeleteProject = async (e, id) => {
    e.stopPropagation();
    await deleteProjectDB(id);
    setProjects(prev => prev.filter(p => p.id !== id));
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if(!newProjectTitle) setNewProjectTitle(file.name.replace(/\.(txt|docx)$/, ''));

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

  const startPractice = () => {
    setCurrentIndex(0);
    setIsRevealed(false);
    setIsHintVisible(false);
    updateProgress({ currentIndex: 0, selectedCharacters });
    setMode('practice');
    setIsAutoPlaying(true);
  };

  const moveToNext = () => {
    if (currentIndex < script.length - 1) {
      const nextIndex = currentIndex + 1;
      const nextLine = script[nextIndex];

      setIsHintVisible(false);
      setIsRevealed(isLocked || !selectedCharacters.includes(nextLine.character));
      setCurrentIndex(nextIndex);
      updateProgress({ currentIndex: nextIndex }); // Hafızaya kaydet
    } else {
      setIsAutoPlaying(false);
    }
  };

  const handleNextClick = () => {
    if (isLocked) return;
    const currentLine = script[currentIndex];
    if (selectedCharacters.includes(currentLine.character) && !isRevealed) {
      setIsRevealed(true);
      setIsHintVisible(false);
    } else {
      moveToNext();
    }
  };

  // YENİ: Geri Tuşu İşlevi
  const handlePrevClick = () => {
    if (currentIndex > 0) {
      const prevIndex = currentIndex - 1;
      setIsHintVisible(false);
      setIsRevealed(isLocked || !selectedCharacters.includes(script[prevIndex].character));
      setCurrentIndex(prevIndex);
      updateProgress({ currentIndex: prevIndex }); // Hafızaya kaydet
    }
  };

  useEffect(() => {
    if (mode === 'practice' && isAutoPlaying && script[currentIndex]) {
      const currentLine = script[currentIndex];
      const shouldAutoProgress = isLocked || 
                                 (!selectedCharacters.includes(currentLine.character)) || 
                                 (selectedCharacters.includes(currentLine.character) && isRevealed);

      if (shouldAutoProgress) {
        const dynamicDelay = getTotalDelay(currentIndex);
        setProgress(0);
        const pTimer = setTimeout(() => setProgress(100), 50);

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          moveToNext();
        }, dynamicDelay);

        return () => {
          clearTimeout(pTimer);
          if (timerRef.current) clearTimeout(timerRef.current);
        };
      } else {
        setProgress(0);
        if (timerRef.current) clearTimeout(timerRef.current);
      }
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [currentIndex, isAutoPlaying, mode, speedLevel, selectedCharacters, isRevealed, isLocked]);

  // --- EKRANLAR ---

  if (mode === 'splash') {
    return (
      <div className="min-h-screen bg-indigo-600 flex flex-col items-center justify-center text-white relative">
        <BookOpen className="w-24 h-24 animate-bounce mb-6 text-white" />
        <h1 className="text-5xl font-black tracking-tighter">Sahne Ezber</h1>
        <Loader2 className="w-8 h-8 animate-spin mt-10 opacity-70" />
        
        {/* Yükleme Ekranı Alt Bilgisi */}
        <div className="absolute bottom-12 flex flex-col items-center opacity-80">
          <span className="text-sm font-black tracking-[0.3em] uppercase bg-white/20 px-3 py-1 rounded-full mb-2">v1.1</span>
          <span className="text-xs font-medium tracking-widest text-indigo-200">BY BBG</span>
        </div>
      </div>
    );
  }

  if (mode === 'library') {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-indigo-600 rounded-3xl p-6 text-white mb-6 shadow-lg flex justify-between items-center">
             <div>
               <h1 className="text-2xl font-bold flex items-center gap-2"><BookOpen className="w-6 h-6"/> Sahne Ezber</h1>
               <p className="text-indigo-200 text-sm mt-1">Kayıtlı Metinlerin</p>
             </div>
             <div className="text-xs font-bold bg-white/20 px-3 py-1 rounded-full">v1.1</div>
          </div>

          <div className="space-y-4">
            <button 
              onClick={() => { setMode('input'); setNewProjectTitle(''); setInputText(''); }}
              className="w-full bg-white border-2 border-dashed border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all text-indigo-600 p-6 rounded-3xl flex flex-col items-center justify-center gap-2 font-bold shadow-sm"
            >
              <Plus className="w-8 h-8" />
              Yeni Metin Ekle
            </button>

            {projects.length === 0 ? (
              <p className="text-center text-slate-400 py-8 text-sm">Henüz kayıtlı bir metin yok.</p>
            ) : (
              <div className="grid gap-3">
                {projects.map(project => {
                  const percent = project.script?.length > 0 ? Math.round((project.currentIndex / project.script.length) * 100) : 0;
                  return (
                    <div key={project.id} onClick={() => loadProject(project)} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-all cursor-pointer flex justify-between items-center group">
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center shrink-0">
                          <FolderOpen className="w-6 h-6" />
                        </div>
                        <div className="overflow-hidden">
                          <h3 className="font-bold text-slate-800 truncate text-lg">{project.title}</h3>
                          <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                            <span>{project.selectedCharacters?.length > 0 ? project.selectedCharacters.join(', ') : 'Rol seçilmedi'}</span>
                            • <span className="text-indigo-500 font-semibold">% {percent} Tamamlandı</span>
                          </p>
                        </div>
                      </div>
                      <button onClick={(e) => handleDeleteProject(e, project.id)} className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // UYGULAMA ANA GÖVDESİ (Input, Select, Practice)
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-2xl mx-auto bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100 relative">
        
        {/* Header */}
        <div className="bg-indigo-600 p-6 text-white flex justify-between items-center z-10 relative shadow-md">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold flex items-center gap-2">
              {mode !== 'input' ? activeProject?.title : 'Yeni Metin Ekle'}
            </h1>
            {mode !== 'input' && (
              <p className="text-indigo-200 text-xs font-medium mt-1">
                {selectedCharacters.length > 0 ? `${selectedCharacters.join(', ')} Rolleri` : 'Rol Bekleniyor'}
              </p>
            )}
          </div>
          
          <div className="flex gap-2">
            {mode === 'practice' && (
              <button onClick={() => setIsCharModalOpen(true)} className="p-2 hover:bg-white/20 rounded-full transition-colors" title="Karakter Değiştir">
                <Users className="w-5 h-5" />
              </button>
            )}
            {mode !== 'input' && (
              <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-white/20 rounded-full transition-colors" title="Sahne Akışı">
                <List className="w-5 h-5" />
              </button>
            )}
            <button onClick={() => { setIsAutoPlaying(false); setMode('library'); }} className="p-2 hover:bg-white/20 rounded-full transition-colors" title="Kütüphaneye Dön">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {mode === 'input' && (
            <div className="space-y-4 animate-in fade-in duration-500">
              <input 
                type="text" 
                placeholder="Metin Başlığı (Örn: Hamlet 1. Perde)" 
                value={newProjectTitle}
                onChange={(e) => setNewProjectTitle(e.target.value)}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800 outline-none"
              />
              <div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 relative overflow-hidden group">
                <Upload className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
                <p className="text-slate-600 mb-3 text-sm">Senaryo dosyasını yükle (.txt / .docx)</p>
                <input type="file" accept=".txt,.docx" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                <div className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-medium inline-block group-hover:bg-indigo-700 transition-colors">Dosya Seç</div>
              </div>
              <textarea
                className="w-full h-40 p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm"
                placeholder="Veya buraya yapıştır...&#10;HAMLET: Olmak ya da olmamak..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
              <button onClick={() => parseScript(inputText)} disabled={!inputText.trim()} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-black transition-all disabled:opacity-50">
                <Play className="w-5 h-5" /> İleri
              </button>
            </div>
          )}

          {mode === 'select' && (
            <div className="animate-in slide-in-from-bottom-4">
              <h2 className="text-xl font-bold mb-4 text-center text-indigo-600">Rollerini Seç</h2>
              <div className="grid grid-cols-1 gap-3 mb-6 max-h-[50vh] overflow-y-auto p-1">
                {characters.map((char) => {
                  const isSelected = selectedCharacters.includes(char);
                  return (
                    <button key={char} onClick={() => {
                        const newSelection = isSelected ? selectedCharacters.filter(c => c !== char) : [...selectedCharacters, char];
                        setSelectedCharacters(newSelection);
                        updateProgress({ selectedCharacters: newSelection });
                      }} 
                      className={`flex items-center justify-between p-3 border rounded-2xl transition-all w-full text-left ${isSelected ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{char[0]}</div>
                        <span className={`font-semibold ${isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>{char}</span>
                      </div>
                      {isSelected && <Check className="w-5 h-5 text-indigo-600 mr-2" />}
                    </button>
                  );
                })}
              </div>
              <button onClick={startPractice} disabled={selectedCharacters.length === 0} className="w-full bg-indigo-600 text-white py-4 rounded-3xl font-bold text-lg shadow-lg active:scale-95 transition-all disabled:opacity-50">
                Ezbere Başla
              </button>
            </div>
          )}

          {mode === 'practice' && script[currentIndex] && (
            <div className="space-y-4 animate-in fade-in duration-300">
              
              {/* Controls Section */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
                <div className="flex items-center justify-between">
                   <button onClick={() => setIsAutoPlaying(!isAutoPlaying)} className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all ${isAutoPlaying ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
                     {isAutoPlaying ? <FastForward className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                     {isAutoPlaying ? 'Akış Açık' : 'Durduruldu'}
                   </button>
                   <div className="text-xs text-slate-400 font-mono font-bold">
                     {currentIndex + 1} / {script.length}
                   </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> Hız</span>
                    <button onClick={() => setShowProgressBar(!showProgressBar)} className="hover:text-indigo-500 transition-colors">
                      {showProgressBar ? 'Çubuğu Gizle' : 'Çubuğu Göster'}
                    </button>
                  </div>
                  <input type="range" min="1" max="5" step="1" value={speedLevel} onChange={(e) => setSpeedLevel(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                </div>
              </div>

              {/* Progress Bar */}
              {showProgressBar && (
                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-indigo-500 ease-linear" style={{ width: `${progress}%`, transitionDuration: progress === 100 ? `${getTotalDelay(currentIndex)}ms` : '0ms' }} />
                </div>
              )}

              {/* Main Script Area */}
              <div className="min-h-[280px] flex flex-col gap-4">
                {selectedCharacters.includes(script[currentIndex].character) && currentIndex > 0 && !isLocked && !isRevealed && (
                  <div className="animate-in slide-in-from-top-2 bg-indigo-50 border-l-4 border-indigo-400 p-4 rounded-r-2xl shadow-sm">
                    <p className="text-[10px] font-black text-indigo-400 mb-1 uppercase tracking-widest text-left">Az Önce ({script[currentIndex-1].character})</p>
                    <p className="text-slate-600 italic text-left text-sm leading-relaxed">"{script[currentIndex-1].text}"</p>
                  </div>
                )}

                <div className="flex-1 flex flex-col justify-center items-center text-center px-4 bg-white border border-slate-50 rounded-3xl shadow-inner py-8 transition-all">
                  <h3 className={`text-sm font-bold mb-4 tracking-widest uppercase transition-colors ${selectedCharacters.includes(script[currentIndex].character) ? 'text-indigo-600 underline' : 'text-slate-400'}`}>
                    {script[currentIndex].character}
                  </h3>
                  
                  {selectedCharacters.includes(script[currentIndex].character) && !isLocked ? (
                    <div className="space-y-6 w-full">
                      <div className={`text-2xl font-serif italic transition-all duration-700 ${isRevealed ? 'opacity-100 blur-0' : 'opacity-0 blur-xl absolute invisible'}`}>
                        "{script[currentIndex].text}"
                      </div>
                      
                      {!isRevealed && (
                        <div className="space-y-6 animate-in fade-in zoom-in duration-300">
                          {isHintVisible ? (
                            <div className="p-4 bg-indigo-50 text-indigo-700 rounded-2xl border-2 border-indigo-100 border-dashed mx-auto max-w-[250px] shadow-sm italic font-medium">
                              "{script[currentIndex].text.split(' ').slice(0,3).join(' ')}..."
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-2">
                               <div className="text-indigo-200"><HelpCircle className="w-12 h-12" /></div>
                               <p className="font-black text-xs text-indigo-800 tracking-widest uppercase">Sıra Sende</p>
                            </div>
                          )}
                          {!isHintVisible && (
                            <button onClick={() => setIsHintVisible(true)} className="flex items-center justify-center gap-2 mx-auto border-b-2 border-indigo-500 text-indigo-600 font-bold text-sm pb-1 hover:text-indigo-800 transition-all">
                              <Lightbulb className="w-4 h-4" /> İpucu Al
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-2xl text-slate-800 leading-relaxed font-medium animate-in fade-in transition-all duration-500">
                      "{script[currentIndex].text}"
                    </div>
                  )}
                </div>
              </div>

              {/* Action Bar (Geri - İleri - Kilit) */}
              <div className="flex gap-2">
                <button 
                  onClick={handlePrevClick} 
                  disabled={currentIndex === 0 || isLocked} 
                  className="w-16 flex items-center justify-center rounded-3xl bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  title="Bir Önceki Replik"
                >
                  <ChevronLeft className="w-7 h-7" />
                </button>
                
                <button
                  onClick={handleNextClick}
                  disabled={isLocked}
                  className={`flex-1 py-5 rounded-3xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95 ${
                    isLocked ? 'bg-slate-100 text-slate-300 shadow-none cursor-not-allowed' :
                    (selectedCharacters.includes(script[currentIndex].character) && !isRevealed ? 'bg-amber-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700')
                  }`}
                >
                  {currentIndex === script.length - 1 && (isRevealed || isLocked) ? 'EZBERİ BİTİR' : 
                   (selectedCharacters.includes(script[currentIndex].character) && !isRevealed && !isLocked ? 'CEVABI GÖR' : 'SONRAKİ REPLİK')}
                </button>

                <button
                  onClick={() => { setIsLocked(!isLocked); if (!isLocked) setIsRevealed(true); }}
                  className={`w-16 flex items-center justify-center rounded-3xl transition-all shadow-md ${
                    isLocked ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {isLocked ? <Lock className="w-6 h-6" /> : <Unlock className="w-6 h-6" />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Karakter Değiştirme Modalı */}
        {isCharModalOpen && (
          <div className="absolute inset-0 z-50 bg-white/90 backdrop-blur-sm flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black text-indigo-600">Karakterleri Düzenle</h2>
                <button onClick={() => setIsCharModalOpen(false)} className="bg-slate-100 p-2 rounded-full text-slate-600 hover:bg-slate-200"><X/></button>
             </div>
             <div className="flex-1 overflow-y-auto space-y-2 pb-4">
                {characters.map(char => {
                   const isSelected = selectedCharacters.includes(char);
                   return (
                     <button key={char} onClick={() => {
                        const newSelection = isSelected ? selectedCharacters.filter(c => c !== char) : [...selectedCharacters, char];
                        setSelectedCharacters(newSelection);
                        updateProgress({ selectedCharacters: newSelection });
                      }} 
                      className={`w-full text-left p-4 rounded-2xl font-bold transition-all flex justify-between items-center ${isSelected ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-700'}`}
                     >
                        {char}
                        {isSelected && <Check className="w-5 h-5"/>}
                     </button>
                   )
                })}
             </div>
             <button onClick={() => setIsCharModalOpen(false)} className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl text-lg mt-2">Kaydet ve Dön</button>
          </div>
        )}

      </div>

      {/* Yan Menü (Sidebar) */}
      {isSidebarOpen && <div className="fixed inset-0 bg-slate-900/50 z-40 backdrop-blur-sm transition-opacity" onClick={() => setIsSidebarOpen(false)} />}
      <div className={`fixed top-0 right-0 w-80 h-full bg-slate-50 shadow-2xl z-50 transform transition-transform duration-300 flex flex-col ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-4 bg-indigo-600 text-white flex justify-between items-center shadow-md">
          <div className="font-bold flex items-center gap-2"><List className="w-5 h-5" /> Sahne Akışı</div>
          <button onClick={() => setIsSidebarOpen(false)} className="p-1 hover:bg-white/20 rounded-full transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {script.map((line, idx) => {
            const isMyRole = selectedCharacters.includes(line.character);
            const isCurrent = idx === currentIndex;
            return (
              <button key={idx} onClick={() => {
                  setCurrentIndex(idx); setIsRevealed(false); setIsHintVisible(false); setIsSidebarOpen(false); updateProgress({ currentIndex: idx });
                }}
                className={`w-full text-left p-3 rounded-2xl border transition-all ${isCurrent ? 'border-indigo-500 bg-indigo-100 shadow-sm' : isMyRole ? 'border-indigo-100 bg-white hover:bg-indigo-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className={`text-[10px] font-bold uppercase ${isCurrent ? 'text-indigo-700' : isMyRole ? 'text-indigo-500' : 'text-slate-400'}`}>{idx + 1}. {line.character}</span>
                  {isMyRole && <Check className="w-3 h-3 text-indigo-500" />}
                </div>
                <div className={`text-xs truncate ${isCurrent ? 'text-indigo-900 font-bold' : 'text-slate-600'}`}>"{line.text}"</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default App;