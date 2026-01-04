import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Wand2, Save, X, BookOpenCheck, Eye, Edit3, GripVertical, BrainCircuit, PenLine } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface SummaryPanelProps {
  aiSummary: string;
  manualSummary: string;
  onSaveManual: (summary: string) => void;
  onSaveAI: (summary: string) => void;
  onClose: () => void;
  onRequestAI: (task: string, payload: any) => void;
}

const SummaryPanel: React.FC<SummaryPanelProps> = ({ aiSummary, manualSummary, onSaveManual, onSaveAI, onClose, onRequestAI }) => {
  const [activeTab, setActiveTab] = useState<'ai' | 'manual'>('ai');
  const [manualText, setManualText] = useState(manualSummary || '');
  const [aiText, setAiText] = useState(aiSummary || '');
  const [editMode, setEditMode] = useState(false);
  
  const [width, setWidth] = useState(450);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setManualText(manualSummary || ''); }, [manualSummary]);
  useEffect(() => { setAiText(aiSummary || ''); }, [aiSummary]);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => { setIsResizing(false); }, []);

  const resize = useCallback((mouseMoveEvent: MouseEvent) => {
    if (isResizing) {
      const newWidth = document.body.clientWidth - mouseMoveEvent.clientX;
      if (newWidth > 350 && newWidth < 1200) setWidth(newWidth);
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
    }
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  const handleAiReorg = () => {
    const textToReorg = activeTab === 'manual' ? manualText : aiText;
    if (!textToReorg.trim()) return;
    onRequestAI('ORGANIZE_SUMMARY', { text: textToReorg });
  };

  const handleSave = () => {
    if (activeTab === 'manual') onSaveManual(manualText);
    else onSaveAI(aiText);
    setEditMode(false);
  };

  return (
    <div ref={sidebarRef} style={{ width: width }} className="h-full bg-white border-l border-gray-200 flex flex-col shadow-xl z-30 relative group">
      <div onMouseDown={startResizing} className={`absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-indigo-400 z-50 transition-colors ${isResizing ? 'bg-indigo-600' : 'bg-transparent'}`}>
        <div className="absolute top-1/2 -translate-y-1/2 -left-1 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 bg-white rounded shadow-sm border border-slate-200 p-0.5 pointer-events-none">
           <GripVertical size={12} />
        </div>
      </div>
      {isResizing && <div className="fixed inset-0 z-[100] cursor-ew-resize" />}

      <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4 shrink-0 bg-white">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <BookOpenCheck size={16} /> Analysis & Learning
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={16} />
        </button>
      </div>

      <div className="flex border-b border-slate-100 bg-slate-50/50 p-1">
        <button 
          onClick={() => { setActiveTab('ai'); setEditMode(false); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'ai' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          <BrainCircuit size={14} /> AI Executive Summary
        </button>
        <button 
          onClick={() => { setActiveTab('manual'); setEditMode(false); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'manual' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          <PenLine size={14} /> Learning Notes
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 relative">
        <div className="flex justify-between items-center mb-4">
           <span className="text-[10px] uppercase tracking-widest font-black text-slate-400">
             {activeTab === 'ai' ? 'Deep Analysis Output' : 'Personal Reflection'}
           </span>
           <div className="flex gap-2">
             {!editMode ? (
               <button onClick={() => setEditMode(true)} className="text-[10px] font-bold text-indigo-600 flex items-center gap-1 hover:underline">
                 <Edit3 size={10} /> Edit
               </button>
             ) : (
               <button onClick={() => setEditMode(false)} className="text-[10px] font-bold text-slate-500 flex items-center gap-1 hover:underline">
                 <Eye size={10} /> Preview
               </button>
             )}
             {editMode && (
                <button onClick={handleAiReorg} className="text-[10px] font-bold text-indigo-600 flex items-center gap-1 hover:underline">
                  <Wand2 size={10} /> AI Organize
                </button>
             )}
           </div>
        </div>

        {editMode ? (
          <textarea
            value={activeTab === 'manual' ? manualText : aiText}
            onChange={(e) => activeTab === 'manual' ? setManualText(e.target.value) : setAiText(e.target.value)}
            placeholder={activeTab === 'manual' ? "Write your personal thoughts, critiques, or learning points here..." : "AI summary draft..."}
            className="w-full h-[calc(100%-40px)] resize-none border-0 focus:ring-0 text-sm leading-relaxed text-gray-700 bg-transparent placeholder-gray-400 font-serif"
          />
        ) : (
          <div className="prose prose-sm prose-slate max-w-none prose-headings:text-indigo-900 prose-headings:font-bold prose-p:text-slate-600 prose-strong:text-indigo-700">
            {activeTab === 'ai' ? (
              aiText ? <ReactMarkdown>{aiText}</ReactMarkdown> : <div className="text-slate-400 italic">No AI analysis available. Use "Analyze" from library.</div>
            ) : (
              manualText ? <ReactMarkdown>{manualText}</ReactMarkdown> : <div className="text-slate-400 italic">Empty learning notes. Click edit to start recording your personal journey with this paper.</div>
            )}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-gray-200 bg-gray-50 shrink-0">
        <button 
          onClick={handleSave}
          className={`w-full py-2.5 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 ${activeTab === 'manual' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'}`}
        >
          <Save size={16} /> Save {activeTab === 'manual' ? 'Learning Notes' : 'Analysis'}
        </button>
      </div>
    </div>
  );
};

export default SummaryPanel;