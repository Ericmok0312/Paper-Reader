import React, { useState, useEffect } from 'react';
import { Wand2, Save, X, BookOpenCheck, Eye, Edit3 } from 'lucide-react';
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

  // Sync state when parent summary updates (e.g. from AI)
  useEffect(() => {
    setText(summary || '');
  }, [summary]);

  const handleAiReorg = () => {
    if (!text.trim()) return;
    onRequestAI('ORGANIZE_SUMMARY', { text });
    // Notification will handle result and update props via App parent
  };

  return (
    <div className="w-96 h-full bg-white border-l border-gray-200 flex flex-col shadow-xl z-30">
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