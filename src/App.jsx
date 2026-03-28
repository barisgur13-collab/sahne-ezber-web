import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, Play, ChevronRight, ChevronLeft, Trash2, 
  BookOpen, FastForward, Pause, HelpCircle, 
  Lock, Unlock, Timer, Check, List, X, Lightbulb, Zap, Loader2, Users, Plus, FolderOpen, Flame, Settings, Info, Mic, Volume2, BarChart
} from 'lucide-react';

const MAMMOTH_URL = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.4.21/mammoth.browser.min.js";
const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js";
const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";

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
    if(l.character !== 'BİLGİ' && l.character !== 'BÖLÜM') counts[l.character] = (counts[l.character] || 0) + 1;
  });
  return counts;
};

const getCharOccurrences = (script) => {
  const occurrences = [];
  const current = {};
  script.forEach(l => {
    if(l.character !== 'BİLGİ' && l.character !== 'BÖLÜM') {
      current[l.character] = (current[l.character] || 0) + 1;
      occurrences.push(current[l.character]);
    } else {
      occurrences.push(0);
    }
  });
  return occurrences;
};

const formatEmotionText = (text) => {
  const parts = text.split(/(\[[^\]]+\]|\([^\)]+\))/g);
  return parts.map((part, i) => 
    /^[\[\(].*[\]\)]$/.test(part) ? 
      <span key={i} className="text-fuchsia-500 text-[0.75em] font-semibold mx-1 block md:inline mt-2 md:mt-0 opacity-80">{part}</span> : 
      <span key={i}>{part}</span>
  );
};

