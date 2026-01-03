import React, { useState, useRef, useEffect } from 'react';
import { Note } from '../types';
import { X, Save, Wand2, Tag, Search, Check } from 'lucide-react';

interface NoteWindowProps {
  note: Note;
  allGlobalTags: string[];
  allNotes: Note[];
  onSave: (note: Note) => void;
  onClose: () => void;
  onRequestAI: (task: string, payload: any) => void;
}

const NoteWindow: React.FC<NoteWindowProps> = ({ note, allGlobalTags, allNotes, onSave, onClose, onRequestAI }) => {
  const [comment, setComment] = useState(note.comment);
  const [tags, setTags] = useState<string[]>(note.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [isAutoTagging, setIsAutoTagging] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);

  // Sync tags with props when parent updates (e.g. AI auto-tag)
  useEffect(() => {
    setTags(note.tags || []);
  }, [note.tags]);

  // Sync comment with props when parent updates (e.g. AI auto-reorg)
  useEffect(() => {
    setComment(note.comment || '');
  }, [note.comment]);

  // Dragging logic
  const [position, setPosition] = useState({ x: window.innerWidth / 2 - 200, y: 200 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Combine global tags with tags from all current notes to ensure we suggest existing ones
  const allKnownTags = Array.from(new Set([
    ...allGlobalTags, 
    ...allNotes.flatMap(n => n.tags || [])
  ])).sort();

  const filteredSuggestions = allKnownTags.filter(t => 
    t.toLowerCase().includes(tagInput.toLowerCase()) && !tags.includes(t)
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.no-drag')) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
    };
    const handleMouseUp = () => setIsDragging(false);
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleAiSuggestTags = () => {
    if (!comment.trim() && !note.quote.trim()) return;
    setIsAutoTagging(true);
    onRequestAI('SUGGEST_TAGS', { 
      noteId: note.id,
      text: comment + " " + note.quote, 
      currentTags: tags, 
      globalTags: allKnownTags 
    });
    // Reset state after 2s to indicate request sent
    setTimeout(() => setIsAutoTagging(false), 2000);
  };

  const handleAiReorganize = () => {
    if (!comment.trim()) return;
    onRequestAI('REORGANIZE_NOTE', {
      text: comment,
      noteId: note.id
    });
  };

  const handleAddTag = (tag: string) => {
    const sanitized = tag.trim();
    if (sanitized && !tags.includes(sanitized)) {
      setTags([...tags, sanitized]);
    }
    setTagInput('');
    setShowSuggestions(false);
  };

  const handleSave = () => {
    onSave({ ...note, comment, tags });
    onClose();
  };

  return (
    <div 
      ref={windowRef}
      style={{ left: position.x, top: position.y }}
      className="fixed w-[400px] bg-white rounded-xl shadow-2xl border border-gray-200 z-[60] flex flex-col animate-in fade-in zoom-in-95 duration-150"
    >
      <div onMouseDown={handleMouseDown} className="h-10 bg-slate-900 rounded-t-xl flex items-center justify-between px-3 cursor-move">
        <span className="text-white text-xs font-bold">Note</span>
        <button onClick={onClose} className="text-white/70 hover:text-white no-drag"><X size={16} /></button>
      </div>

      <div className="p-4 bg-white rounded-b-xl flex flex-col gap-3 no-drag">
        <div className="bg-amber-50 border-l-2 border-amber-400 p-2 text-xs italic text-slate-700 max-h-24 overflow-y-auto rounded-r-md">
          "{note.quote}"
        </div>

        <div className="relative">
          <textarea
            ref={textareaRef}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Type your notes..."
            className="w-full h-32 p-3 text-sm bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-500 resize-none text-slate-800 placeholder-slate-400"
          />
          {comment.trim().length > 10 && (
            <button 
              onClick={handleAiReorganize}
              className="absolute bottom-2 right-2 text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded border border-indigo-100 hover:bg-indigo-100 flex items-center gap-1 font-medium transition-colors"
              title="AI Reorganize/Proofread"
            >
              <Wand2 size={10} /> Reorganize
            </button>
          )}
        </div>

        <div className="space-y-2">
           <div className="flex justify-between items-center">
             <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tags</span>
             <button 
               onClick={handleAiSuggestTags} 
               disabled={isAutoTagging}
               className="text-[10px] text-indigo-600 font-bold flex items-center gap-1 hover:underline disabled:opacity-50"
             >
               <Wand2 size={10} /> {isAutoTagging ? 'Requesting...' : 'Suggest Tags'}
             </button>
           </div>
           
           <div className="flex flex-wrap gap-1.5 min-h-[24px]">
             {tags.map(tag => (
               <span key={tag} className="bg-slate-100 px-2 py-0.5 rounded text-xs text-slate-700 border border-slate-200 flex items-center gap-1 font-medium">
                 {tag} <button onClick={() => setTags(tags.filter(t => t !== tag))} className="text-slate-400 hover:text-red-500"><X size={10}/></button>
               </span>
             ))}
           </div>

           <div className="relative group">
              <div className="absolute left-2 top-2 text-slate-400 pointer-events-none">
                <Search size={14} />
              </div>
              <input
                 type="text"
                 value={tagInput}
                 onChange={(e) => { setTagInput(e.target.value); setShowSuggestions(true); }}
                 onFocus={() => setShowSuggestions(true)}
                 onBlur={() => {
                   // Delay to allow click on suggestion
                   setTimeout(() => setShowSuggestions(false), 200);
                 }}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter') {
                      e.preventDefault();
                      if (tagInput.trim()) handleAddTag(tagInput);
                   }
                 }}
                 placeholder="Search or add custom tag..."
                 className="w-full pl-8 pr-2 py-2 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 text-slate-800"
               />
               
               {/* Autocomplete Dropdown */}
               {showSuggestions && tagInput && (
                 <div className="absolute bottom-full left-0 w-full bg-white border border-slate-200 shadow-xl rounded-md mb-1 max-h-40 overflow-y-auto z-10">
                    {filteredSuggestions.length === 0 ? (
                      <div 
                        onMouseDown={(e) => { e.preventDefault(); handleAddTag(tagInput); }}
                        className="p-2 text-xs text-indigo-600 font-medium cursor-pointer hover:bg-indigo-50"
                      >
                        Create new tag "{tagInput}"
                      </div>
                    ) : (
                      <>
                        <div className="px-2 py-1 text-[9px] font-bold text-slate-400 bg-slate-50 uppercase tracking-wider">Suggestions</div>
                        {filteredSuggestions.map(t => (
                          <button 
                            key={t} 
                            onMouseDown={(e) => {
                              // Prevent blur
                              e.preventDefault();
                              handleAddTag(t);
                            }} 
                            className="block w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 transition-colors border-b border-slate-50 last:border-0"
                          >
                            {t}
                          </button>
                        ))}
                      </>
                    )}
                 </div>
               )}
           </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-100">
          <button onClick={handleSave} className="bg-slate-900 text-white px-5 py-2 rounded-lg text-xs font-bold hover:bg-slate-800 flex items-center gap-2 shadow-lg shadow-slate-200 transition-all active:scale-95">
            <Save size={14} /> Save Note
          </button>
        </div>
      </div>
    </div>
  );
};

export default NoteWindow;