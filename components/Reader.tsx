import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Paper, Note, HighlightArea, AppSettings } from '../types';
import { ChevronLeft, ZoomIn, ZoomOut, Plus, Highlighter, FileText, Settings as SettingsIcon, MessageSquare, Sparkles, Edit2, Check, X } from 'lucide-react';
import { clsx } from 'clsx';
import { updatePaperTags, updatePaperProgress } from '../lib/db';
import NoteWindow from './NoteWindow';
import SummaryPanel from './SummaryPanel';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${String(pdfjs.version)}/build/pdf.worker.min.mjs`;

interface ReaderProps {
  paper: Paper;
  initialNotes: Note[];
  allGlobalTags: string[];
  allNotes: Note[];
  settings: AppSettings;
  onClose: () => void;
  onUpdateTags: (tags: string[]) => void;
  onRenamePaper: (id: string, newTitle: string) => void;
  onUpdateSummary: (summary: string) => void;
  onUpdateAISummary: (summary: string) => void;
  onRequestAI: (task: string, payload: any) => void;
  onSaveNote: (note: Note) => void;
  onDeleteNote: (id: string) => void;
}

const Reader: React.FC<ReaderProps> = ({ paper, initialNotes, allGlobalTags, allNotes, settings, onClose, onUpdateTags, onRenamePaper, onUpdateSummary, onUpdateAISummary, onRequestAI, onSaveNote, onDeleteNote }) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(1.2);
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [showSummary, setShowSummary] = useState(false);
  const [selection, setSelection] = useState<{ text: string; rect: DOMRect; pageNumber: number; highlightAreas: HighlightArea[] } | null>(null);
  const [openNoteIds, setOpenNoteIds] = useState<Set<string>>(new Set());
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [currentPage, setCurrentPage] = useState(paper.lastPageRead || 1);
  const [hasResumed, setHasResumed] = useState(false);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(paper.title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);

  useEffect(() => {
    setEditTitle(paper.title);
  }, [paper.title]);

  const onDocumentLoadSuccess = (document: any) => {
    setNumPages(document.numPages);
  };

  useEffect(() => {
    if (numPages && !hasResumed && paper.lastPageRead && paper.lastPageRead > 1) {
      const timer = setTimeout(() => {
        const targetPage = document.getElementById(`page-wrapper-${paper.lastPageRead}`);
        if (targetPage && scrollContainerRef.current) {
          targetPage.scrollIntoView({ behavior: 'auto' });
          setHasResumed(true);
        }
      }, 500);
      return () => clearTimeout(timer);
    } else if (numPages && !hasResumed) {
      setHasResumed(true);
    }
  }, [numPages, paper.lastPageRead, hasResumed]);

  useEffect(() => {
    if (!numPages) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            const pageId = entry.target.id;
            const pageNum = parseInt(pageId.split('-')[2], 10);
            if (!isNaN(pageNum)) {
              setCurrentPage(pageNum);
              updatePaperProgress(paper.id, pageNum, numPages);
            }
          }
        });
      },
      {
        root: scrollContainerRef.current,
        threshold: 0.5,
      }
    );

    const timer = setTimeout(() => {
      for (let i = 1; i <= numPages; i++) {
        const el = document.getElementById(`page-wrapper-${i}`);
        if (el) observerRef.current?.observe(el);
      }
    }, 1000);

    return () => {
      clearTimeout(timer);
      observerRef.current?.disconnect();
    };
  }, [numPages, paper.id]);

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
    
    setNotes(prev => [...prev, note]);
    onSaveNote(note);
    setOpenNoteIds(prev => new Set(prev).add(note.id));
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleNoteSave = (updatedNote: Note) => {
    onSaveNote(updatedNote);
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

  const getHighlightBaseColor = (color: string): string => {
    switch (color) {
      case 'green': return 'bg-emerald-400';
      case 'blue': return 'bg-sky-400';
      case 'red': return 'bg-rose-400';
      default: return 'bg-yellow-400';
    }
  };

  const handleSaveTitle = () => {
    if (editTitle.trim() && editTitle !== paper.title) {
      onRenamePaper(paper.id, editTitle.trim());
    }
    setIsEditingTitle(false);
  };

  const attemptAnchorAI = (pageNum: number) => {
    const pageWrapper = document.getElementById(`page-wrapper-${pageNum}`);
    if (!pageWrapper) return;
    
    const unanchoredNotes = notes.filter(n => 
      n.pageNumber === pageNum && 
      (!n.highlightAreas || n.highlightAreas.length === 0) && 
      n.quote
    );
    if (unanchoredNotes.length === 0) return;

    setTimeout(() => {
        const textLayer = pageWrapper.querySelector('.react-pdf__Page__textContent');
        if (!textLayer) return;
        const spans = Array.from(textLayer.querySelectorAll('span')) as HTMLElement[];
        if (spans.length === 0) return;

        const pdfPage = pageWrapper.querySelector('.react-pdf__Page');
        if (!pdfPage) return;
        const pageRect = pdfPage.getBoundingClientRect();

        const LIGATURES: Record<string, string> = {
          'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 
          'ﬅ': 'ft', 'ﬆ': 'st', 'Ꜳ': 'AA', 'Æ': 'AE', 'ꜳ': 'aa',
        };

        const normalizeChar = (char: string): string => {
          let c: string = char;
          const mapped = LIGATURES[c];
          if (mapped) c = mapped;
          return c.toLowerCase().replace(/[^a-z0-9]/g, '');
        };

        let fullPageText = "";
        const charMap: { spanIndex: number }[] = [];

        spans.forEach((span, idx) => {
            const textContent: string = span.textContent || "";
            for (const char of Array.from(textContent)) {
                const norm = normalizeChar(char);
                if (norm) { 
                    for (const n of Array.from(norm)) {
                      fullPageText += n;
                      charMap.push({ spanIndex: idx });
                    }
                }
            }
        });

        unanchoredNotes.forEach(note => {
            let matchedSpans: HTMLElement[] = [];
            let startSpanIndex = -1;
            let endSpanIndex = -1;

            if (note.quote.includes(' ... ')) {
              const parts = note.quote.split(' ... ');
              const startSnippet = Array.from(parts[0] || '').map(c => normalizeChar(c)).join('');
              const endSnippet = Array.from(parts[1] || '').map(c => normalizeChar(c)).join('');

              if (!startSnippet && !endSnippet) return;

              const startIndex = startSnippet ? fullPageText.indexOf(startSnippet) : -1;
              if (startIndex !== -1) {
                  const startMapEntry = charMap[startIndex];
                  if (startMapEntry) {
                    startSpanIndex = startMapEntry.spanIndex;
                  }
                  
                  if (endSnippet) {
                     const searchFrom = startIndex + startSnippet.length;
                     const endIndexSearch = fullPageText.indexOf(endSnippet, searchFrom);
                     if (endIndexSearch !== -1) {
                         const endIndex = endIndexSearch + endSnippet.length - 1;
                         const endMapEntry = charMap[endIndex];
                         if (endMapEntry) {
                           endSpanIndex = endMapEntry.spanIndex;
                         }
                     }
                  }
              }

              if (startSpanIndex !== -1 && endSpanIndex === -1 && startIndex !== -1) {
                  const endOfStartSnippet = startIndex + startSnippet.length - 1;
                  const endOfStartMapEntry = charMap[endOfStartSnippet];
                  if (endOfStartMapEntry) {
                    endSpanIndex = endOfStartMapEntry.spanIndex;
                  }
              }
            } else {
              const cleanQuote = Array.from(note.quote).map(c => normalizeChar(c)).join('');
              const idx = fullPageText.indexOf(cleanQuote);
              if (idx !== -1) {
                 const endIdx = idx + cleanQuote.length - 1;
                 const startEntry = charMap[idx];
                 const endEntry = charMap[endIdx];
                 if (startEntry && endEntry) {
                    startSpanIndex = startEntry.spanIndex;
                    endSpanIndex = endEntry.spanIndex;
                 }
              }
            }

            if (startSpanIndex !== -1 && endSpanIndex !== -1) {
                 const first = Math.min(startSpanIndex, endSpanIndex);
                 const last = Math.max(startSpanIndex, endSpanIndex);
                 matchedSpans = spans.slice(first, last + 1);

                 const highlightAreas: HighlightArea[] = matchedSpans.map(span => {
                     const rect = span.getBoundingClientRect();
                     return {
                        x: (rect.left - pageRect.left) / pageRect.width * 100,
                        y: (rect.top - pageRect.top) / pageRect.height * 100,
                        width: rect.width / pageRect.width * 100,
                        height: rect.height / pageRect.height * 100
                     };
                 });
                 onSaveNote({ ...note, highlightAreas });
            }
        });
    }, 1200);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 relative">
      <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm shrink-0 z-20">
        <div className="flex items-center gap-6 overflow-hidden">
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors shrink-0">
            <ChevronLeft size={22} />
          </button>
          <div className="flex flex-col max-w-xl overflow-hidden">
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  ref={titleInputRef}
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                  onBlur={handleSaveTitle}
                  autoFocus
                  className="text-sm font-bold text-slate-900 border-b-2 border-indigo-600 outline-none bg-transparent w-full"
                />
                <button onClick={handleSaveTitle} className="text-emerald-600 p-1 hover:bg-emerald-50 rounded"><Check size={16}/></button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditingTitle(true)}>
                <h1 className="text-sm font-bold text-slate-900 truncate tracking-tight">{paper.title}</h1>
                <Edit2 size={14} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
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
          </div>
        </div>

        <div className="flex items-center gap-4">
           {numPages && (
             <div className="text-xs font-bold text-slate-400 tracking-tighter bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
               PAGE <span className="text-indigo-600">{currentPage}</span> / {numPages}
             </div>
           )}
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
            <FileText size={16} /> ANALYSIS & NOTES
          </button>
        </div>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-slate-100 relative p-8">
        <div className="flex justify-center min-h-full">
           <div className="relative shadow-2xl rounded-sm bg-white">
            <Document file={paper.fileData} onLoadSuccess={onDocumentLoadSuccess} className="pdf-document">
              {numPages && Array.from({ length: numPages }, (_, index) => {
                const pageNum = index + 1;
                const pageNotes = notes.filter(n => n.pageNumber === pageNum);
                const highlightedNotes = pageNotes.filter(n => n.highlightAreas && n.highlightAreas.length > 0);
                const genericNotes = pageNotes.filter(n => !n.highlightAreas || n.highlightAreas.length === 0);

                return (
                  <div key={`page_${pageNum}`} id={`page-wrapper-${pageNum}`} className="mb-6 relative group bg-white border border-slate-200 shadow-sm" style={{ width: 'fit-content' }}>
                    <Page pageNumber={pageNum} scale={scale} renderTextLayer={true} renderAnnotationLayer={false} onRenderSuccess={() => attemptAnchorAI(pageNum)} />
                    
                    <div className="absolute inset-0 z-10 pointer-events-none">
                      {highlightedNotes.map(note => (
                        <div key={note.id} className="absolute inset-0 opacity-40 mix-blend-multiply group/note pointer-events-none">
                          {(note.highlightAreas || []).map((area, idx) => (
                             <div 
                               key={idx} 
                               onClick={(e) => { e.stopPropagation(); toggleNoteWindow(note.id); }} 
                               className={clsx("absolute transition-colors cursor-pointer pointer-events-auto rounded-[1px]", getHighlightBaseColor(note.color), "hover:brightness-95")} 
                               style={{ left: `${area.x}%`, top: `${area.y}%`, width: `${area.width}%`, height: `${area.height}%` }} 
                             />
                          ))}
                        </div>
                      ))}
                    </div>

                    {genericNotes.length > 0 && (
                      <div className="absolute -right-12 top-0 flex flex-col gap-2 z-20">
                         {genericNotes.map((note) => (
                           <button key={note.id} onClick={(e) => { e.stopPropagation(); toggleNoteWindow(note.id); }} className="w-8 h-8 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-full flex items-center justify-center shadow-sm border border-indigo-200 transition-all hover:scale-110">
                             <Sparkles size={14} />
                           </button>
                         ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </Document>
          </div>
        </div>
      </div>

       {selection && (
          <div className="fixed bg-slate-900 text-white px-4 py-2 rounded-full shadow-2xl z-[150] flex items-center gap-3 animate-in fade-in zoom-in duration-200 border border-slate-700" style={{ top: (selection.rect?.top || 0) - 60, left: (selection.rect?.left || 0) + (selection.rect?.width || 0) / 2, transform: 'translateX(-50%)' }}>
             <button onClick={handleCreateNote} className="flex items-center gap-2 hover:text-indigo-400 transition-colors text-xs font-bold uppercase tracking-widest">
               <Highlighter size={16} /> Highlight & Note
             </button>
          </div>
        )}

      <div className="fixed bottom-6 left-6 bg-white/90 backdrop-blur border border-slate-200 p-3 rounded-lg shadow-lg z-40 text-xs">
          <h4 className="font-bold text-slate-500 mb-2 uppercase tracking-wider text-[10px]">Highlight Legend</h4>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-rose-400"></div> <span className="text-slate-700">Critical Importance</span></div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-sky-400"></div> <span className="text-slate-700">High Importance</span></div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-yellow-400"></div> <span className="text-slate-700">Standard / Insight</span></div>
          </div>
      </div>

      <div className="note-window-ignore">
        {Array.from(openNoteIds).map(id => {
          const note = notes.find(n => n.id === id);
          if (!note) return null;
          return <NoteWindow key={id} note={note} allGlobalTags={allGlobalTags} allNotes={allNotes} onSave={handleNoteSave} onDelete={() => handleDeleteLocalNote(id)} onClose={() => toggleNoteWindow(id)} onRequestAI={onRequestAI} />;
        })}
      </div>

      {showSummary && (
        <div className="absolute right-0 top-16 bottom-0 z-30 shadow-xl animate-in slide-in-from-right">
          <SummaryPanel aiSummary={paper.aiSummary || ''} manualSummary={paper.summary || ''} onSaveManual={onUpdateSummary} onSaveAI={onUpdateAISummary} onClose={() => setShowSummary(false)} onRequestAI={onRequestAI} />
        </div>
      )}
    </div>
  );
};

export default Reader;