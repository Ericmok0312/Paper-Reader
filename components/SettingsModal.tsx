import React, { useState } from 'react';
import { X, Save, FileCode, RotateCcw } from 'lucide-react';
import { AppSettings } from '../types';

interface SettingsModalProps {
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ settings, onSave, onClose }) => {
  const [highlightColor, setHighlightColor] = useState(settings.highlightColor);
  const [apiBaseUrl, setApiBaseUrl] = useState(settings.apiBaseUrl || '');
  const [aiModel, setAiModel] = useState(settings.aiModel || '');
  
  // Custom Prompts
  const [promptSuggestTags, setPromptSuggestTags] = useState(settings.promptSuggestTags || '');
  const [promptReorganizeNote, setPromptReorganizeNote] = useState(settings.promptReorganizeNote || '');
  const [promptOrganizeSummary, setPromptOrganizeSummary] = useState(settings.promptOrganizeSummary || '');
  
  const [activeTab, setActiveTab] = useState<'general' | 'prompts'>('general');

  const handleSave = () => {
    onSave({
      highlightColor,
      apiBaseUrl: apiBaseUrl.trim() || undefined,
      aiModel: aiModel.trim() || undefined,
      promptSuggestTags: promptSuggestTags.trim() || undefined,
      promptReorganizeNote: promptReorganizeNote.trim() || undefined,
      promptOrganizeSummary: promptOrganizeSummary.trim() || undefined
    });
    onClose();
  };

  const renderGeneralSettings = () => (
    <div className="space-y-6 animate-in fade-in">
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Default Highlight Color</label>
        <div className="flex gap-4">
          {['yellow', 'green', 'blue', 'red'].map((color) => (
            <button
              key={color}
              onClick={() => setHighlightColor(color as any)}
              className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all ${highlightColor === color ? 'border-indigo-600 scale-110 shadow-md' : 'border-transparent opacity-50 hover:opacity-100'}`}
              style={{ backgroundColor: color === 'yellow' ? '#facc15' : color === 'green' ? '#34d399' : color === 'blue' ? '#38bdf8' : '#fb7185' }}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-slate-100 pt-6">
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">API Configuration</label>
        <p className="text-[10px] text-slate-400 mb-3">Leave blank to use default Google Gemini (via Env Key). Set Base URL for OpenAI compatible proxies.</p>
        
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-600 font-medium">Base URL</label>
            <input 
              type="text" 
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder="e.g. https://api.openai.com/v1"
              className="w-full mt-1 text-sm bg-white border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500/20 outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-slate-600 font-medium">Model Name</label>
            <input 
              type="text" 
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              placeholder="e.g. gpt-4"
              className="w-full mt-1 text-sm bg-white border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500/20 outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderPromptSettings = () => (
    <div className="space-y-5 animate-in fade-in">
      <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
        <p className="text-[10px] text-indigo-700 leading-relaxed">
          <strong>Tip:</strong> Use <code className="bg-white px-1 rounded text-indigo-900">{'{{text}}'}</code> as a placeholder for the content. For tagging, you can also use <code className="bg-white px-1 rounded text-indigo-900">{'{{globalTags}}'}</code> and <code className="bg-white px-1 rounded text-indigo-900">{'{{currentTags}}'}</code>.
        </p>
      </div>

      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Suggest Tags Prompt</label>
          <button onClick={() => setPromptSuggestTags('')} className="text-[10px] text-slate-400 hover:text-indigo-600 flex items-center gap-1"><RotateCcw size={10}/> Reset</button>
        </div>
        <textarea 
          value={promptSuggestTags}
          onChange={(e) => setPromptSuggestTags(e.target.value)}
          placeholder="Default: Analyze the note and suggest tags..."
          className="w-full h-24 text-xs bg-white border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none font-mono"
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Note Reorganization Prompt</label>
          <button onClick={() => setPromptReorganizeNote('')} className="text-[10px] text-slate-400 hover:text-indigo-600 flex items-center gap-1"><RotateCcw size={10}/> Reset</button>
        </div>
        <textarea 
          value={promptReorganizeNote}
          onChange={(e) => setPromptReorganizeNote(e.target.value)}
          placeholder="Default: Rewrite and reorganize..."
          className="w-full h-24 text-xs bg-white border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none font-mono"
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Summary Organization Prompt</label>
          <button onClick={() => setPromptOrganizeSummary('')} className="text-[10px] text-slate-400 hover:text-indigo-600 flex items-center gap-1"><RotateCcw size={10}/> Reset</button>
        </div>
        <textarea 
          value={promptOrganizeSummary}
          onChange={(e) => setPromptOrganizeSummary(e.target.value)}
          placeholder="Default: Reorganize this summary..."
          className="w-full h-24 text-xs bg-white border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none font-mono"
        />
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex justify-between items-center shrink-0">
          <h2 className="text-lg font-bold text-slate-900">Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6 shrink-0">
          <button 
            onClick={() => setActiveTab('general')}
            className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'general' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            General
          </button>
          <button 
            onClick={() => setActiveTab('prompts')}
            className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'prompts' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            AI Prompts
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'general' ? renderGeneralSettings() : renderPromptSettings()}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-2xl shrink-0 flex justify-end">
          <button onClick={handleSave} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-slate-200 hover:bg-slate-800 flex items-center gap-2">
            <Save size={16} /> Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;