const App = () => {
  const [mode, setMode] = useState('splash'); 
  
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [script, setScript] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [selectedCharacters, setSelectedCharacters] = useState([]); 
  const [charVoices, setCharVoices] = useState({}); // YENİ: Karakter sesleri (M/F)
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [inputText, setInputText] = useState('');
  
  const [isRevealed, setIsRevealed] = useState(false);
  const [isHintVisible, setIsHintVisible] = useState(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [progress, setProgress] = useState(0); 
  const [showProgressBar, setShowProgressBar] = useState(true); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCharModalOpen, setIsCharModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [speedLevel, setSpeedLevel] = useState(3); 
  
  const [analytics, setAnalytics] = useState({});
  const [streak, setStreak] = useState(0);
  const [hintUsed, setHintUsed] = useState(false);
  const [showTenStreakEffect, setShowTenStreakEffect] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [isListening, setIsListening] = useState(false); // YENİ: Mikrofon dinleme durumu

  // Ayarlar (Varsayılanlar güncellendi: TTS açık, Mic kapalı)
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('sufle_settings');
    const defaultSettings = { darkMode: false, fontSize: 'medium', fontFamily: 'sans', vibration: true, tutorialSeen: false, ttsEnabled: true, micEnabled: false };
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
  });

  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);

  const timerRef = useRef(null);
  const mammothRef = useRef(null);
  const recognitionRef = useRef(null);
  const activeLineRef = useRef(null); 

  // YENİ: Cihazdaki sesleri uygulamaya önden tanıtmak için (Android/Chrome uyumluluğu)
  useEffect(() => {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }, []);

  useEffect(() => {
    if (isSidebarOpen && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentIndex, isSidebarOpen]);

  useEffect(() => {
    localStorage.setItem('sufle_settings', JSON.stringify(settings));
    if (settings.darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [settings]);

  useEffect(() => {
    const mScript = document.createElement('script');
    mScript.src = MAMMOTH_URL;
    mScript.async = true;
    mScript.onload = () => { mammothRef.current = window.mammoth; };
    document.body.appendChild(mScript);

    const pScript = document.createElement('script');
    pScript.src = PDFJS_URL;
    pScript.async = true;
    pScript.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL; };
    document.body.appendChild(pScript);

    return () => { 
      if (document.body.contains(mScript)) document.body.removeChild(mScript); 
      if (document.body.contains(pScript)) document.body.removeChild(pScript); 
    };
  }, []);

  // Mikrofon izni ve kontrolü
  const toggleMic = async () => {
    if (!settings.micEnabled) {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        setSettings({...settings, micEnabled: true});
      } catch (err) {
        alert("Sesle kontrol özelliğini kullanabilmek için cihazınızdan mikrofon izni vermelisiniz.");
      }
    } else {
      setSettings({...settings, micEnabled: false});
      setIsListening(false);
    }
  };

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (settings.micEnabled && SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang = 'tr-TR';
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onstart = () => setIsListening(true);
      recognitionRef.current.onend = () => setIsListening(false);

      recognitionRef.current.onresult = (event) => {
        const last = event.results.length - 1;
        const command = event.results[last][0].transcript.trim().toLowerCase();
        
        if (command.includes('sonraki') || command.includes('geç') || command.includes('devam')) {
           handleNextClick();
        } else if (command.includes('ipucu') || command.includes('yardım')) {
           setIsHintVisible(true);
           setHintUsed(true);
           setStreak(0);
           setAnalytics(prev => ({...prev, [currentIndex]: (prev[currentIndex] || 0) + 1}));
        }
      };
    }
  }, [settings.micEnabled, currentIndex, isLocked]);

  useEffect(() => {
    if (settings.micEnabled && recognitionRef.current && mode === 'practice') {
      const isMyRole = selectedCharacters.includes(script[currentIndex]?.character);
      if (isMyRole && !isRevealed && !isAutoPlaying) {
        try { recognitionRef.current.start(); } catch(e){}
      } else {
        try { recognitionRef.current.stop(); } catch(e){}
      }
    }
  }, [currentIndex, isRevealed, selectedCharacters, settings.micEnabled, mode, isAutoPlaying]);


  useEffect(() => {
    const loadInitialData = async () => {
      const savedProjects = await getAllProjects();
      setProjects(savedProjects.sort((a, b) => b.lastAccessed - a.lastAccessed));
      setTimeout(() => {
        setMode('library');
        if (!settings.tutorialSeen) setShowTutorial(true);
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
    const sceneRegex = /^(?:(?:[0-9]+\.?\s*)?(?:SAHNE|PERDE)(?:\s*[0-9]+)?|[IVX]+\.\s*(?:SAHNE|PERDE))/i;

    rawLines.forEach(line => {
      let nameMatch = line.match(separatorRegex) || line.match(allCapsRegex);
      if (nameMatch && !sceneRegex.test(line)) {
        let name = (nameMatch[1] || nameMatch[0]).toUpperCase().trim();
        if (name.split(/\s+/).length <= 5 && !/^\d+$/.test(name)) knownCharacters.add(name);
      }
    });

    const sortedNames = Array.from(knownCharacters).sort((a, b) => b.length - a.length);
    const parsed = [];
    let currentCharacter = 'BİLGİ';
    let currentText = [];

    rawLines.forEach(line => {
      if (sceneRegex.test(line)) {
        if (currentText.length > 0) parsed.push({ character: currentCharacter, text: currentText.join(' ') });
        currentCharacter = 'BÖLÜM';
        currentText = [line.toUpperCase()];
        return;
      }

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

    const uniqueChars = [...new Set(parsed.map(p => p.character))].filter(c => c !== 'BİLGİ' && c !== 'BÖLÜM');
    
    // Otomatik cinsiyet (ses) ataması (Sırayla E/K)
    const initialVoices = {};
    uniqueChars.forEach((c, i) => initialVoices[c] = i % 2 === 0 ? 'M' : 'F');

    const newProject = {
      id: Date.now().toString(),
      title: newProjectTitle.trim() || 'İsimsiz Metin',
      script: parsed,
      characters: uniqueChars,
      selectedCharacters: [],
      charVoices: initialVoices,
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
    setAnalytics({});
    window.speechSynthesis.cancel();
    
    let loadedVoices = project.charVoices || {};
    if (Object.keys(loadedVoices).length === 0) {
       project.characters.forEach((c, i) => loadedVoices[c] = i % 2 === 0 ? 'M' : 'F');
    }
    setCharVoices(loadedVoices);

    if (!project.selectedCharacters || project.selectedCharacters.length === 0) {
      setMode('select');
    } else {
      setMode('practice');
    }
    saveProjectDB({ ...project, lastAccessed: Date.now() });
  };

  const handleDeleteProject = async (id) => {
    await deleteProjectDB(id);
    setProjects(prev => prev.filter(p => p.id !== id));
    setProjectToDelete(null);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if(!newProjectTitle) setNewProjectTitle(file.name.replace(/\.(txt|docx|pdf)$/, ''));

    const reader = new FileReader();
    
    if (file.name.endsWith('.docx')) {
      if (!mammothRef.current) return;
      reader.onload = async (ev) => {
        const result = await mammothRef.current.extractRawText({ arrayBuffer: ev.target.result });
        setInputText(result.value.replace(/\u000B/g, '\n'));
      };
      reader.readAsArrayBuffer(file);
    } else if (file.name.endsWith('.pdf')) {
      if (!window.pdfjsLib) return;
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map(item => item.str);
        fullText += strings.join(' ') + '\n';
      }
      setInputText(fullText);
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
    setAnalytics({});
    updateProgress({ currentIndex: 0, selectedCharacters, charVoices });
    setMode('practice');
    setIsAutoPlaying(true);
  };

  const handleStreakIncrease = () => {
    const newStreak = streak + 1;
    setStreak(newStreak);
    if (newStreak % 10 === 0) {
      setShowTenStreakEffect(true);
      if (settings.vibration && navigator.vibrate) navigator.vibrate([200, 100, 200]); 
      setTimeout(() => setShowTenStreakEffect(false), 2000);
    }
  };

  const speakLine = (text, character, onEndCallback) => {
    if (!settings.ttsEnabled) {
      if (onEndCallback) onEndCallback();
      return;
    }
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/\[.*?\]|\(.*?\)/g, '');
    const ut = new SpeechSynthesisUtterance(cleanText);
    ut.lang = 'tr-TR';
    
    // Hız ayarı
    const rateMap = { 1: 0.6, 2: 0.8, 3: 1.0, 4: 1.3, 5: 1.6 };
    ut.rate = rateMap[speedLevel] || 1.0;
    
    const gender = charVoices[character] || 'M';
    
    // Cihazdaki sesleri çekip kadın/erkek olarak atama algoritması
    const voices = window.speechSynthesis.getVoices();
    const trVoices = voices.filter(v => v.lang.includes('tr') || v.lang.includes('TR'));
    
    if (trVoices.length > 0) {
      const femaleVoice = trVoices.find(v => /(yelda|zeynep|ayşe|kadın|female)/i.test(v.name)) || trVoices[0];
      const maleVoice = trVoices.find(v => /(cem|tolga|erkek|male)/i.test(v.name)) || (trVoices.length > 1 ? trVoices[1] : trVoices[0]);
      
      ut.voice = gender === 'F' ? femaleVoice : maleVoice;
      
      // Cihazda tek ses varsa efekti (pitch) daha sert uygula
      if (femaleVoice === maleVoice) {
        ut.pitch = gender === 'M' ? 0.4 : 1.8; 
      } else {
        ut.pitch = 1.0; 
      }
    } else {
      ut.pitch = gender === 'M' ? 0.4 : 1.8;
    }

    if (onEndCallback) {
      ut.onend = () => onEndCallback();
      ut.onerror = () => onEndCallback();
    }
    
    window.speechSynthesis.speak(ut);
  };

  const moveToNext = () => {
    window.speechSynthesis.cancel();
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
    if (isLocked && isAutoPlaying) return; 
    const currentLine = script[currentIndex];
    
    if (selectedCharacters.includes(currentLine.character) && !isRevealed && !isLocked) {
      setIsRevealed(true);
      setIsHintVisible(false);
      if (!hintUsed) handleStreakIncrease();
    } else {
      moveToNext();
    }
  };

  const handlePrevClick = () => {
    if (currentIndex > 0) {
      if (isLocked && isAutoPlaying) return; 
      window.speechSynthesis.cancel();
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
    if (activeProject) {
      const newChars = characters.filter(c => c !== name);
      const newSelected = selectedCharacters.filter(c => c !== name);
      const newScript = script.map(l => l.character === name ? {...l, character: 'BİLGİ'} : l);
      updateProgress({ characters: newChars, selectedCharacters: newSelected, script: newScript });
    }
  };

  const handleToggleVoice = (e, char) => {
    e.stopPropagation();
    const newVoices = {...charVoices, [char]: charVoices[char] === 'M' ? 'F' : 'M'};
    setCharVoices(newVoices);
    updateProgress({ charVoices: newVoices });
  };

  // YENİ: Zamanlayıcı ve TTS Senkronizasyonu (onEnd)
  useEffect(() => {
    if (mode === 'practice' && script[currentIndex] && isAutoPlaying) {
      const currentLine = script[currentIndex];
      const isMyRole = selectedCharacters.includes(currentLine.character);
      const isSpecial = currentLine.character === 'BİLGİ' || currentLine.character === 'BÖLÜM';
      const shouldAutoProgress = isLocked || (!isMyRole) || (isMyRole && isRevealed);

      if (shouldAutoProgress) {
        setProgress(0);
        const pTimer = setTimeout(() => setProgress(100), 50);
        let isCancelled = false;

        const proceed = () => {
          if (isCancelled) return;
          if (timerRef.current) clearTimeout(timerRef.current);
          if (!hintUsed && isMyRole) handleStreakIncrease();
          moveToNext();
        };

        if (timerRef.current) clearTimeout(timerRef.current);

        // Eğer TTS açıksa ve okunacak bir rolse, timer yerine onend (ses bitişini) bekle
        if (settings.ttsEnabled && !isMyRole && !isSpecial) {
          speakLine(currentLine.text, currentLine.character, proceed);
          // Güvenlik amacıyla ses motoru takılırsa diye yedek bir uzun zamanlayıcı
          const fallbackDelay = calculateDelay(currentLine.text) * 2 + 2000;
          timerRef.current = setTimeout(proceed, fallbackDelay);
        } else {
          // Normal bekleme (TTS kapalıysa veya özel satırsa)
          const dynamicDelay = getTotalDelay(currentIndex);
          timerRef.current = setTimeout(proceed, dynamicDelay);
        }

        return () => { 
          isCancelled = true;
          clearTimeout(pTimer); 
          if (timerRef.current) clearTimeout(timerRef.current); 
          window.speechSynthesis.cancel();
        };
      } else {
        setProgress(0);
        if (timerRef.current) clearTimeout(timerRef.current);
      }
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); window.speechSynthesis.cancel(); };
  }, [currentIndex, isAutoPlaying, mode, speedLevel, selectedCharacters, isRevealed, isLocked, hintUsed, settings.ttsEnabled, charVoices]);

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

  const tutorialData = [
    { icon: <BookOpen className="w-12 h-12 text-indigo-500 mb-4 mx-auto"/>, title: "Sufle'ye Hoş Geldin!", desc: "Sufle, tiyatro ve sahne repliklerini kolayca ezberlemen için tasarlanmış akıllı asistanındır." },
    { icon: <Upload className="w-12 h-12 text-indigo-500 mb-4 mx-auto"/>, title: "Metin Ekle", desc: "PDF, Word (.docx) veya .txt uzantılı metinlerini yükleyebilir ya da doğrudan yapıştırabilirsin." },
    { icon: <Users className="w-12 h-12 text-indigo-500 mb-4 mx-auto"/>, title: "Rolünü Seç", desc: "Sufle karakterleri otomatik tanır. Kendi rolünü (veya rollerini) seç." },
    { icon: <HelpCircle className="w-12 h-12 text-indigo-500 mb-4 mx-auto"/>, title: "Sıra Sende!", desc: "Akış başlar, diğer roller otomatik geçer. Senin sıranda durur. 'İpucu Al' diyebilir veya 'Cevabı Gör' diyerek kendini test edebilirsin." },
    { icon: <Volume2 className="w-12 h-12 text-indigo-500 mb-4 mx-auto"/>, title: "Koçluk Özellikleri", desc: "Ayarlardan 'Sesli Okuma'yı açarak karşında biri varmış gibi dinleyebilir veya 'Mikrofon'u açıp 'Sonraki/İpucu' diyerek sesle komut verebilirsin." },
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
              else { setShowTutorial(false); setSettings({...settings, tutorialSeen: true}); }
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
        <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-md shadow-2xl text-slate-800 dark:text-white max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 z-10">
            <h2 className="text-xl font-bold flex items-center gap-2"><Settings className="w-5 h-5"/> Ayarlar</h2>
            <button onClick={() => setIsSettingsOpen(false)} className="p-2 bg-slate-100 dark:bg-slate-700 rounded-full hover:bg-slate-200"><X className="w-5 h-5"/></button>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl space-y-4">
              <h3 className="font-bold text-indigo-800 dark:text-indigo-300 text-xs uppercase tracking-wider mb-2">Koçluk Özellikleri</h3>
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-bold flex items-center gap-2"><Volume2 size={16}/> Sesli Okuma</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Karşı tarafın repliklerini okur</p>
                </div>
                <button onClick={() => setSettings({...settings, ttsEnabled: !settings.ttsEnabled})} className={`w-12 h-6 rounded-full transition-colors relative ${settings.ttsEnabled ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${settings.ttsEnabled ? 'left-7' : 'left-1'}`}/>
                </button>
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-bold flex items-center gap-2"><Mic size={16}/> Sesle Kontrol</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Mikrofonla "Geç" veya "İpucu" de</p>
                </div>
                <button onClick={toggleMic} className={`w-12 h-6 rounded-full transition-colors relative ${settings.micEnabled ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${settings.micEnabled ? 'left-7' : 'left-1'}`}/>
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <div>
                <p className="font-bold">Koyu Mod</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Göz yormayan arayüz</p>
              </div>
              <button onClick={() => setSettings({...settings, darkMode: !settings.darkMode})} className={`w-12 h-6 rounded-full transition-colors relative ${settings.darkMode ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${settings.darkMode ? 'left-7' : 'left-1'}`}/>
              </button>
            </div>

            <div className="flex justify-between items-center">
              <div>
                <p className="font-bold">Titreşim (Haptic)</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">10 Seride ve butonlarda</p>
              </div>
              <button onClick={() => setSettings({...settings, vibration: !settings.vibration})} className={`w-12 h-6 rounded-full transition-colors relative ${settings.vibration ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${settings.vibration ? 'left-7' : 'left-1'}`}/>
              </button>
            </div>

            <div>
              <p className="font-bold mb-2">Okuma Metni Boyutu</p>
              <div className="flex gap-2">
                {['small', 'medium', 'large'].map(size => (
                  <button key={size} onClick={() => setSettings({...settings, fontSize: size})} className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${settings.fontSize === size ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-transparent border-slate-200 dark:border-slate-600'}`}>
                    {size === 'small' ? 'Küçük' : size === 'medium' ? 'Orta' : 'Büyük'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="font-bold mb-2">Metin Fontu</p>
              <div className="flex gap-2">
                {[ { id: 'sans', label: 'Düz' }, { id: 'serif', label: 'Kitap' }, { id: 'mono', label: 'Daktilo' } ].map(font => (
                  <button key={font.id} onClick={() => setSettings({...settings, fontFamily: font.id})} className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${settings.fontFamily === font.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-transparent border-slate-200 dark:border-slate-600'}`}>
                    {font.label}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={() => { setIsSettingsOpen(false); setTutorialStep(0); setShowTutorial(true); }} className="w-full flex items-center justify-center gap-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 py-3 rounded-xl font-bold hover:bg-indigo-100 dark:hover:bg-indigo-800 transition-colors">
              <Info className="w-5 h-5"/> Öğreticiyi Tekrar Göster
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderAnalyticsModal = () => {
    if (!isAnalyticsOpen) return null;
    const difficultLines = Object.entries(analytics).sort((a, b) => b[1] - a[1]).slice(0, 3);
    
    return (
      <div className="fixed inset-0 z-[100] bg-slate-900/90 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
          <BarChart className="w-16 h-16 text-indigo-500 mx-auto mb-4" />
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-2">Çalışma Raporu</h2>
          
          {difficultLines.length > 0 ? (
            <div className="text-left mt-6 mb-8 space-y-4">
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-2">Zorlandığın Replikler:</p>
              {difficultLines.map(([indexStr, count]) => {
                const idx = parseInt(indexStr);
                return (
                  <div key={idx} className="bg-slate-50 dark:bg-slate-700 p-3 rounded-xl border border-slate-100 dark:border-slate-600">
                    <p className="text-xs text-rose-500 font-bold mb-1">{count} kez ipucu aldın</p>
                    <p className="text-sm font-medium italic text-slate-700 dark:text-slate-200 line-clamp-2">"{script[idx].text}"</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-slate-600 dark:text-slate-300 mt-4 mb-8">Harika bir iş çıkardın! Hiç takılmadan ilerledin.</p>
          )}

          <div className="flex gap-3">
             <button onClick={() => { setIsAnalyticsOpen(false); startPractice(); }} className="flex-1 py-3 rounded-xl font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors">Tekrar Dene</button>
             <button onClick={() => { setIsAnalyticsOpen(false); setIsAutoPlaying(false); setMode('library'); }} className="flex-1 py-3 rounded-xl font-bold bg-indigo-600 text-white transition-colors">Menüye Dön</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`${settings.darkMode ? 'dark' : ''}`}>
      <style>{`
        html, body { overscroll-behavior-y: none; }
        .marquee-container { overflow: hidden; white-space: nowrap; width: 100%; position: relative; }
        .marquee-content { display: inline-block; animation: marquee 8s linear infinite; }
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
      `}</style>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-4 md:p-8 font-sans text-slate-900 dark:text-slate-100 transition-colors">
        
        {renderTutorial()}
        {renderSettings()}
        {renderAnalyticsModal()}

        {projectToDelete && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
             <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl text-center">
                <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4"><Trash2 className="w-8 h-8"/></div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Metni Sil</h3>
                <p className="text-slate-600 dark:text-slate-400 mb-6">Bu metni kalıcı olarak silmek istediğine emin misin? Bu işlem geri alınamaz.</p>
                <div className="flex gap-3">
                   <button onClick={() => setProjectToDelete(null)} className="flex-1 py-3 rounded-xl font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors">İptal</button>
                   <button onClick={() => handleDeleteProject(projectToDelete)} className="flex-1 py-3 rounded-xl font-bold bg-rose-500 hover:bg-rose-600 text-white transition-colors">Evet, Sil</button>
                </div>
             </div>
          </div>
        )}

        {mode === 'splash' && (
          <div className="fixed inset-0 z-50 bg-indigo-600 flex flex-col items-center justify-center text-white">
            <BookOpen className="w-24 h-24 animate-bounce mb-6 text-white" />
            <h1 className="text-5xl font-black tracking-tighter">Sufle</h1>
            <Loader2 className="w-8 h-8 animate-spin mt-10 opacity-70" />
            <div className="absolute bottom-12 flex flex-col items-center opacity-80">
              <span className="text-sm font-black tracking-[0.3em] uppercase bg-white/20 px-3 py-1 rounded-full mb-2">v1.3</span>
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
                 <div className="text-xs font-bold bg-white/20 px-3 py-1 rounded-full">v1.3</div>
               </div>
            </div>

            <div className="space-y-4">
              <button 
                onClick={() => { setMode('input'); setNewProjectTitle(''); setInputText(''); }}
                className="w-full bg-white dark:bg-slate-800 border-2 border-dashed border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all text-indigo-600 dark:text-indigo-400 p-6 rounded-3xl flex flex-col items-center justify-center gap-2 font-bold shadow-sm"
              >
                <Plus className="w-8 h-8" /> Yeni Metin Ekle
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
                                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg marquee-content">{project.title} &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; {project.title}</h3>
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
                        <button onClick={(e) => confirmDelete(e, project.id)} className="p-3 text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 rounded-xl transition-all shrink-0 ml-2"><Trash2 className="w-5 h-5" /></button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {mode !== 'splash' && mode !== 'library' && (
          <div className="max-w-2xl mx-auto bg-white dark:bg-slate-800 rounded-3xl shadow-xl overflow-hidden border border-slate-100 dark:border-slate-700 relative">
            
            {showTenStreakEffect && (
              <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center animate-in fade-in zoom-in duration-500">
                <Flame className="w-64 h-64 text-orange-500 opacity-20 animate-ping absolute" />
                <Flame className="w-32 h-32 text-orange-400 fill-orange-400 animate-bounce relative z-10" />
              </div>
            )}

            <div className="bg-indigo-600 p-6 text-white flex justify-between items-center z-10 relative shadow-md">
              <div className="flex flex-col min-w-0 flex-1 mr-4">
                <h1 className="text-xl font-bold flex items-center gap-2 truncate">
                  <BookOpen className="w-5 h-5 shrink-0"/> {mode !== 'input' ? (activeProject?.title || 'Sufle') : 'Sufle - Yeni Metin'}
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
                    <Flame size={14} className="fill-orange-400" /> <span>{streak} Seri</span>
                  </div>
                )}
                {mode === 'practice' && <button onClick={() => setIsCharModalOpen(true)} className="p-2 hover:bg-white/20 rounded-full transition-colors"><Users className="w-5 h-5" /></button>}
                <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-white/20 rounded-full transition-colors"><Settings className="w-5 h-5" /></button>
                {mode !== 'input' && <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-white/20 rounded-full transition-colors"><List className="w-5 h-5" /></button>}
                <button onClick={() => { setIsAutoPlaying(false); window.speechSynthesis.cancel(); setMode('library'); }} className="p-2 hover:bg-white/20 rounded-full transition-colors"><X className="w-5 h-5" /></button>
              </div>
            </div>

            <div className="p-6">
              {mode === 'input' && (
                <div className="space-y-4 animate-in fade-in duration-500">
                  <input 
                    type="text" placeholder="Metin Başlığı (Örn: Hamlet 1. Perde)" 
                    value={newProjectTitle} onChange={(e) => setNewProjectTitle(e.target.value)}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800 dark:text-slate-100 outline-none"
                  />
                  <div className="text-center p-6 border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-2xl bg-slate-50 dark:bg-slate-800/50 relative overflow-hidden group">
                    <Upload className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
                    <p className="text-slate-600 dark:text-slate-400 mb-3 text-sm">Senaryo dosyasını yükle (.pdf / .docx / .txt)</p>
                    <input type="file" accept=".txt,.docx,.pdf" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    <div className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-medium inline-block group-hover:bg-indigo-700 transition-colors">Dosya Seç</div>
                  </div>
                  <textarea
                    className="w-full h-40 p-4 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm dark:text-slate-200"
                    placeholder="Veya buraya yapıştır...&#10;HAMLET: Olmak ya da olmamak..."
                    value={inputText} onChange={(e) => setInputText(e.target.value)}
                  />
                  <button onClick={() => parseScript(inputText)} disabled={!inputText.trim()} className="w-full bg-slate-900 dark:bg-black text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all disabled:opacity-50"><Play className="w-5 h-5" /> İleri</button>
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
                          <div onClick={() => {
                              const newSelection = isSelected ? selectedCharacters.filter(c => c !== char) : [...selectedCharacters, char];
                              setSelectedCharacters(newSelection);
                              updateProgress({ selectedCharacters: newSelection });
                            }} 
                            className="flex-1 flex items-center gap-4 text-left p-2 cursor-pointer"
                          >
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors shrink-0 ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>{char[0]}</div>
                            <div className="flex-1 min-w-0">
                              <span className={`font-bold block truncate ${isSelected ? 'text-indigo-900 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200'}`}>{char}</span>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-slate-400 dark:text-slate-500">({charCounts[char]} Replik)</span>
                                <button 
                                  onClick={(e) => handleToggleVoice(e, char)}
                                  className="text-[10px] px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                                >
                                  {charVoices[char] === 'M' ? '👨 Erkek Ses' : '👩 Kadın Ses'}
                                </button>
                              </div>
                            </div>
                            {isSelected && <Check className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mr-2 shrink-0" />}
                          </div>
                          <button onClick={() => removeCharacter(char)} className="p-3 text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 rounded-xl transition-all shrink-0"><Trash2 className="w-5 h-5" /></button>
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={startPractice} disabled={selectedCharacters.length === 0} className="w-full bg-indigo-600 text-white py-4 rounded-3xl font-bold text-lg shadow-lg active:scale-95 transition-all disabled:opacity-50">Ezbere Başla</button>
                </div>
              )}

              {mode === 'practice' && script[currentIndex] && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  
                  <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-600 space-y-4">
                    <div className="flex items-center justify-between">
                       <button onClick={() => { window.speechSynthesis.cancel(); setIsAutoPlaying(!isAutoPlaying); }} className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all ${isAutoPlaying ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400' : 'bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300'}`}>
                         {isAutoPlaying ? <FastForward className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                         {isAutoPlaying ? 'Akış Açık' : 'Durduruldu'}
                       </button>
                       <div className="text-xs text-slate-400 dark:text-slate-500 font-mono font-bold">{currentIndex + 1} / {script.length}</div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> Hız</span>
                        <button onClick={() => setShowProgressBar(!showProgressBar)} className="hover:text-indigo-500 transition-colors">{showProgressBar ? 'Çubuğu Gizle' : 'Çubuğu Göster'}</button>
                      </div>
                      <input type="range" min="1" max="5" step="1" value={speedLevel} onChange={(e) => setSpeedLevel(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                    </div>
                  </div>

                  {showProgressBar && (
                    <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mb-2">
                      <div className="h-full bg-indigo-500 ease-linear" style={{ width: `${progress}%`, transitionDuration: progress === 100 ? `${getTotalDelay(currentIndex)}ms` : '0ms' }} />
                    </div>
                  )}

                  <div className="min-h-[280px] flex flex-col gap-4">
                    {selectedCharacters.includes(script[currentIndex].character) && currentIndex > 0 && !isLocked && !isRevealed && (
                      <div className="animate-in slide-in-from-top-2 bg-indigo-50 dark:bg-indigo-900/20 border-l-4 border-indigo-400 p-4 rounded-r-2xl shadow-sm">
                        <p className="text-[10px] font-black text-indigo-400 mb-1 uppercase tracking-widest text-left">Az Önce ({script[currentIndex-1].character})</p>
                        <p className="text-slate-600 dark:text-slate-300 italic text-left text-sm leading-relaxed">"{script[currentIndex-1].text}"</p>
                      </div>
                    )}

                    <div className="flex-1 flex flex-col justify-center items-center text-center px-4 bg-white dark:bg-slate-800 border border-slate-50 dark:border-slate-700 rounded-3xl shadow-inner py-8 transition-all">
                      {/* BÖLÜM (Sahne/Perde) Özel Görünümü */}
                      {script[currentIndex].character === 'BÖLÜM' ? (
                        <div className="space-y-4">
                           <BookOpen className="w-12 h-12 mx-auto text-indigo-300 dark:text-indigo-700" />
                           <h2 className="text-3xl font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">{script[currentIndex].text}</h2>
                        </div>
                      ) : (
                        <>
                          <h3 className={`text-sm font-bold mb-4 tracking-widest uppercase transition-colors ${selectedCharacters.includes(script[currentIndex].character) ? 'text-indigo-600 dark:text-indigo-400 underline' : 'text-slate-400 dark:text-slate-500'}`}>
                            {script[currentIndex].character}
                          </h3>
                          
                          {selectedCharacters.includes(script[currentIndex].character) && !isLocked ? (
                            <div className="space-y-6 w-full">
                              <div className={`${getFontSizeClass()} ${getFontFamilyClass()} italic transition-all duration-700 ${isRevealed ? 'opacity-100 blur-0' : 'opacity-0 blur-xl absolute invisible'}`}>
                                "{formatEmotionText(script[currentIndex].text)}"
                              </div>
                              
                              {!isRevealed && (
                                <div className="space-y-6 animate-in fade-in zoom-in duration-300">
                                  {isHintVisible ? (
                                    <div className="p-4 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-2xl border-2 border-indigo-100 dark:border-indigo-800 border-dashed mx-auto max-w-[250px] shadow-sm italic font-medium">
                                      "{script[currentIndex].text.split(' ').slice(0,3).join(' ')}..."
                                    </div>
                                  ) : (
                                    <div className="flex flex-col items-center gap-2">
                                      <div className="text-indigo-200 dark:text-indigo-800 relative">
                                        <HelpCircle className="w-12 h-12" />
                                        {settings.micEnabled && <Mic className={`w-5 h-5 absolute -bottom-1 -right-1 ${isListening ? 'text-green-500 animate-pulse' : 'text-rose-500'}`}/>}
                                      </div>
                                      <p className="font-black text-xs text-indigo-800 dark:text-indigo-400 tracking-widest uppercase">Sıra Sende</p>
                                    </div>
                                  )}
                                  {!isHintVisible && (
                                    <button onClick={() => { setIsHintVisible(true); setHintUsed(true); setStreak(0); setAnalytics(prev => ({...prev, [currentIndex]: (prev[currentIndex] || 0) + 1})); }} className="flex items-center justify-center gap-2 mx-auto border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold text-sm pb-1 hover:text-indigo-800 dark:hover:text-indigo-300 transition-all">
                                      <Lightbulb className="w-4 h-4" /> İpucu Al
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className={`${getFontSizeClass()} ${getFontFamilyClass()} text-slate-800 dark:text-slate-200 leading-relaxed font-medium animate-in fade-in transition-all duration-500`}>
                              "{formatEmotionText(script[currentIndex].text)}"
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={handlePrevClick} disabled={currentIndex === 0 || (isLocked && isAutoPlaying)} 
                      className="w-16 flex items-center justify-center rounded-3xl bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
                    ><ChevronLeft className="w-7 h-7" /></button>
                    
                    <button
                      onClick={() => {
                        if (currentIndex === script.length - 1 && (isRevealed || isLocked || script[currentIndex].character === 'BÖLÜM')) {
                           window.speechSynthesis.cancel();
                           setIsAutoPlaying(false);
                           setIsAnalyticsOpen(true); // Bitirince rapor modalını aç
                        } else {
                           handleNextClick();
                        }
                      }}
                      disabled={isLocked && isAutoPlaying}
                      className={`flex-1 py-5 rounded-3xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95 min-w-0 ${
                        (isLocked && isAutoPlaying) ? 'bg-slate-100 dark:bg-slate-700 text-slate-300 dark:text-slate-500 shadow-none cursor-not-allowed' :
                        (selectedCharacters.includes(script[currentIndex].character) && !isRevealed && !isLocked ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700')
                      }`}
                    >
                      {currentIndex === script.length - 1 && (isRevealed || isLocked || script[currentIndex].character === 'BÖLÜM') ? 'EZBERİ BİTİR' : 
                       (selectedCharacters.includes(script[currentIndex].character) && !isRevealed && !isLocked ? 'CEVABI GÖR' : 'SONRAKİ REPLİK')}
                    </button>

                    <button
                      onClick={() => { setIsLocked(!isLocked); if (!isLocked) setIsRevealed(true); }}
                      className={`w-16 flex items-center justify-center rounded-3xl transition-all shadow-md shrink-0 ${
                        isLocked ? 'bg-rose-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                      }`}
                    >{isLocked ? <Lock className="w-6 h-6" /> : <Unlock className="w-6 h-6" />}</button>
                  </div>
                </div>
              )}
            </div>

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
                           
                           {/* Modaldaki Erkek/Kadın Ses Butonu */}
                           <button 
                              onClick={(e) => handleToggleVoice(e, char)}
                              className="text-[10px] px-2 py-2 mr-2 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors shrink-0 font-bold border border-slate-200 dark:border-slate-600"
                           >
                              {charVoices[char] === 'M' ? '👨 Erkek Ses' : '👩 Kadın Ses'}
                           </button>

                           <button onClick={() => removeCharacter(char)} className="p-3 text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 rounded-xl transition-all shrink-0"><Trash2 className="w-5 h-5" /></button>
                         </div>
                       )
                    })}
                 </div>
                 <button onClick={() => setIsCharModalOpen(false)} className="w-full py-4 bg-slate-900 dark:bg-slate-700 text-white font-bold rounded-2xl text-lg mt-2">Kaydet ve Dön</button>
              </div>
            )}

          </div>
        )}

        {isSidebarOpen && <div className="fixed inset-0 bg-slate-900/50 z-40 backdrop-blur-sm transition-opacity" onClick={() => setIsSidebarOpen(false)} />}
        <div className={`fixed top-0 right-0 w-80 h-full bg-slate-50 dark:bg-slate-900 shadow-2xl z-50 transform transition-transform duration-300 flex flex-col ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-4 bg-indigo-600 text-white flex justify-between items-center shadow-md">
            <div className="font-bold flex items-center gap-2"><List className="w-5 h-5" /> Sahne Akışı</div>
            <button onClick={() => setIsSidebarOpen(false)} className="p-1 hover:bg-white/20 rounded-full transition-colors"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {script.map((line, idx) => {
              if (line.character === 'BÖLÜM') {
                return (
                  <div key={idx} ref={idx === currentIndex ? activeLineRef : null} className="w-full text-center py-2 mt-4 mb-2 opacity-60">
                    <span className="text-xs font-black tracking-widest text-indigo-600 dark:text-indigo-400 uppercase">{line.text}</span>
                  </div>
                )
              }

              const isMyRole = selectedCharacters.includes(line.character);
              const isCurrent = idx === currentIndex;
              return (
                <button 
                  key={idx} ref={isCurrent ? activeLineRef : null} 
                  onClick={() => { window.speechSynthesis.cancel(); setCurrentIndex(idx); setIsRevealed(false); setIsHintVisible(false); setHintUsed(false); setIsSidebarOpen(false); updateProgress({ currentIndex: idx }); }}
                  className={`w-full text-left p-3 rounded-2xl border transition-all ${isCurrent ? 'border-indigo-500 bg-indigo-100 dark:bg-indigo-900/30 shadow-sm' : isMyRole ? 'border-indigo-100 dark:border-indigo-800/50 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className={`text-[10px] font-bold uppercase ${isCurrent ? 'text-indigo-700 dark:text-indigo-400' : isMyRole ? 'text-indigo-500' : 'text-slate-400 dark:text-slate-500'}`}>
                      {idx + 1}. {line.character} <span className="font-normal lowercase">({charOccurrences[idx]}/{charCounts[line.character]})</span>
                    </span>
                    {isMyRole && <Check className="w-3 h-3 text-indigo-500" />}
                  </div>
                  <div className={`text-xs truncate ${isCurrent ? 'text-indigo-900 dark:text-indigo-200 font-bold' : 'text-slate-600 dark:text-slate-400'}`}>"{line.text.replace(/\[.*?\]|\(.*?\)/g, '')}"</div>
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