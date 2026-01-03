import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Wand2, Save, X, BookOpenCheck, Eye, Edit3, GripVertical } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface SummaryPanelProps {
  summary: string;
  onSave: (summary: string) => void;
  onClose: () => void;
  onRequestAI: (task: string, payload: any) => void;
}

const SummaryPanel: React.FC<SummaryPanelProps> = ({ summary, onSave, onClose, onRequestAI }) => {
  const [text, setText] = useState(summary || '');
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  
  // Resizable State
  const [width, setWidth] = useState(400); // Default width
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Sync state when parent summary updates (e.g. from AI)
  useEffect(() => {
    setText(summary || '');
  }, [summary]);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((mouseMoveEvent: MouseEvent) => {
    if (isResizing) {
      // Calculate width from the right edge of the screen
      const newWidth = document.body.clientWidth - mouseMoveEvent.clientX;
      if (newWidth > 300 && newWidth < 1200) { // Min/Max constraints
        setWidth(newWidth);
      }
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
    if (!text.trim()) return;
    onRequestAI('ORGANIZE_SUMMARY', { text });
  };

  return (
    <div 
      ref={sidebarRef}
      style={{ width: width }}
      className="h-full bg-white border-l border-gray-200 flex flex-col shadow-xl z-30 relative group"
    >
      {/* Drag Handle */}
      <div
        onMouseDown={startResizing}
        className={`absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-indigo-400 z-50 transition-colors ${isResizing ? 'bg-indigo-600' : 'bg-transparent'}`}
      >
        {/* Visual Grip Indicator centered vertically */}
        <div className="absolute top-1/2 -translate-y-1/2 -left-1 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 bg-white rounded shadow-sm border border-slate-200 p-0.5 pointer-events-none">
           <GripVertical size={12} />
        </div>
      </div>

      {/* Resize Overlay to prevent iframe/selection interference during drag */}
      {isResizing && <div className="fixed inset-0 z-[100] cursor-ew-resize" />}

      <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4 shrink-0 bg-white">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <BookOpenCheck size={16} /> Paper Summary
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={16} />
        </button>
      </div>

      <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50">
        <div className="flex bg-gray-200 rounded-lg p-0.5">
          <button 
            onClick={() => setMode('edit')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${mode === 'edit' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <div className="flex items-center gap-1"><Edit3 size={10} /> Edit</div>
          </button>
          <button 
            onClick={() => setMode('preview')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${mode === 'preview' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <div className="flex items-center gap-1"><Eye size={10} /> Preview</div>
          </button>
        </div>
        {mode === 'edit' && (
          <button onClick={handleAiReorg} className="text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium">
            <Wand2 size={12} /> AI Auto-Organize
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 relative">
        {mode === 'edit' ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Draft your summary here..."
            className="w-full h-full resize-none border-0 focus:ring-0 text-sm leading-relaxed text-gray-700 bg-transparent placeholder-gray-400"
          />
        ) : (
          <div className="prose prose-sm prose-slate max-w-none prose-headings:text-indigo-900 prose-headings:font-bold prose-p:text-slate-600">
            {text ? <ReactMarkdown>{text}</ReactMarkdown> : <span className="text-slate-400 italic">No summary content to preview.</span>}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-gray-200 bg-gray-50 shrink-0">
        <button 
          onClick={() => onSave(text)}
          className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center justify-center gap-2 shadow-sm"
        >
          <Save size={16} /> Save Summary
        </button>
      </div>
    </div>
  );
};

export default SummaryPanel;