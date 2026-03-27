import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, Play, ChevronRight, ChevronLeft, Trash2, 
  BookOpen, FastForward, Pause, HelpCircle, 
  Lock, Unlock, Timer, Check, List, X, Lightbulb, Zap, Loader2, Users, Plus, FolderOpen, Flame, Settings, Info
} from 'lucide-react';

const MAMMOTH_URL = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.4.21/mammoth.browser.min.js";

// --- ÇEVRİMDIŞI HAFIZA (INDEXEDDB) KURULUMU ---
const DB_NAME = 'SufleDB';
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

const getCharCounts = (script) => {
  const counts = {};
  script.forEach(l => {
    if(l.character !== 'BİLGİ') counts[l.character] = (counts[l.character] || 0) + 1;
  });
  return counts;
};

const getCharOccurrences = (script) => {
  const occurrences = [];
  const current = {};
  script.forEach(l => {
    if(l.character !== 'BİLGİ') {
      current[l.character] = (current[l.character] || 0) + 1;
      occurrences.push(current[l.character]);
    } else {
      occurrences.push(0);
    }
  });
  return occurrences;
};

const App = () => {
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [speedLevel, setSpeedLevel] = useState(3); 
  
  // SERİ (STREAK) STATE'LERİ
  const [streak, setStreak] = useState(0);
  const [hintUsed, setHintUsed] = useState(false);
  const [showTenStreakEffect, setShowTenStreakEffect] = useState(false);

  // AYARLAR (LOCAL STORAGE)
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('sufle_settings');
    const defaultSettings = { darkMode: false, fontSize: 'medium', fontFamily: 'sans', vibration: true, tutorialSeen: false };
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
  });

  // ÖĞRETİCİ STATE
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);

  const timerRef = useRef(null);
  const mammothRef = useRef(null);

  // Ayarları Kaydet ve HTML tag'ine uygula
  useEffect(() => {
    localStorage.setItem('sufle_settings', JSON.stringify(settings));
    
    // Koyu modu direkt HTML etiketine uygula (Kesin çözüm)
    if (settings.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings]);

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
      
      setTimeout(() => {
        setMode('library');
        if (!settings.tutorialSeen) {
          setShowTutorial(true);
        }
      }, 2000);
    };
    if (mode === 'splash') loadInitialData();
  }, [mode]);

  const updateProgress = async (updates) => {
    if (!activeProject) return;
    const updatedProject = { ...activeProject, ...updates, lastAccessed: Date.now() };
    setActiveProject(updatedProject);
    await saveProjectDB(updatedProject);
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
    setStreak(0);
    setHintUsed(false);
    
    if (!project.selectedCharacters || project.selectedCharacters.length === 0) {
      setMode('select');
    } else {
      setMode('practice');
    }
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
    setStreak(0);
    setHintUsed(false);
    updateProgress({ currentIndex: 0, selectedCharacters });
    setMode('practice');
    setIsAutoPlaying(true);
  };

  const handleStreakIncrease = () => {
    const newStreak = streak + 1;
    setStreak(newStreak);
    if (newStreak % 10 === 0) {
      setShowTenStreakEffect(true);
      if (settings.vibration && navigator.vibrate) {
        navigator.vibrate([200, 100, 200]); 
      }
      setTimeout(() => setShowTenStreakEffect(false), 2000);
    }
  };

  const moveToNext = () => {
    if (currentIndex < script.length - 1) {
      const nextIndex = currentIndex + 1;
      const nextLine = script[nextIndex];

      setIsHintVisible(false);
      setHintUsed(false);
      setIsRevealed(isLocked || !selectedCharacters.includes(nextLine.character));
      setCurrentIndex(nextIndex);
      updateProgress({ currentIndex: nextIndex }); 
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
      if (!hintUsed) {
        handleStreakIncrease();
      }
    } else {
      moveToNext();
    }
  };

  const handlePrevClick = () => {
    if (currentIndex > 0) {
      const prevIndex = currentIndex - 1;
      setIsHintVisible(false);
      setHintUsed(false);
      setIsRevealed(isLocked || !selectedCharacters.includes(script[prevIndex].character));
      setCurrentIndex(prevIndex);
      updateProgress({ currentIndex: prevIndex });
    }
  };

  const removeCharacter = (name) => {
    setCharacters(prev => prev.filter(c => c !== name));
    setSelectedCharacters(prev => prev.filter(c => c !== name));
    setScript(prev => prev.map(l => l.character === name ? {...l, character: 'BİLGİ'} : l));
    
    // Aktif proje açıksa hafızadaki karakter listesini de güncelle
    if (activeProject) {
      const newChars = characters.filter(c => c !== name);
      const newSelected = selectedCharacters.filter(c => c !== name);
      const newScript = script.map(l => l.character === name ? {...l, character: 'BİLGİ'} : l);
      updateProgress({ characters: newChars, selectedCharacters: newSelected, script: newScript });
    }
  };

  useEffect(() => {
    if (mode === 'practice' && isAutoPlaying && script[currentIndex]) {
      const currentLine = script[currentIndex];
      const isMyRole = selectedCharacters.includes(currentLine.character);
      const shouldAutoProgress = isLocked || (!isMyRole) || (isMyRole && isRevealed);

      if (shouldAutoProgress) {
        const dynamicDelay = getTotalDelay(currentIndex);
        setProgress(0);
        const pTimer = setTimeout(() => setProgress(100), 50);

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          if (!hintUsed && isMyRole) {
            handleStreakIncrease();
          }
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
  }, [currentIndex, isAutoPlaying, mode, speedLevel, selectedCharacters, isRevealed, isLocked, hintUsed]);

  // Önceden hesaplanmış sayaçlar
  const charCounts = getCharCounts(script);
  const charOccurrences = getCharOccurrences(script);

  const getFontSizeClass = () => {
    if (settings.fontSize === 'small') return 'text-lg md:text-xl';
    if (settings.fontSize === 'large') return 'text-3xl md:text-4xl';
    return 'text-2xl md:text-3xl';
  };

  const getFontFamilyClass = () => {
    if (settings.fontFamily === 'serif') return 'font-serif';
    if (settings.fontFamily === 'mono') return 'font-mono';
    return 'font-sans';
  };

  // Öğretici Adımları
  const tutorialData = [
    { icon: <BookOpen className="w-12 h-12 text-indigo-500 mb-4 mx-auto"/>, title: "Sufle'ye Hoş Geldin!", desc: "Sufle, tiyatro ve sahne repliklerini kolayca ezberlemen için tasarlanmış akıllı asistanındır." },
    { icon: <Upload className="w-12 h-12 text-indigo-500 mb-4 mx-auto"/>, title: "Metin Ekle", desc: "Word (.docx) veya .txt uzantılı metinlerini yükleyebilir ya da doğrudan yapıştırabilirsin." },
    { icon: <Users className="w-12 h-12 text-indigo-500 mb-4 mx-auto"/>, title: "Rolünü Seç", desc: "Sufle karakterleri otomatik tanır. Kendi rolünü (veya rollerini) seç." },
    { icon: <HelpCircle className="w-12 h-12 text-indigo-500 mb-4 mx-auto"/>, title: "Sıra Sende!", desc: "Akış başlar, diğer roller otomatik geçer. Senin sıranda durur. 'İpucu Al' diyebilir veya 'Cevabı Gör' diyerek kendini test edebilirsin." },
    { icon: <Flame className="w-12 h-12 text-orange-500 mb-4 mx-auto"/>, title: "Seri (Alev) Sistemi", desc: "İpucu almadan kendi repliğini her bildiğinde serin artar. Her 10'da bir patlama yaşarsın! Hazırsan başlayalım." },
  ];

  const renderTutorial = () => {
    if (!showTutorial) return null;
    const step = tutorialData[tutorialStep];
    return (
      <div className="fixed inset-0 z-[100] bg-slate-900/90 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl relative">
          {step.icon}
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-2">{step.title}</h2>
          <p className="text-slate-600 dark:text-slate-300 mb-8 leading-relaxed">{step.desc}</p>
          <div className="flex gap-2 justify-center mb-6">
            {tutorialData.map((_, idx) => (
              <div key={idx} className={`h-2 rounded-full transition-all ${idx === tutorialStep ? 'w-6 bg-indigo-600' : 'w-2 bg-slate-200 dark:bg-slate-600'}`} />
            ))}
          </div>
          <button 
            onClick={() => {
              if (tutorialStep < tutorialData.length - 1) setTutorialStep(prev => prev + 1);
              else {
                setShowTutorial(false);
                setSettings({...settings, tutorialSeen: true});
              }
            }}
            className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl hover:bg-indigo-700 transition-colors"
          >
            {tutorialStep < tutorialData.length - 1 ? 'Sonraki' : 'Başla'}
          </button>
        </div>
      </div>
    );
  };

  const renderSettings = () => {
    if (!isSettingsOpen) return null;
    return (
      <div className="fixed inset-0 z-[60] bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl text-slate-800 dark:text-white">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2"><Settings className="w-5 h-5"/> Ayarlar</h2>
            <button onClick={() => setIsSettingsOpen(false)} className="p-2 bg-slate-100 dark:bg-slate-700 rounded-full hover:bg-slate-200"><X className="w-5 h-5"/></button>
          </div>
          
          <div className="space-y-6">
            {/* Tema */}
            <div className="flex justify-between items-center">
              <div>
                <p className="font-bold">Koyu Mod</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Göz yormayan arayüz</p>
              </div>
              <button onClick={() => setSettings({...settings, darkMode: !settings.darkMode})} className={`w-12 h-6 rounded-full transition-colors relative ${settings.darkMode ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${settings.darkMode ? 'left-7' : 'left-1'}`}/>
              </button>
            </div>

            {/* Titreşim */}
            <div className="flex justify-between items-center">
              <div>
                <p className="font-bold">Titreşim (Haptic)</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">10 Seride ve butonlarda</p>
              </div>
              <button onClick={() => setSettings({...settings, vibration: !settings.vibration})} className={`w-12 h-6 rounded-full transition-colors relative ${settings.vibration ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${settings.vibration ? 'left-7' : 'left-1'}`}/>
              </button>
            </div>

            {/* Font Boyutu */}
            <div>
              <p className="font-bold mb-2">Okuma Metni Boyutu</p>
              <div className="flex gap-2">
                {['small', 'medium', 'large'].map(size => (
                  <button 
                    key={size}
                    onClick={() => setSettings({...settings, fontSize: size})}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${settings.fontSize === size ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-transparent border-slate-200 dark:border-slate-600'}`}
                  >
                    {size === 'small' ? 'Küçük' : size === 'medium' ? 'Orta' : 'Büyük'}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Tipi */}
            <div>
              <p className="font-bold mb-2">Metin Fontu</p>
              <div className="flex gap-2">
                {[
                  { id: 'sans', label: 'Düz (Sans)' },
                  { id: 'serif', label: 'Kitap (Serif)' },
                  { id: 'mono', label: 'Daktilo' }
                ].map(font => (
                  <button 
                    key={font.id}
                    onClick={() => setSettings({...settings, fontFamily: font.id})}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${settings.fontFamily === font.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-transparent border-slate-200 dark:border-slate-600'}`}
                  >
                    {font.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Öğretici */}
            <button onClick={() => { setIsSettingsOpen(false); setTutorialStep(0); setShowTutorial(true); }} className="w-full flex items-center justify-center gap-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 py-3 rounded-xl font-bold hover:bg-indigo-100 dark:hover:bg-indigo-800 transition-colors">
              <Info className="w-5 h-5"/> Öğreticiyi Tekrar Göster
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ANA RENDER
  return (
    <div className={`${settings.darkMode ? 'dark' : ''}`}>
      <style>{`
        .marquee-container { overflow: hidden; white-space: nowrap; width: 100%; position: relative; }
        .marquee-content { display: inline-block; animation: marquee 8s linear infinite; }
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
      `}</style>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-4 md:p-8 font-sans text-slate-900 dark:text-slate-100 transition-colors">
        
        {renderTutorial()}
        {renderSettings()}

        {mode === 'splash' && (
          <div className="fixed inset-0 z-50 bg-indigo-600 flex flex-col items-center justify-center text-white">
            <BookOpen className="w-24 h-24 animate-bounce mb-6 text-white" />
            <h1 className="text-5xl font-black tracking-tighter">Sufle</h1>
            <Loader2 className="w-8 h-8 animate-spin mt-10 opacity-70" />
            <div className="absolute bottom-12 flex flex-col items-center opacity-80">
              <span className="text-sm font-black tracking-[0.3em] uppercase bg-white/20 px-3 py-1 rounded-full mb-2">v1.2</span>
              <span className="text-xs font-medium tracking-widest text-indigo-200">BY BBG</span>
            </div>
          </div>
        )}

        {mode === 'library' && (
          <div className="max-w-2xl mx-auto animate-in fade-in duration-500">
            <div className="bg-indigo-600 rounded-3xl p-6 text-white mb-6 shadow-lg flex justify-between items-center">
               <div>
                 <h1 className="text-2xl font-bold flex items-center gap-2"><BookOpen className="w-6 h-6"/> Sufle</h1>
                 <p className="text-indigo-200 text-sm mt-1">Kayıtlı Metinlerin</p>
               </div>
               <div className="flex gap-3 items-center">
                 <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-white/20 rounded-full transition-colors"><Settings className="w-5 h-5"/></button>
                 <div className="text-xs font-bold bg-white/20 px-3 py-1 rounded-full">v1.2</div>
               </div>
            </div>

            <div className="space-y-4">
              <button 
                onClick={() => { setMode('input'); setNewProjectTitle(''); setInputText(''); }}
                className="w-full bg-white dark:bg-slate-800 border-2 border-dashed border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all text-indigo-600 dark:text-indigo-400 p-6 rounded-3xl flex flex-col items-center justify-center gap-2 font-bold shadow-sm"
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
                      <div key={project.id} onClick={() => loadProject(project)} className="bg-white dark:bg-slate-800 p-5 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition-all cursor-pointer flex justify-between items-center group w-full min-w-0 overflow-hidden">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center shrink-0">
                            <FolderOpen className="w-6 h-6" />
                          </div>
                          <div className="min-w-0 flex-1">
                            {project.title.length > 18 ? (
                              <div className="marquee-container h-7 w-full overflow-hidden">
                                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg marquee-content">
                                  {project.title} &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; {project.title}
                                </h3>
                              </div>
                            ) : (
                              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg truncate w-full" title={project.title}>{project.title}</h3>
                            )}
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2 w-full min-w-0">
                              <span className="truncate flex-1">{project.selectedCharacters?.length > 0 ? project.selectedCharacters.join(', ') : 'Rol seçilmedi'}</span>
                              <span className="text-indigo-500 dark:text-indigo-400 font-semibold shrink-0">• % {percent} Tamamlandı</span>
                            </p>
                          </div>
                        </div>
                        <button onClick={(e) => handleDeleteProject(e, project.id)} className="p-3 text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 rounded-xl transition-all shrink-0 ml-2">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ANA EKRANLAR (INPUT, SELECT, PRACTICE) */}
        {mode !== 'splash' && mode !== 'library' && (
          <div className="max-w-2xl mx-auto bg-white dark:bg-slate-800 rounded-3xl shadow-xl overflow-hidden border border-slate-100 dark:border-slate-700 relative">
            
            {/* 10 Seri Patlama Efekti */}
            {showTenStreakEffect && (
              <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center animate-in fade-in zoom-in duration-500">
                <Flame className="w-64 h-64 text-orange-500 opacity-20 animate-ping absolute" />
                <Flame className="w-32 h-32 text-orange-400 fill-orange-400 animate-bounce relative z-10" />
              </div>
            )}

            {/* Header */}
            <div className="bg-indigo-600 p-6 text-white flex justify-between items-center z-10 relative shadow-md">
              <div className="flex flex-col min-w-0 flex-1 mr-4">
                <h1 className="text-xl font-bold flex items-center gap-2 truncate">
                  {mode !== 'input' ? activeProject?.title : 'Yeni Metin Ekle'}
                </h1>
                {mode !== 'input' && (
                  <p className="text-indigo-200 text-xs font-medium mt-1 truncate">
                    {selectedCharacters.length > 0 ? `${selectedCharacters.join(', ')} Rolleri` : 'Rol Bekleniyor'}
                  </p>
                )}
              </div>
              
              <div className="flex gap-1 shrink-0">
                {mode === 'practice' && streak >= 3 && (
                  <div className="flex items-center gap-1 bg-orange-500/20 px-3 py-1 rounded-full font-bold text-xs animate-bounce border border-orange-500/30 mr-2 text-orange-100">
                    <Flame size={14} className="fill-orange-400" />
                    <span>{streak} Seri</span>
                  </div>
                )}
                {mode === 'practice' && (
                  <button onClick={() => setIsCharModalOpen(true)} className="p-2 hover:bg-white/20 rounded-full transition-colors" title="Karakter Değiştir">
                    <Users className="w-5 h-5" />
                  </button>
                )}
                <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-white/20 rounded-full transition-colors"><Settings className="w-5 h-5" /></button>
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
                    className="w-full p-4 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800 dark:text-slate-100 outline-none"
                  />
                  <div className="text-center p-6 border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-2xl bg-slate-50 dark:bg-slate-800/50 relative overflow-hidden group">
                    <Upload className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
                    <p className="text-slate-600 dark:text-slate-400 mb-3 text-sm">Senaryo dosyasını yükle (.txt / .docx)</p>
                    <input type="file" accept=".txt,.docx" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    <div className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-medium inline-block group-hover:bg-indigo-700 transition-colors">Dosya Seç</div>
                  </div>
                  <textarea
                    className="w-full h-40 p-4 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm dark:text-slate-200"
                    placeholder="Veya buraya yapıştır...&#10;HAMLET: Olmak ya da olmamak..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                  />
                  <button onClick={() => parseScript(inputText)} disabled={!inputText.trim()} className="w-full bg-slate-900 dark:bg-black text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all disabled:opacity-50">
                    <Play className="w-5 h-5" /> İleri
                  </button>
                </div>
              )}

              {mode === 'select' && (
                <div className="animate-in slide-in-from-bottom-4">
                  <h2 className="text-xl font-bold mb-4 text-center text-indigo-600 dark:text-indigo-400">Rollerini Seç</h2>
                  <div className="grid grid-cols-1 gap-3 mb-6 max-h-[50vh] overflow-y-auto p-1">
                    {characters.map((char) => {
                      const isSelected = selectedCharacters.includes(char);
                      return (
                        <div key={char} className={`flex items-center justify-between p-2 border rounded-2xl transition-all w-full ${isSelected ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 shadow-sm' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                          <button onClick={() => {
                              const newSelection = isSelected ? selectedCharacters.filter(c => c !== char) : [...selectedCharacters, char];
                              setSelectedCharacters(newSelection);
                              updateProgress({ selectedCharacters: newSelection });
                            }} 
                            className="flex-1 flex items-center gap-4 text-left p-2"
                          >
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors shrink-0 ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>{char[0]}</div>
                            <div className="flex-1 min-w-0">
                              <span className={`font-bold block truncate ${isSelected ? 'text-indigo-900 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200'}`}>{char}</span>
                              <span className="text-xs text-slate-400 dark:text-slate-500">({charCounts[char]} Replik)</span>
                            </div>
                            {isSelected && <Check className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mr-2 shrink-0" />}
                          </button>
                          <button onClick={() => removeCharacter(char)} className="p-3 text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 rounded-xl transition-all shrink-0">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
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
                  <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-600 space-y-4">
                    <div className="flex items-center justify-between">
                       <button onClick={() => setIsAutoPlaying(!isAutoPlaying)} className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all ${isAutoPlaying ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400' : 'bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300'}`}>
                         {isAutoPlaying ? <FastForward className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                         {isAutoPlaying ? 'Akış Açık' : 'Durduruldu'}
                       </button>
                       <div className="text-xs text-slate-400 dark:text-slate-500 font-mono font-bold">
                         {currentIndex + 1} / {script.length}
                       </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> Hız</span>
                        <button onClick={() => setShowProgressBar(!showProgressBar)} className="hover:text-indigo-500 transition-colors">
                          {showProgressBar ? 'Çubuğu Gizle' : 'Çubuğu Göster'}
                        </button>
                      </div>
                      <input type="range" min="1" max="5" step="1" value={speedLevel} onChange={(e) => setSpeedLevel(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {showProgressBar && (
                    <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mb-2">
                      <div className="h-full bg-indigo-500 ease-linear" style={{ width: `${progress}%`, transitionDuration: progress === 100 ? `${getTotalDelay(currentIndex)}ms` : '0ms' }} />
                    </div>
                  )}

                  {/* Main Script Area */}
                  <div className="min-h-[280px] flex flex-col gap-4">
                    {selectedCharacters.includes(script[currentIndex].character) && currentIndex > 0 && !isLocked && !isRevealed && (
                      <div className="animate-in slide-in-from-top-2 bg-indigo-50 dark:bg-indigo-900/20 border-l-4 border-indigo-400 p-4 rounded-r-2xl shadow-sm">
                        <p className="text-[10px] font-black text-indigo-400 mb-1 uppercase tracking-widest text-left">Az Önce ({script[currentIndex-1].character})</p>
                        <p className="text-slate-600 dark:text-slate-300 italic text-left text-sm leading-relaxed">"{script[currentIndex-1].text}"</p>
                      </div>
                    )}

                    <div className="flex-1 flex flex-col justify-center items-center text-center px-4 bg-white dark:bg-slate-800 border border-slate-50 dark:border-slate-700 rounded-3xl shadow-inner py-8 transition-all">
                      <h3 className={`text-sm font-bold mb-4 tracking-widest uppercase transition-colors ${selectedCharacters.includes(script[currentIndex].character) ? 'text-indigo-600 dark:text-indigo-400 underline' : 'text-slate-400 dark:text-slate-500'}`}>
                        {script[currentIndex].character}
                      </h3>
                      
                      {selectedCharacters.includes(script[currentIndex].character) && !isLocked ? (
                        <div className="space-y-6 w-full">
                          <div className={`${getFontSizeClass()} ${getFontFamilyClass()} italic transition-all duration-700 ${isRevealed ? 'opacity-100 blur-0' : 'opacity-0 blur-xl absolute invisible'}`}>
                            "{script[currentIndex].text}"
                          </div>
                          
                          {!isRevealed && (
                            <div className="space-y-6 animate-in fade-in zoom-in duration-300">
                              {isHintVisible ? (
                                <div className="p-4 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-2xl border-2 border-indigo-100 dark:border-indigo-800 border-dashed mx-auto max-w-[250px] shadow-sm italic font-medium">
                                  "{script[currentIndex].text.split(' ').slice(0,3).join(' ')}..."
                                </div>
                              ) : (
                                <div className="flex flex-col items-center gap-2">
                                   <div className="text-indigo-200 dark:text-indigo-800"><HelpCircle className="w-12 h-12" /></div>
                                   <p className="font-black text-xs text-indigo-800 dark:text-indigo-400 tracking-widest uppercase">Sıra Sende</p>
                                </div>
                              )}
                              {!isHintVisible && (
                                <button onClick={() => { setIsHintVisible(true); setHintUsed(true); setStreak(0); }} className="flex items-center justify-center gap-2 mx-auto border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold text-sm pb-1 hover:text-indigo-800 dark:hover:text-indigo-300 transition-all">
                                  <Lightbulb className="w-4 h-4" /> İpucu Al
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className={`${getFontSizeClass()} ${getFontFamilyClass()} text-slate-800 dark:text-slate-200 leading-relaxed font-medium animate-in fade-in transition-all duration-500`}>
                          "{script[currentIndex].text}"
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Bar */}
                  <div className="flex gap-2">
                    <button 
                      onClick={handlePrevClick} 
                      disabled={currentIndex === 0 || isLocked} 
                      className="w-16 flex items-center justify-center rounded-3xl bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
                      title="Bir Önceki Replik"
                    >
                      <ChevronLeft className="w-7 h-7" />
                    </button>
                    
                    <button
                      onClick={handleNextClick}
                      disabled={isLocked}
                      className={`flex-1 py-5 rounded-3xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95 min-w-0 ${
                        isLocked ? 'bg-slate-100 dark:bg-slate-700 text-slate-300 dark:text-slate-500 shadow-none cursor-not-allowed' :
                        (selectedCharacters.includes(script[currentIndex].character) && !isRevealed ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700')
                      }`}
                    >
                      {currentIndex === script.length - 1 && (isRevealed || isLocked) ? 'EZBERİ BİTİR' : 
                       (selectedCharacters.includes(script[currentIndex].character) && !isRevealed && !isLocked ? 'CEVABI GÖR' : 'SONRAKİ REPLİK')}
                    </button>

                    <button
                      onClick={() => { setIsLocked(!isLocked); if (!isLocked) setIsRevealed(true); }}
                      className={`w-16 flex items-center justify-center rounded-3xl transition-all shadow-md shrink-0 ${
                        isLocked ? 'bg-rose-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
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
              <div className="absolute inset-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200">
                 <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-black text-indigo-600 dark:text-indigo-400">Karakterleri Düzenle</h2>
                    <button onClick={() => setIsCharModalOpen(false)} className="bg-slate-100 dark:bg-slate-800 p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"><X/></button>
                 </div>
                 <div className="flex-1 overflow-y-auto space-y-2 pb-4">
                    {characters.map(char => {
                       const isSelected = selectedCharacters.includes(char);
                       return (
                         <div key={char} className={`flex items-center justify-between p-2 border rounded-2xl transition-all w-full ${isSelected ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 shadow-sm' : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800'}`}>
                           <button onClick={() => {
                              const newSelection = isSelected ? selectedCharacters.filter(c => c !== char) : [...selectedCharacters, char];
                              setSelectedCharacters(newSelection);
                              updateProgress({ selectedCharacters: newSelection });
                            }} 
                            className="flex-1 flex justify-between items-center text-left p-2"
                           >
                              <div className="flex items-center gap-2">
                                <span className={isSelected ? 'text-indigo-900 dark:text-indigo-300 font-bold' : 'text-slate-700 dark:text-slate-300 font-bold'}>{char}</span>
                                <span className={`text-xs font-normal ${isSelected ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-400'}`}>({charCounts[char]} Replik)</span>
                              </div>
                              {isSelected && <Check className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mr-2"/>}
                           </button>
                           <button onClick={() => removeCharacter(char)} className="p-3 text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 rounded-xl transition-all shrink-0">
                             <Trash2 className="w-5 h-5" />
                           </button>
                         </div>
                       )
                    })}
                 </div>
                 <button onClick={() => setIsCharModalOpen(false)} className="w-full py-4 bg-slate-900 dark:bg-slate-700 text-white font-bold rounded-2xl text-lg mt-2">Kaydet ve Dön</button>
              </div>
            )}

          </div>
        )}

        {/* Yan Menü (Sidebar) */}
        {isSidebarOpen && <div className="fixed inset-0 bg-slate-900/50 z-40 backdrop-blur-sm transition-opacity" onClick={() => setIsSidebarOpen(false)} />}
        <div className={`fixed top-0 right-0 w-80 h-full bg-slate-50 dark:bg-slate-900 shadow-2xl z-50 transform transition-transform duration-300 flex flex-col ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
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
                    setCurrentIndex(idx); setIsRevealed(false); setIsHintVisible(false); setHintUsed(false); setIsSidebarOpen(false); updateProgress({ currentIndex: idx });
                  }}
                  className={`w-full text-left p-3 rounded-2xl border transition-all ${isCurrent ? 'border-indigo-500 bg-indigo-100 dark:bg-indigo-900/30 shadow-sm' : isMyRole ? 'border-indigo-100 dark:border-indigo-800/50 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className={`text-[10px] font-bold uppercase ${isCurrent ? 'text-indigo-700 dark:text-indigo-400' : isMyRole ? 'text-indigo-500' : 'text-slate-400 dark:text-slate-500'}`}>
                      {idx + 1}. {line.character} <span className="font-normal lowercase">({charOccurrences[idx]}/{charCounts[line.character]})</span>
                    </span>
                    {isMyRole && <Check className="w-3 h-3 text-indigo-500" />}
                  </div>
                  <div className={`text-xs truncate ${isCurrent ? 'text-indigo-900 dark:text-indigo-200 font-bold' : 'text-slate-600 dark:text-slate-400'}`}>"{line.text}"</div>
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
};

export default App;