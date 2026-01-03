import React, { useState, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Paper, Note, HighlightArea, AppSettings } from '../types';
import { ChevronLeft, ZoomIn, ZoomOut, Plus, Highlighter, FileText, Settings as SettingsIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { updatePaperTags } from '../lib/db';
import NoteWindow from './NoteWindow';
import SummaryPanel from './SummaryPanel';

// Cast version to string to avoid "unknown" type error in strict mode
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version as string}/build/pdf.worker.min.mjs`;

interface ReaderProps {
  paper: Paper;
  initialNotes: Note[];
  allGlobalTags: string[];
  allNotes: Note[];
  settings: AppSettings;
  onClose: () => void;
  onUpdateTags: (tags: string[]) => void;
  onUpdateSummary: (summary: string) => void;
  onRequestAI: (task: string, payload: any) => void;
  onSaveNote: (note: Note) => void;
  onDeleteNote: (id: string) => void;
}

const Reader: React.FC<ReaderProps> = ({ paper, initialNotes, allGlobalTags, allNotes, settings, onClose, onUpdateTags, onUpdateSummary, onRequestAI, onSaveNote, onDeleteNote }) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(1.2);
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [showSummary, setShowSummary] = useState(false);
  const [selection, setSelection] = useState<{ text: string; rect: DOMRect; pageNumber: number; highlightAreas: HighlightArea[] } | null>(null);
  const [openNoteIds, setOpenNoteIds] = useState<Set<string>>(new Set());
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [tagInput, setTagInput] = useState('');

  // Sync props notes to state to handle external updates (e.g. AI auto-tagging, auto-reorg)
  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);

  // Use explicit type to avoid any/unknown issues
  const onDocumentLoadSuccess = (document: { numPages: number }) => setNumPages(document.numPages);

  const handleSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setSelection(null);
      return;
    }
    if ((sel.anchorNode as HTMLElement)?.closest?.('.note-window-ignore')) return;

    const range = sel.getRangeAt(0);
    const pageElement = sel.anchorNode?.parentElement?.closest('.react-pdf__Page') as HTMLElement;
    if (!pageElement) return;

    const text = sel.toString().trim();
    if (text.length > 0) {
      const pageNumber = parseInt(pageElement.getAttribute('data-page-number') || '1', 10);
      const pageRect = pageElement.getBoundingClientRect();
      const rect = range.getBoundingClientRect();
      
      const clientRects = Array.from(range.getClientRects());
      const highlightAreas: HighlightArea[] = clientRects.map(r => ({
        x: (r.left - pageRect.left) / pageRect.width * 100,
        y: (r.top - pageRect.top) / pageRect.height * 100,
        width: r.width / pageRect.width * 100,
        height: r.height / pageRect.height * 100
      }));

      setSelection({ text, rect, pageNumber, highlightAreas });
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleSelection);
    return () => document.removeEventListener('mouseup', handleSelection);
  }, [handleSelection]);

  const handleCreateNote = () => {
    if (!selection) return;
    const note: Note = {
      id: crypto.randomUUID(),
      paperId: paper.id,
      pageNumber: selection.pageNumber,
      quote: selection.text,
      comment: '',
      tags: [],
      createdAt: Date.now(),
      color: settings.highlightColor,
      highlightAreas: selection.highlightAreas
    };
    
    // Save immediately so App knows about it (crucial for AI features)
    // Optimistic update local state for instant feedback
    setNotes(prev => [...prev, note]);
    onSaveNote(note);
    
    setOpenNoteIds(prev => new Set(prev).add(note.id));
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleNoteSave = (updatedNote: Note) => {
    onSaveNote(updatedNote);
    // NoteWindow will close itself if we want, or we can manage close here.
    // Usually NoteWindow logic handles onClose.
  };

  const handleDeleteLocalNote = (id: string) => {
    onDeleteNote(id);
    setNotes(prev => prev.filter(n => n.id !== id));
    setOpenNoteIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleNoteWindow = (id: string) => {
    setOpenNoteIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getHighlightColor = () => {
    switch (settings.highlightColor) {
      case 'green': return 'bg-emerald-400/30 hover:bg-emerald-400/50 ring-emerald-500/20';
      case 'blue': return 'bg-sky-400/30 hover:bg-sky-400/50 ring-sky-500/20';
      case 'red': return 'bg-rose-400/30 hover:bg-rose-400/50 ring-rose-500/20';
      default: return 'bg-yellow-400/30 hover:bg-yellow-400/50 ring-yellow-500/20'; // Yellow
    }
  };

  const handleAddPaperTag = async () => {
    if (!tagInput.trim()) return;
    const newTags = [...paper.tags, tagInput.trim()];
    await updatePaperTags(paper.id, newTags);
    onUpdateTags(newTags);
    setTagInput('');
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Top Bar */}
      <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm shrink-0 z-20">
        <div className="flex items-center gap-6">
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors">
            <ChevronLeft size={22} />
          </button>
          <div className="max-w-xl">
            <h1 className="text-sm font-bold text-slate-900 truncate tracking-tight">{paper.title}</h1>
            <div className="flex items-center gap-3 text-[10px] mt-0.5">
              <div className="flex gap-1.5 flex-wrap">
                {paper.tags.map(tag => (
                  <span key={tag} className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-bold uppercase tracking-widest">{tag}</span>
                ))}
                <button onClick={() => setIsEditingTags(!isEditingTags)} className="text-indigo-600 hover:text-indigo-800 transition-colors">
                  <Plus size={14} />
                </button>
              </div>
            </div>
            {isEditingTags && (
              <div className="absolute top-14 left-16 w-72 bg-white shadow-2xl rounded-xl p-3 border border-slate-200 z-[110] animate-in fade-in slide-in-from-top-2">
                 <div className="flex gap-1.5 mb-3 flex-wrap">
                   {paper.tags.map(t => (
                     <span key={t} className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md flex items-center gap-1.5 font-bold">
                       {t} <button className="hover:text-red-500" onClick={async () => {
                         const nt = paper.tags.filter(pt => pt !== t);
                         await updatePaperTags(paper.id, nt);
                         onUpdateTags(nt);
                       }}>&times;</button>
                     </span>
                   ))}
                 </div>
                 <input 
                   className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none" 
                   placeholder="Add tag..." 
                   value={tagInput} 
                   onChange={e => setTagInput(e.target.value)} 
                   onKeyDown={e => e.key === 'Enter' && handleAddPaperTag()} 
                   autoFocus
                 />
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 rounded-full p-1 border border-slate-200">
            <button onClick={() => setScale(s => Math.max(0.6, s - 0.2))} className="p-1.5 hover:bg-white rounded-full transition-all text-slate-600 shadow-sm">
              <ZoomOut size={16} />
            </button>
            <span className="text-[11px] font-bold w-12 text-center text-slate-600">{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale(s => Math.min(3.0, s + 0.2))} className="p-1.5 hover:bg-white rounded-full transition-all text-slate-600 shadow-sm">
              <ZoomIn size={16} />
            </button>
          </div>
          <button onClick={() => setShowSummary(!showSummary)} className={clsx("h-9 px-4 rounded-full transition-all text-xs font-bold flex items-center gap-2 border", showSummary ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-400")}>
            <FileText size={16} /> SUMMARY
          </button>
        </div>
      </div>

      {/* Main Content Area - Use generic div structure to avoid scrolling issues */}
      <div className="flex-1 overflow-auto bg-slate-100 relative p-8">
        <div className="flex justify-center min-h-full">
           <div className="relative shadow-2xl rounded-sm bg-white">
            <Document file={paper.fileData} onLoadSuccess={onDocumentLoadSuccess} className="pdf-document">
              {numPages && Array.from(new Array(numPages), (_, index) => {
                const pageNum = index + 1;
                const pageNotes = notes.filter(n => n.pageNumber === pageNum);
                return (
                  <div key={`page_${pageNum}`} className="mb-6 relative group bg-white border border-slate-200 shadow-sm" style={{ width: 'fit-content' }}>
                    <Page pageNumber={pageNum} scale={scale} renderTextLayer={true} renderAnnotationLayer={false} />
                    
                    {/* Highlights Overlay */}
                    <div className="absolute inset-0 z-10 pointer-events-none">
                      {pageNotes.map(note => (
                        <div key={note.id}>
                          {(note.highlightAreas || []).map((area, idx) => (
                             <div 
                               key={idx}
                               onClick={(e) => { e.stopPropagation(); toggleNoteWindow(note.id); }}
                               className={clsx("absolute mix-blend-multiply transition-all cursor-pointer pointer-events-auto rounded-sm ring-1", getHighlightColor())}
                               style={{ left: `${area.x}%`, top: `${area.y}%`, width: `${area.width}%`, height: `${area.height}%` }}
                               title="Click to toggle note"
                             />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </Document>
          </div>
        </div>
      </div>

       {/* Floating Action Bar */}
       {selection && (
          <div className="fixed bg-slate-900 text-white px-4 py-2 rounded-full shadow-2xl z-[150] flex items-center gap-3 animate-in fade-in zoom-in duration-200 border border-slate-700" style={{ top: (selection.rect?.top || 0) - 60, left: (selection.rect?.left || 0) + (selection.rect?.width || 0) / 2, transform: 'translateX(-50%)' }}>
             <button onClick={handleCreateNote} className="flex items-center gap-2 hover:text-indigo-400 transition-colors text-xs font-bold uppercase tracking-widest">
               <Highlighter size={16} /> Create Highlighted Note
             </button>
          </div>
        )}

      {/* Note Windows - Fixed Position */}
      <div className="note-window-ignore">
        {Array.from(openNoteIds).map(id => {
          const note = notes.find(n => n.id === id);
          if (!note) return null;
          return (
            <NoteWindow 
              key={id}
              note={note}
              allGlobalTags={allGlobalTags}
              allNotes={allNotes}
              onSave={handleNoteSave}
              onDelete={() => handleDeleteLocalNote(id)}
              onClose={() => toggleNoteWindow(id)}
              onRequestAI={onRequestAI}
            />
          );
        })}
      </div>

      {showSummary && (
        <div className="absolute right-0 top-16 bottom-0 z-30 shadow-xl animate-in slide-in-from-right">
          <SummaryPanel summary={paper.summary || ''} onSave={onUpdateSummary} onClose={() => setShowSummary(false)} onRequestAI={onRequestAI} />
        </div>
      )}
    </div>
  );
};

export default Reader;