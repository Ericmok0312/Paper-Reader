import React, { useEffect, useState } from 'react';
import { Paper, PaperMetadata, Note, ViewState, AppSettings, NotificationItem } from './types';
import { savePaper, getAllPapersMetadata, getPaperById, getNotesByPaperId, deletePaper, updatePaperTitle, saveNote, updatePaperSummary } from './lib/db';
import { suggestTagsAI, organizeSummaryAI, reorganizeNoteAI } from './lib/ai';
import Dashboard from './components/Dashboard';
import Reader from './components/Reader';
import KnowledgeGraph from './components/KnowledgeGraph';
import SettingsModal from './components/SettingsModal';
import ResultModal from './components/ResultModal';
import { Loader2, Share2, Settings, Bell } from 'lucide-react';

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

  useEffect(() => { loadLibrary(); }, []);

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
      {showSettings && <SettingsModal settings={settings} onSave={handleSaveSettings} onClose={() => setShowSettings(false)} />}

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
      
      {/* Pending Notifications (Optional: Stack multiple if needed, currently showing one) */}
      {notifications.length > 0 && !finishedNotification && (
         <div className="fixed bottom-8 left-8 bg-slate-900 text-white p-4 rounded-2xl shadow-2xl z-[200] flex items-center gap-3 animate-in slide-in-from-bottom-5">
           <Loader2 className="animate-spin text-indigo-400" size={20} />
           <span className="text-xs font-bold">AI Processing...</span>
         </div>
      )}
    </div>
  );
};

export default App;