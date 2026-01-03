import React, { useEffect, useState, useRef } from 'react';
import { Paper, PaperMetadata, Note, ViewState, AppSettings, NotificationItem } from './types';
import { savePaper, getAllPapersMetadata, getPaperById, getNotesByPaperId, deletePaper, updatePaperTitle, saveNote, updatePaperSummary, writeBackupToHandle, getBackupHandle, saveBackupHandle } from './lib/db';
import { suggestTagsAI, organizeSummaryAI, reorganizeNoteAI } from './lib/ai';
import Dashboard from './components/Dashboard';
import Reader from './components/Reader';
import KnowledgeGraph from './components/KnowledgeGraph';
import SettingsModal from './components/SettingsModal';
import ResultModal from './components/ResultModal';
import { Loader2, Share2, Settings, Bell, HardDrive } from 'lucide-react';

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
  
  // Settings & Notifications
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('appSettings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });
  const [showSettings, setShowSettings] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [finishedNotification, setFinishedNotification] = useState<NotificationItem | null>(null);
  const [resultModalData, setResultModalData] = useState<{ title: string, data: any } | null>(null);

  // Auto Backup State
  const [backupHandle, setBackupHandle] = useState<any>(null);
  const [lastBackupTime, setLastBackupTime] = useState<Date | null>(null);
  const [backupPermissionNeeded, setBackupPermissionNeeded] = useState(false);
  const backupIntervalRef = useRef<number | null>(null);

  useEffect(() => { loadLibrary(); initBackup(); }, []);

  // Initialize Backup: Check DB for existing handle
  const initBackup = async () => {
    try {
      const handle = await getBackupHandle();
      if (handle) {
        // We have a handle, but permission might need verification on reload
        const perm = await handle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          setBackupHandle(handle);
        } else {
          // Store locally to prompt user later
          setBackupHandle(handle);
          setBackupPermissionNeeded(true);
          setNotifications(prev => [...prev, {
            id: crypto.randomUUID(),
            title: "Backup Paused",
            message: "Click here to resume auto-backup to your file.",
            type: 'info',
            action: 'APPLY_TAGS' // Reusing action type as a trigger for generic click
          }]);
        }
      }
    } catch (e) {
      console.error("Failed to init backup", e);
    }
  };

  // Auto Backup Interval Logic
  useEffect(() => {
    if (backupHandle && !backupPermissionNeeded) {
      // Clear existing
      if (backupIntervalRef.current) window.clearInterval(backupIntervalRef.current);
      
      // Perform immediate backup
      performBackup();

      // Set interval (every 60 seconds)
      backupIntervalRef.current = window.setInterval(performBackup, 60000);
    } else {
      if (backupIntervalRef.current) window.clearInterval(backupIntervalRef.current);
    }

    return () => {
      if (backupIntervalRef.current) window.clearInterval(backupIntervalRef.current);
    };
  }, [backupHandle, backupPermissionNeeded]);

  const performBackup = async () => {
    if (!backupHandle) return;
    try {
      await writeBackupToHandle(backupHandle);
      setLastBackupTime(new Date());
    } catch (e) {
      console.error("Auto Backup Failed", e);
      // Check if it's a permission issue
      const perm = await backupHandle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        setBackupPermissionNeeded(true);
        setNotifications(prev => [...prev, {
          id: crypto.randomUUID(), 
          title: "Backup Stopped", 
          message: "Permission required. Click to resume.", 
          type: 'error'
        }]);
      }
    }
  };

  const resumeBackup = async () => {
    if (backupHandle && backupPermissionNeeded) {
      const perm = await backupHandle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        setBackupPermissionNeeded(false);
        setFinishedNotification({
           id: crypto.randomUUID(),
           title: "Backup Resumed",
           message: "Auto-backup is active again.",
           type: 'success'
        });
      }
    }
  };

  const handleConfigureBackup = async () => {
    if (!('showSaveFilePicker' in window)) {
      alert("Your browser does not support the File System Access API. Please use Chrome, Edge, or Opera.");
      return;
    }
    try {
      // @ts-ignore
      const handle = await window.showSaveFilePicker({
        suggestedName: `scholarnote_backup.zip`,
        types: [{
          description: 'ScholarNote Backup',
          accept: { 'application/zip': ['.zip'] },
        }],
      });
      
      // Save to DB for persistence
      await saveBackupHandle(handle);
      
      setBackupHandle(handle);
      setBackupPermissionNeeded(false);
      
      setNotifications(prev => [...prev, {
        id: crypto.randomUUID(),
        title: "Auto-Backup Configured",
        message: "Your library will sync to this file automatically.",
        type: 'success'
      }]);
    } catch (err) {
      console.warn("Backup setup cancelled", err);
    }
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
      
      // Calculate ALL known tags from papers AND notes
      const tags = new Set<string>();
      data.forEach(p => p.tags.forEach(t => tags.add(t)));
      allNotesList.forEach(n => n.tags?.forEach(t => tags.add(t)));
      setAllTags(Array.from(tags));
      
    } catch (err) { console.error(err); } 
    finally { setLoading(false); }
  };

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem('appSettings', JSON.stringify(newSettings));
  };

  const handleSaveNote = async (note: Note) => {
    await saveNote(note);
    // Update local state
    setCurrentNotes(prev => {
      const exists = prev.find(n => n.id === note.id);
      if (exists) return prev.map(n => n.id === note.id ? note : n);
      return [...prev, note];
    });
    // Update graph data
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

  const handleAIRequest = async (task: string, payload: any) => {
    // 1. Add processing notification
    const notifId = crypto.randomUUID();
    setNotifications(prev => [...prev, { id: notifId, title: 'AI Working...', message: 'Processing your request in background', type: 'info' }]);
    
    // 2. Run AI (Non-blocking)
    try {
      let result;
      let title = "AI Task Complete";
      let message = "Click to see results.";
      let autoAction = false;
      
      if (task === 'SUGGEST_TAGS') {
        const { noteId, text, currentTags, globalTags } = payload;
        const tags = await suggestTagsAI(text, globalTags, currentTags, settings);
        
        // Auto-add tags logic
        if (tags.length > 0) {
          const targetNote = currentNotes.find(n => n.id === noteId);
          if (targetNote) {
            const updatedTags = Array.from(new Set([...(targetNote.tags || []), ...tags]));
            const updatedNote = { ...targetNote, tags: updatedTags };
            await handleSaveNote(updatedNote);
            
            // Update Global Tags Set
            setAllTags(prev => Array.from(new Set([...prev, ...tags])));

            title = "Tags Added";
            message = `Added ${tags.length} tags: ${tags.join(', ')}`;
            autoAction = true;
          }
        } else {
          title = "No Tags Found";
          message = "AI couldn't find relevant tags.";
          autoAction = true;
        }

        result = { tags, noteId };

      } else if (task === 'ORGANIZE_SUMMARY') {
        const summary = await organizeSummaryAI(payload.text, settings);
        
        // Auto-apply summary
        if (currentPaper) {
          await handleUpdateSummary(summary);
          title = "Summary Updated";
          message = "The summary has been reorganized and saved.";
          autoAction = true;
        }

        result = { summary };

      } else if (task === 'REORGANIZE_NOTE') {
        const reorganizedNote = await reorganizeNoteAI(payload.text, settings);
        
        // Auto-apply note comment
        const targetNote = currentNotes.find(n => n.id === payload.noteId);
        if (targetNote) {
           const updatedNote = { ...targetNote, comment: reorganizedNote };
           await handleSaveNote(updatedNote);
           title = "Note Refined";
           message = "Your note has been improved and saved.";
           autoAction = true;
        }

        result = { reorganizedNote };
      }

      // 3. Update notification to Success
      const successNotif: NotificationItem = { 
        id: notifId, 
        title, 
        message, 
        type: 'success', 
        data: result,
        action: autoAction ? undefined : 'VIEW_RESULT' 
      };
      
      setNotifications(prev => prev.filter(n => n.id !== notifId));
      setFinishedNotification(successNotif); // Show popup
      
      // Auto-hide popup after 5s
      setTimeout(() => {
        setFinishedNotification(prev => prev?.id === successNotif.id ? null : prev);
      }, 5000);

    } catch (error) {
       console.error("AI Request Failed", error);
       setNotifications(prev => prev.filter(n => n.id !== notifId));
       setFinishedNotification({ id: crypto.randomUUID(), title: 'AI Error', message: 'Failed to process request', type: 'error' });
    }
  };

  const handleNotificationClick = () => {
    if (finishedNotification?.action === 'VIEW_RESULT' && finishedNotification?.data) {
       setResultModalData({
         title: finishedNotification.title,
         data: finishedNotification.data
       });
       setFinishedNotification(null);
    } else {
       setFinishedNotification(null);
    }
  };

  // Handle generic click for resumption notifications
  const handlePendingNotificationClick = (notif: NotificationItem) => {
    if (notif.title.includes("Backup") && backupPermissionNeeded) {
      resumeBackup();
      setNotifications(prev => prev.filter(n => n.id !== notif.id));
    }
  };

  const handleUpload = async (file: File) => {
    setIsUploading(true);
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
    } catch (e) { alert("Upload failed"); } 
    finally { setIsUploading(false); }
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

  const handleDeletePaper = async (id: string) => {
    if (!confirm("Delete paper and notes?")) return;
    await deletePaper(id);
    await loadLibrary();
    if (currentPaper?.id === id) setView(ViewState.LIBRARY);
  };

  const handleRenamePaper = async (id: string, newTitle: string) => {
    await updatePaperTitle(id, newTitle);
    setPapers(prev => prev.map(p => p.id === id ? { ...p, title: newTitle } : p));
  };

  const handleUpdateTags = (newTags: string[]) => {
    if (currentPaper) {
      setCurrentPaper({ ...currentPaper, tags: newTags });
      setPapers(prev => prev.map(p => p.id === currentPaper.id ? { ...p, tags: newTags } : p));
    }
  };

  if (loading && view === ViewState.LIBRARY) {
    return <div className="h-screen w-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-indigo-600" size={48} /></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* View Router */}
      {view === ViewState.LIBRARY && (
        <>
          <Dashboard 
            papers={papers} 
            onUpload={handleUpload} 
            onSelectPaper={handleSelectPaper} 
            onDeletePaper={handleDeletePaper} 
            onRenamePaper={handleRenamePaper} 
            onImportSuccess={loadLibrary}
            autoBackupStatus={{ active: !!backupHandle && !backupPermissionNeeded, lastBackup: lastBackupTime }}
            isUploading={isUploading} 
          />
          
          <div className="fixed bottom-8 right-8 flex flex-col gap-4 z-50">
             <button onClick={() => setShowSettings(true)} className="bg-white text-slate-700 p-4 rounded-full shadow-xl border border-slate-200 hover:bg-slate-50 transition-all">
              <Settings size={24} />
            </button>
            <button onClick={() => setView(ViewState.GRAPH)} className="bg-slate-900 text-white p-4 rounded-full shadow-2xl hover:bg-slate-800 transition-all flex items-center gap-2 group">
              <Share2 size={24} />
              <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 font-bold uppercase text-xs">Graph</span>
            </button>
          </div>
        </>
      )}

      {view === ViewState.READER && currentPaper && (
        <Reader 
          paper={currentPaper} 
          initialNotes={currentNotes} 
          allGlobalTags={allTags} 
          allNotes={allNotesForGraph} 
          settings={settings}
          onClose={() => { setView(ViewState.LIBRARY); loadLibrary(); }} 
          onUpdateTags={handleUpdateTags} 
          onUpdateSummary={handleUpdateSummary}
          onRequestAI={handleAIRequest}
          onSaveNote={handleSaveNote}
        />
      )}

      {view === ViewState.GRAPH && (
        <KnowledgeGraph papers={papers} allNotes={allNotesForGraph} onBack={() => setView(ViewState.LIBRARY)} onOpenPaper={handleSelectPaper} />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal 
          settings={settings} 
          onSave={handleSaveSettings} 
          onClose={() => setShowSettings(false)} 
          onConfigureBackup={handleConfigureBackup}
          backupStatus={{
             active: !!backupHandle && !backupPermissionNeeded,
             lastBackup: lastBackupTime,
             fileName: backupHandle?.name
          }}
        />
      )}

      {/* Result Modal */}
      {resultModalData && (
        <ResultModal 
          title={resultModalData.title} 
          data={resultModalData.data} 
          onClose={() => setResultModalData(null)} 
        />
      )}

      {/* Notification Toast */}
      {finishedNotification && (
        <div 
          onClick={handleNotificationClick}
          className="fixed bottom-8 left-8 bg-white border border-slate-200 p-4 rounded-2xl shadow-2xl z-[200] flex items-center gap-4 cursor-pointer hover:scale-105 transition-transform animate-in slide-in-from-bottom-5"
        >
           <div className={`p-2 rounded-full ${finishedNotification.type === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
             <Bell size={20} />
           </div>
           <div>
             <h4 className="font-bold text-sm text-slate-900">{finishedNotification.title}</h4>
             <p className="text-xs text-slate-500">{finishedNotification.message}</p>
           </div>
        </div>
      )}
      
      {/* Pending Notifications List */}
      <div className="fixed bottom-8 left-8 z-[200] flex flex-col gap-2">
        {notifications.map(n => (
          <div 
            key={n.id}
            onClick={() => handlePendingNotificationClick(n)}
            className={`bg-slate-900 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 ${n.action ? 'cursor-pointer hover:bg-slate-800' : ''}`}
          >
            {n.type === 'info' && <Loader2 className="animate-spin text-indigo-400" size={20} />}
            {n.type === 'error' && <HardDrive className="text-red-400" size={20} />}
            <div>
              <p className="text-xs font-bold">{n.title}</p>
              <p className="text-[10px] text-slate-300">{n.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;