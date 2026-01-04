import React, { useState } from 'react';
import { PaperMetadata, Note, AppSettings } from '../types';
import { Upload, FileText, Search, Trash2, BookOpen, Edit2, Check, X, Download, Archive, HardDrive, Plus, Tag, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { exportDatabase, importDatabase, getPaperById, saveNote, updatePaperSummary } from '../lib/db';
import { analyzePaperSummary, analyzePaperHighlights } from '../lib/ai';

interface DashboardProps {
  papers: PaperMetadata[];
  globalTags: string[];
  onUpload: (file: File) => void;
  onSelectPaper: (id: string) => void;
  onDeletePaper: (id: string) => void;
  onRenamePaper: (id: string, newTitle: string) => void;
  onUpdateTags: (id: string, newTags: string[]) => void;
  onImportSuccess: () => void;
  autoBackupStatus: { active: boolean, lastBackup: Date | null };
  isUploading: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  papers, 
  globalTags,
  onUpload, 
  onSelectPaper, 
  onDeletePaper, 
  onRenamePaper, 
  onUpdateTags, 
  onImportSuccess, 
  autoBackupStatus,
  isUploading 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  
  // Title Editing State
  const [editingPaperId, setEditingPaperId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // Tag Editing State
  const [tagEditId, setTagEditId] = useState<string | null>(null);
  const [currentEditTags, setCurrentEditTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Deletion State
  const [paperToDeleteId, setPaperToDeleteId] = useState<string | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  
  // Local tags for filtering (only paper tags)
  const allPaperTags = Array.from(new Set(papers.flatMap(p => p.tags)));

  const filteredPapers = papers.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesTag = selectedTag ? p.tags.includes(selectedTag) : true;
    return matchesSearch && matchesTag;
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0]);
    }
  };

  // Title Editing Handlers
  const startEditing = (paper: PaperMetadata) => {
    setEditingPaperId(paper.id);
    setEditTitle(paper.title);
  };

  const saveTitle = (id: string) => {
    if (editTitle.trim()) {
      onRenamePaper(id, editTitle.trim());
    }
    setEditingPaperId(null);
  };

  // Tag Editing Handlers
  const startEditingTags = (paper: PaperMetadata) => {
    setTagEditId(paper.id);
    setCurrentEditTags([...paper.tags]);
    setTagInput('');
  };

  const saveTags = (id: string) => {
    onUpdateTags(id, currentEditTags);
    setTagEditId(null);
  };

  const addTag = (e?: React.FormEvent) => {
    e?.preventDefault();
    const val = tagInput.trim();
    if (val && !currentEditTags.includes(val)) {
      setCurrentEditTags([...currentEditTags, val]);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setCurrentEditTags(currentEditTags.filter(t => t !== tagToRemove));
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await exportDatabase();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scholarnote_backup_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Failed to export library.");
      console.error(e);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    if (!confirm("This will overwrite your current library with the backup. Continue?")) return;
    
    setIsImporting(true);
    try {
      await importDatabase(e.target.files[0]);
      onImportSuccess();
      alert("Library restored successfully!");
    } catch (error) {
      console.error(error);
      alert("Failed to import database. Please ensure it is a valid ScholarNote .zip backup.");
    } finally {
      setIsImporting(false);
      e.target.value = ''; // Reset input
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Library</h1>
          <p className="text-gray-500 mt-1">Manage and read your academic collection</p>
        </div>
        
        <div className="flex gap-3">
           <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm font-medium">
            <Upload size={18} />
            {isUploading ? 'Uploading...' : 'Upload PDF'}
            <input 
              type="file" 
              accept=".pdf" 
              className="hidden" 
              onChange={handleFileChange} 
              disabled={isUploading}
            />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar Filters & Data Management */}
        <div className="lg:col-span-1 space-y-6">
          {/* Data Persistence Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1">
              <HardDrive size={12}/> Backup & Restore
            </h3>
            
            <div className="space-y-3">
              <div className={`rounded-lg p-3 border transition-colors ${autoBackupStatus.active ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                <div className="flex justify-between items-start mb-1">
                   <div className="text-xs font-bold text-slate-700">Auto-Backup</div>
                   <div className={`h-2 w-2 rounded-full ${autoBackupStatus.active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                </div>
                {autoBackupStatus.active ? (
                   <div>
                     <p className="text-[10px] text-emerald-700 font-medium">Active</p>
                     <p className="text-[10px] text-slate-500 mt-1">
                       Saved: {autoBackupStatus.lastBackup ? autoBackupStatus.lastBackup.toLocaleTimeString() : 'Pending...'}
                     </p>
                   </div>
                ) : (
                  <p className="text-[10px] text-slate-500 leading-tight">
                    Not configured. Go to Settings &gt; Backup to set a location.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={handleExport} 
                  disabled={isExporting}
                  className="flex flex-col items-center justify-center gap-1 px-2 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition-colors"
                >
                  <Download size={14} /> Download ZIP
                </button>
                <label className="cursor-pointer flex flex-col items-center justify-center gap-1 px-2 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition-colors">
                  <Archive size={14} /> Restore ZIP
                  <input type="file" accept=".zip" className="hidden" onChange={handleImport} disabled={isImporting} />
                </label>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text"
                placeholder="Search papers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Tags</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedTag(null)}
                className={clsx(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                  selectedTag === null 
                    ? "bg-gray-800 text-white" 
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                All
              </button>
              {allPaperTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                  className={clsx(
                    "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                    tag === selectedTag 
                      ? "bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200" 
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-3">
          {filteredPapers.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
              <div className="mx-auto w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                <FileText className="text-gray-400" size={32} />
              </div>
              <h3 className="text-lg font-medium text-gray-900">No papers found</h3>
              <p className="text-gray-500 text-sm mt-1">Upload a PDF or Restore a Backup to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredPapers.map(paper => (
                <div key={paper.id} className="group bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow flex flex-col justify-between relative overflow-visible">
                  
                  {/* Inline Deletion Overlay - Using a more robust z-index and portal-like positioning if needed */}
                  {paperToDeleteId === paper.id && (
                    <div className="absolute inset-0 bg-white/95 backdrop-blur-[2px] z-[100] flex flex-col items-center justify-center p-6 text-center rounded-xl border-2 border-red-50 animate-in fade-in zoom-in-95 duration-200">
                      <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-3">
                        <AlertCircle size={24} />
                      </div>
                      <h4 className="font-bold text-slate-900 text-sm mb-1">Delete this paper?</h4>
                      <p className="text-xs text-slate-500 mb-6">This action is permanent and will remove all associated notes and analysis.</p>
                      <div className="flex gap-2 w-full">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setPaperToDeleteId(null); }}
                          className="flex-1 py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-colors"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); onDeletePaper(paper.id); setPaperToDeleteId(null); }}
                          className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm shadow-red-100"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                        <FileText size={24} />
                      </div>
                      
                      <div className="flex gap-1 relative z-[50]">
                        <button 
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); startEditing(paper); }}
                          className="text-gray-400 hover:text-indigo-600 p-1.5 rounded-md hover:bg-indigo-50 transition-colors cursor-pointer"
                          title="Rename Paper"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPaperToDeleteId(paper.id); }}
                          className="text-gray-400 hover:text-red-500 p-1.5 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
                          title="Delete Paper"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    
                    {editingPaperId === paper.id ? (
                      <div className="mb-2 flex items-center gap-2 relative z-20">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="flex-1 text-sm font-semibold text-gray-900 border-b-2 border-indigo-500 focus:outline-none bg-transparent"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.key === 'Enter' && saveTitle(paper.id)}
                        />
                        <button onClick={(e) => { e.stopPropagation(); saveTitle(paper.id); }} className="text-green-600 hover:bg-green-50 rounded p-1"><Check size={16}/></button>
                        <button onClick={(e) => { e.stopPropagation(); setEditingPaperId(null); }} className="text-red-500 hover:bg-red-50 rounded p-1"><X size={16}/></button>
                      </div>
                    ) : (
                       <h3 
                        className="font-semibold text-gray-900 line-clamp-2 mb-2 cursor-pointer hover:text-indigo-600 transition-colors"
                        onClick={() => onSelectPaper(paper.id)}
                        title="Click to read"
                      >
                        {paper.title}
                      </h3>
                    )}

                    {tagEditId === paper.id ? (
                      <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm mb-2 relative z-20" onClick={e => e.stopPropagation()}>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {currentEditTags.map(tag => (
                            <span key={tag} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700 border border-indigo-200">
                              {tag}
                              <button onClick={() => removeTag(tag)} className="ml-1 hover:text-red-600"><X size={10}/></button>
                            </span>
                          ))}
                        </div>
                        <div className="flex gap-1">
                          <input 
                            className="flex-1 text-xs border border-slate-300 rounded px-2 py-1 focus:outline-none focus:border-indigo-500 bg-white"
                            placeholder="Add tag..."
                            value={tagInput}
                            onChange={e => setTagInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addTag(e)}
                            list={`tags-list-${paper.id}`}
                            autoFocus
                          />
                          <datalist id={`tags-list-${paper.id}`}>
                            {globalTags.filter(t => !currentEditTags.includes(t)).map(t => (
                              <option key={t} value={t} />
                            ))}
                          </datalist>
                          <button onClick={() => addTag()} className="bg-slate-200 hover:bg-slate-300 text-slate-700 p-1 rounded"><Plus size={14}/></button>
                        </div>
                        <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-slate-200">
                           <button onClick={() => setTagEditId(null)} className="text-xs text-slate-500 hover:text-slate-800">Cancel</button>
                           <button onClick={() => saveTags(paper.id)} className="bg-indigo-600 text-white text-xs px-2 py-1 rounded font-bold hover:bg-indigo-700">Done</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2 mb-4 items-center min-h-[24px]">
                        {paper.tags.map(tag => (
                          <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                            {tag}
                          </span>
                        ))}
                        <button 
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); startEditingTags(paper); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 p-0.5 rounded"
                          title="Manage Tags"
                        >
                          <Tag size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                    <span className="text-xs text-gray-400">
                      Added {new Date(paper.uploadedAt).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => onSelectPaper(paper.id)}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:text-indigo-600"
                      >
                        Read <BookOpen size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;