import React, { useState, useEffect } from 'react';
import { X, Save, FileCode, RotateCcw, HardDrive, CheckCircle2, Key, ExternalLink, AlertTriangle } from 'lucide-react';
import { AppSettings } from '../types';

interface SettingsModalProps {
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
  onClose: () => void;
  onConfigureBackup: () => void;
  backupStatus: { active: boolean; lastBackup: Date | null; fileName?: string };
}

const SettingsModal: React.FC<SettingsModalProps> = ({ settings, onClose, onSave, onConfigureBackup, backupStatus }) => {
  const [highlightColor, setHighlightColor] = useState(settings.highlightColor);
  const [apiBaseUrl, setApiBaseUrl] = useState(settings.apiBaseUrl || '');
  const [aiModel, setAiModel] = useState(settings.aiModel || '');
  
  // Custom Prompts
  const [promptSuggestTags, setPromptSuggestTags] = useState(settings.promptSuggestTags || '');
  const [promptReorganizeNote, setPromptReorganizeNote] = useState(settings.promptReorganizeNote || '');
  const [promptOrganizeSummary, setPromptOrganizeSummary] = useState(settings.promptOrganizeSummary || '');
  const [promptAnalyzePaper, setPromptAnalyzePaper] = useState(settings.promptAnalyzePaper || '');
  
  const [activeTab, setActiveTab] = useState<'general' | 'prompts' | 'backup' | 'ai'>('general');
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [isAiStudioAvailable, setIsAiStudioAvailable] = useState<boolean>(false);

  useEffect(() => {
    // @ts-ignore
    const aiStudio = typeof window !== 'undefined' ? (window as any).aistudio : null;
    if (aiStudio && typeof aiStudio.hasSelectedApiKey === 'function') {
      setIsAiStudioAvailable(true);
      aiStudio.hasSelectedApiKey().then(setHasApiKey);
    } else if (process.env.API_KEY) {
      // If we're local and have a key in env, treat as "connected"
      setHasApiKey(true);
    }
  }, []);

  const handleSave = () => {
    onSave({
      highlightColor,
      apiBaseUrl: apiBaseUrl.trim() || undefined,
      aiModel: aiModel.trim() || undefined,
      promptSuggestTags: promptSuggestTags.trim() || undefined,
      promptReorganizeNote: promptReorganizeNote.trim() || undefined,
      promptOrganizeSummary: promptOrganizeSummary.trim() || undefined,
      promptAnalyzePaper: promptAnalyzePaper.trim() || undefined
    });
    onClose();
  };

  const handleSwitchKey = async () => {
    // @ts-ignore
    const aiStudio = (window as any).aistudio;
    if (aiStudio && typeof aiStudio.openSelectKey === 'function') {
      await aiStudio.openSelectKey();
      const has = await aiStudio.hasSelectedApiKey();
      setHasApiKey(has);
    }
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
    </div>
  );

  const renderAiSettings = () => (
    <div className="space-y-6 animate-in fade-in">
       <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-white rounded-lg shadow-sm text-indigo-600">
             <Key size={24} />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Gemini API Configuration</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              {isAiStudioAvailable 
                ? "ScholarNote uses your personal Google Cloud project to power AI features via the AI Studio bridge."
                : "ScholarNote is using the API Key configured in your environment (.env.local)."}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {hasApiKey ? (
            <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100">
              <CheckCircle2 size={16} />
              <span className="text-xs font-bold">API Key Detected</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-100">
              <AlertTriangle size={16} />
              <span className="text-xs font-bold">No API Key Configured</span>
            </div>
          )}

          {isAiStudioAvailable && (
            <div className="flex flex-col gap-2">
              <button 
                onClick={handleSwitchKey}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-sm transition-colors flex items-center justify-center gap-2"
              >
                <Key size={14} /> {hasApiKey ? 'Switch Project/Key' : 'Select API Key'}
              </button>
              
              <a 
                href="https://ai.google.dev/gemini-api/docs/billing" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[10px] text-indigo-600 hover:underline flex items-center justify-center gap-1 font-medium mt-1"
              >
                Learn about Gemini API billing <ExternalLink size={10} />
              </a>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100 pt-6">
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Advanced AI Config</label>
        <p className="text-[10px] text-slate-400 mb-3">Optional: Use OpenAI-compatible proxies.</p>
        
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

  const renderBackupSettings = () => (
    <div className="space-y-6 animate-in fade-in">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-white rounded-lg shadow-sm text-indigo-600">
             <HardDrive size={24} />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Auto-Backup Location</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Select a file on your device. ScholarNote will automatically save your library every 60 seconds.
            </p>
          </div>
        </div>

        <div className="mt-5">
          {backupStatus.active ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100">
                <CheckCircle2 size={16} />
                <span className="text-xs font-bold">Active & Syncing</span>
              </div>
              <div className="text-xs text-slate-600 font-mono bg-white px-3 py-2 rounded border border-slate-200 truncate">
                File: {backupStatus.fileName || 'scholarnote_backup.zip'}
              </div>
              <button 
                onClick={onConfigureBackup}
                className="mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 underline self-start"
              >
                Change Location
              </button>
            </div>
          ) : (
            <div>
              <button 
                onClick={onConfigureBackup}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-sm transition-colors flex items-center gap-2"
              >
                <HardDrive size={14} /> Select Backup File
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderPromptSettings = () => (
    <div className="space-y-5 animate-in fade-in">
      <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
        <p className="text-[10px] text-indigo-700 leading-relaxed">
          <strong>Tip:</strong> Use <code className="bg-white px-1 rounded text-indigo-900">{'{{text}}'}</code> as a placeholder for the content.
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
          className="w-full h-24 text-xs bg-white border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none font-mono"
        />
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center shrink-0">
          <h2 className="text-lg font-bold text-slate-900">Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
        </div>

        <div className="flex border-b border-gray-100 px-6 shrink-0 gap-1 overflow-x-auto">
          <button 
            onClick={() => setActiveTab('general')}
            className={`py-3 px-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${activeTab === 'general' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            General
          </button>
          <button 
            onClick={() => setActiveTab('ai')}
            className={`py-3 px-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${activeTab === 'ai' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            AI Engine
          </button>
           <button 
            onClick={() => setActiveTab('backup')}
            className={`py-3 px-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${activeTab === 'backup' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Backup
          </button>
          <button 
            onClick={() => setActiveTab('prompts')}
            className={`py-3 px-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${activeTab === 'prompts' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            AI Prompts
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'general' && renderGeneralSettings()}
          {activeTab === 'ai' && renderAiSettings()}
          {activeTab === 'backup' && renderBackupSettings()}
          {activeTab === 'prompts' && renderPromptSettings()}
        </div>

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