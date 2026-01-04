import React, { useEffect, useState, useRef } from 'react';
import { Paper, PaperMetadata, Note, ViewState, AppSettings, NotificationItem } from './types';
import { savePaper, getAllPapersMetadata, getPaperById, getNotesByPaperId, deletePaper, updatePaperTitle, saveNote, updatePaperSummary, updatePaperAISummary, writeBackupToHandle, getBackupHandle, saveBackupHandle, updatePaperTags, deleteNote } from './lib/db';
import { suggestTagsAI, organizeSummaryAI, reorganizeNoteAI, analyzePaperSummary, analyzePaperHighlights } from './lib/ai';
import Dashboard from './components/Dashboard';
import Reader from './components/Reader';
import KnowledgeGraph from './components/KnowledgeGraph';
import SettingsModal from './components/SettingsModal';
import ResultModal from './components/ResultModal';
import { Loader2, Share2, Settings, Bell, HardDrive, BrainCircuit, Sparkles } from 'lucide-react';

const DEFAULT_SETTINGS: AppSettings = {
  highlightColor: 'yellow'
};

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>(ViewState.LIBRARY);
  const [papers, setPapers] = useState<PaperMetadata[]>([]);
  const [currentPaper, setCurrentPaper] = useState<Paper | null>(null);
  const [currentNotes, setCurrentNotes] = useState<Note[]>([]);
  const [allNotesForGraph, setAllNotesForGraph] = useState<Note[]>([]); 
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string>("");

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('appSettings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });
  const [showSettings, setShowSettings] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [finishedNotification, setFinishedNotification] = useState<NotificationItem | null>(null);
  const [resultModalData, setResultModalData] = useState<{ title: string, data: any } | null>(null);

  const [backupHandle, setBackupHandle] = useState<any>(null);
  const [lastBackupTime, setLastBackupTime] = useState<Date | null>(null);
  const [backupPermissionNeeded, setBackupPermissionNeeded] = useState(false);
  const backupIntervalRef = useRef<number | null>(null);

  useEffect(() => { loadLibrary(); initBackup(); }, []);

  const initBackup = async () => {
    try {
      const handle = await getBackupHandle();
      if (handle) {
        const perm = await handle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') setBackupHandle(handle);
        else {
          setBackupHandle(handle);
          setBackupPermissionNeeded(true);
        }
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (backupHandle && !backupPermissionNeeded) {
      if (backupIntervalRef.current) window.clearInterval(backupIntervalRef.current);
      performBackup();
      backupIntervalRef.current = window.setInterval(performBackup, 60000);
    }
    return () => { if (backupIntervalRef.current) window.clearInterval(backupIntervalRef.current); };
  }, [backupHandle, backupPermissionNeeded]);

  const performBackup = async () => {
    if (!backupHandle) return;
    try {
      await writeBackupToHandle(backupHandle);
      setLastBackupTime(new Date());
    } catch (e) { console.error(e); }
  };

  const handleConfigureBackup = async () => {
    if (!('showSaveFilePicker' in window)) {
      alert("Browser not supported for direct file access.");
      return;
    }
    try {
      // @ts-ignore
      const handle = await window.showSaveFilePicker({
        suggestedName: `scholarnote_backup.zip`,
        types: [{ description: 'ScholarNote Backup', accept: { 'application/zip': ['.zip'] } }],
      });
      await saveBackupHandle(handle);
      setBackupHandle(handle);
      setBackupPermissionNeeded(false);
    } catch (err) { console.warn(err); }
  };

  const loadLibrary = async () => {
    try {
      const data = await getAllPapersMetadata();
      setPapers(data.sort((a, b) => b.uploadedAt - a.uploadedAt));
      const allNotesList: Note[] = [];
      for (const p of data) {
         const pNotes = await getNotesByPaperId(p.id);
         allNotesList.push(...pNotes);
      }
      setAllNotesForGraph(allNotesList);
      const tags = new Set<string>();
      data.forEach(p => p.tags.forEach(t => tags.add(t)));
      allNotesList.forEach(n => n.tags?.forEach(t => tags.add(t)));
      setAllTags(Array.from(tags));
    } catch (err) { console.error(err); } 
    finally { setLoading(false); }
  };

  const handleSaveNote = async (note: Note) => {
    await saveNote(note);
    setCurrentNotes(prev => {
      const exists = prev.find(n => n.id === note.id);
      if (exists) return prev.map(n => n.id === note.id ? note : n);
      return [...prev, note];
    });
    setAllNotesForGraph(prev => {
      const exists = prev.find(n => n.id === note.id);
      if (exists) return prev.map(n => n.id === note.id ? note : n);
      return [...prev, note];
    });
  };

  const handleUpdateSummary = async (newSummary: string) => {
    if (currentPaper) {
      await updatePaperSummary(currentPaper.id, newSummary);
      setCurrentPaper({ ...currentPaper, summary: newSummary });
    }
  };

  const handleUpdateAISummary = async (newSummary: string) => {
    if (currentPaper) {
      await updatePaperAISummary(currentPaper.id, newSummary);
      setCurrentPaper({ ...currentPaper, aiSummary: newSummary });
    }
  };

  const handleAIRequest = async (task: string, payload: any) => {
    const notifId = crypto.randomUUID();
    setNotifications(prev => [...prev, { id: notifId, title: 'AI Working...', message: 'Background task in progress', type: 'info' }]);
    try {
      let result;
      let title = "Task Complete";
      if (task === 'SUGGEST_TAGS') {
        const tags = await suggestTagsAI(payload.text, payload.globalTags, payload.currentTags, settings);
        if (tags.length > 0) {
          const targetNote = currentNotes.find(n => n.id === payload.noteId);
          if (targetNote) {
            const updatedNote = { ...targetNote, tags: Array.from(new Set([...(targetNote.tags || []), ...tags])) };
            await handleSaveNote(updatedNote);
          }
        }
        result = { tags };
      } else if (task === 'ORGANIZE_SUMMARY') {
        const summary = await organizeSummaryAI(payload.text, settings);
        await handleUpdateSummary(summary);
      } else if (task === 'REORGANIZE_NOTE') {
        const refined = await reorganizeNoteAI(payload.text, settings);
        const targetNote = currentNotes.find(n => n.id === payload.noteId);
        if (targetNote) await handleSaveNote({ ...targetNote, comment: refined });
      }
      setNotifications(prev => prev.filter(n => n.id !== notifId));
      setFinishedNotification({ id: crypto.randomUUID(), title, message: "Changes applied.", type: 'success' });
    } catch (e) {
      setNotifications(prev => prev.filter(n => n.id !== notifId));
      setFinishedNotification({ id: crypto.randomUUID(), title: 'Error', message: "AI failed.", type: 'error' });
    }
  };

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    setIsAnalyzing(true);
    setAnalysisStatus("Uploading paper and initializing Scholar AI...");
    try {
      const arrayBuffer = await file.arrayBuffer();
      const newPaper: Paper = {
        id: crypto.randomUUID(),
        title: file.name.replace('.pdf', ''),
        fileName: file.name,
        fileData: arrayBuffer,
        tags: [],
        uploadedAt: Date.now(),
        lastReadAt: Date.now()
      };
      await savePaper(newPaper);
      await loadLibrary();
      
      setIsUploading(false);

      // Phase 1: Summary
      setAnalysisStatus("Phase 1 of 2: Generating Deep Executive Summary...");
      const aiSummary = await analyzePaperSummary(arrayBuffer, settings);
      if (aiSummary) await updatePaperAISummary(newPaper.id, aiSummary);

      // Phase 2: Ranked Highlights
      setAnalysisStatus("Phase 2 of 2: Identifying Sectional Anchor Points...");
      const highlights = await analyzePaperHighlights(arrayBuffer, allTags, settings);
      
      if (highlights && Array.isArray(highlights)) {
         setAnalysisStatus(`Anchoring ${highlights.length} technical insights across sections...`);
         for (const hl of highlights) {
            const importance = (hl.importance || 'Standard').trim();
            const importanceLower = importance.toLowerCase();
            let color: 'red' | 'blue' | 'yellow' = 'yellow';
            
            if (importanceLower.includes('crit')) color = 'red';
            else if (importanceLower.includes('high')) color = 'blue';

            // Strict Tag Sanitization to prevent AI hallucinations
            let topicTag = hl.topic ? hl.topic.trim() : "Insight";
            // Remove any trailing periods or non-alphanumeric chars
            topicTag = topicTag.replace(/[.,;:]$/, '');
            
            // Hard limit: If tag is too long (hallucinated sentence), fallback to generic
            if (topicTag.length > 25 || topicTag.split(' ').length > 4) {
               topicTag = "Key Insight";
            }
            
            const tags = [topicTag, 'AI-Highlight'];

            const newNote: Note = {
              id: crypto.randomUUID(),
              paperId: newPaper.id,
              pageNumber: hl.pageNumber || 1,
              // Storing as snippet pattern for the Reader's regex matcher
              quote: `${hl.anchorStart} ... ${hl.anchorEnd}`, 
              comment: hl.explanation || "Insight identified by AI.",
              tags: tags,
              highlightAreas: [],
              createdAt: Date.now(),
              color: color,
              importance: importance
            };
            await saveNote(newNote);
         }
      }
      
      setAnalysisStatus("Analysis complete! Opening reader...");
      await handleSelectPaper(newPaper.id);

    } catch (e) { 
      console.error(e);
      alert("Scholar AI encountered a processing limit. Opening standard reader view.");
      const meta = (await getAllPapersMetadata()).find(p => p.fileName === file.name);
      if (meta) await handleSelectPaper(meta.id);
    } finally { 
      setIsAnalyzing(false);
      setIsUploading(false);
    }
  };

  const handleSelectPaper = async (id: string) => {
    setLoading(true);
    try {
      const paper = await getPaperById(id);
      if (paper) {
        const notes = await getNotesByPaperId(id);
        setCurrentPaper(paper);
        setCurrentNotes(notes);
        setView(ViewState.READER);
      }
    } catch (e) { console.error(e); } 
    finally { setLoading(false); }
  };

  if (isAnalyzing) {
    return (
      <div className="fixed inset-0 bg-slate-950 z-[300] flex flex-col items-center justify-center text-white px-6">
        <div className="bg-slate-900 border border-slate-800 p-10 rounded-3xl shadow-2xl flex flex-col items-center max-w-lg w-full text-center">
           <div className="w-24 h-24 bg-indigo-500/10 rounded-full flex items-center justify-center mb-8 relative">
              <BrainCircuit className="text-indigo-400 animate-pulse" size={48} />
              <Sparkles className="absolute top-0 right-0 text-amber-400 animate-bounce" size={24} />
              <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full border-t-indigo-400 animate-spin"></div>
           </div>
           <h2 className="text-2xl font-black mb-3 tracking-tight">Deep Reading Analysis</h2>
           <p className="text-slate-400 text-sm leading-relaxed mb-8 h-10">{analysisStatus}</p>
           
           <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden shadow-inner">
             <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 animate-progress origin-left"></div>
           </div>
           
           <div className="grid grid-cols-3 gap-2 w-full mt-10 opacity-50">
             <div className="h-1 bg-slate-700 rounded"></div>
             <div className="h-1 bg-slate-700 rounded"></div>
             <div className="h-1 bg-slate-700 rounded"></div>
           </div>
           <p className="text-[10px] text-slate-500 mt-6 uppercase font-bold tracking-widest">Model: Gemini 3 Flash</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {view === ViewState.LIBRARY && (
        <>
          <Dashboard 
            papers={papers} 
            globalTags={allTags}
            onUpload={handleUpload} onSelectPaper={handleSelectPaper} 
            onDeletePaper={deletePaper} onRenamePaper={updatePaperTitle} onUpdateTags={updatePaperTags}
            onImportSuccess={loadLibrary} autoBackupStatus={{ active: !!backupHandle && !backupPermissionNeeded, lastBackup: lastBackupTime }}
            isUploading={isUploading} 
          />
          <div className="fixed bottom-8 right-8 flex flex-col gap-4 z-50">
            <button onClick={() => setShowSettings(true)} className="bg-white p-4 rounded-full shadow-xl border border-slate-200 hover:bg-slate-50 transition-all"><Settings size={24} /></button>
            <button onClick={() => setView(ViewState.GRAPH)} className="bg-slate-900 text-white p-4 rounded-full shadow-2xl hover:bg-slate-800 transition-all flex items-center gap-2 group">
              <Share2 size={24} /><span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 font-bold uppercase text-xs">Graph</span>
            </button>
          </div>
        </>
      )}

      {view === ViewState.READER && currentPaper && (
        <Reader 
          paper={currentPaper} initialNotes={currentNotes} allGlobalTags={allTags} allNotes={allNotesForGraph} settings={settings}
          onClose={() => { setView(ViewState.LIBRARY); loadLibrary(); }} onUpdateTags={(t) => updatePaperTags(currentPaper.id, t)} 
          onUpdateSummary={handleUpdateSummary} onUpdateAISummary={handleUpdateAISummary} onRequestAI={handleAIRequest} onSaveNote={handleSaveNote} onDeleteNote={deleteNote}
        />
      )}

      {view === ViewState.GRAPH && <KnowledgeGraph papers={papers} allNotes={allNotesForGraph} onBack={() => setView(ViewState.LIBRARY)} onOpenPaper={handleSelectPaper} />}

      {showSettings && <SettingsModal settings={settings} onSave={(s) => { setSettings(s); localStorage.setItem('appSettings', JSON.stringify(s)); }} onClose={() => setShowSettings(false)} onConfigureBackup={handleConfigureBackup} backupStatus={{ active: !!backupHandle && !backupPermissionNeeded, lastBackup: lastBackupTime, fileName: backupHandle?.name }} />}
    </div>
  );
};

export default App;