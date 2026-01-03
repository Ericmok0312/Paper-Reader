import React from 'react';
import { Note, PaperMetadata } from '../types';
import { ArrowLeft, Share2, Tag, Link as LinkIcon, FileText } from 'lucide-react';

interface KnowledgeGraphProps {
  papers: PaperMetadata[];
  allNotes: Note[];
  onBack: () => void;
  onOpenPaper: (id: string) => void;
}

const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ papers, allNotes, onBack, onOpenPaper }) => {
  // Extract all unique tags and their associated notes
  const tagMap = new Map<string, { notes: Note[], paperIds: Set<string> }>();
  
  allNotes.forEach(note => {
    note.tags.forEach(tag => {
      const normalized = tag.toLowerCase();
      if (!tagMap.has(normalized)) {
        tagMap.set(normalized, { notes: [], paperIds: new Set() });
      }
      const entry = tagMap.get(normalized)!;
      entry.notes.push(note);
      entry.paperIds.add(note.paperId);
    });
  });

  const sortedTags = Array.from(tagMap.entries()).sort((a, b) => b[1].notes.length - a[1].notes.length);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Share2 size={24} className="text-indigo-600" /> Knowledge Network
          </h1>
        </div>
        <div className="text-sm text-slate-500 font-medium">
          {tagMap.size} Concepts Linked across {allNotes.length} Notes
        </div>
      </header>

      <main className="flex-1 p-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedTags.map(([tag, data]) => (
            <div key={tag} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tag size={16} className="text-indigo-500" />
                  <span className="font-bold text-slate-800 capitalize">{tag}</span>
                </div>
                <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter">
                  {data.notes.length} Connections
                </span>
              </div>
              
              <div className="flex-1 p-4 space-y-4">
                {data.notes.map(note => {
                  const paper = papers.find(p => p.id === note.paperId);
                  return (
                    <div key={note.id} className="group cursor-pointer" onClick={() => onOpenPaper(note.paperId)}>
                      <div className="flex items-start gap-2 mb-1">
                        <FileText size={12} className="text-slate-400 mt-0.5" />
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-tight group-hover:text-indigo-600 transition-colors">
                          {paper?.title || 'Unknown Paper'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2 pl-5 italic border-l-2 border-slate-100 group-hover:border-indigo-200 transition-all">
                        "{note.comment || note.quote.substring(0, 50) + '...'}"
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="p-3 bg-slate-50/50 border-t border-slate-100 flex items-center gap-2">
                <LinkIcon size={12} className="text-slate-400" />
                <span className="text-[10px] font-medium text-slate-400">
                  Links {data.paperIds.size} unique papers
                </span>
              </div>
            </div>
          ))}
        </div>
        
        {sortedTags.length === 0 && (
          <div className="h-[60vh] flex flex-col items-center justify-center text-center">
             <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
               <Share2 size={40} className="text-slate-300" />
             </div>
             <h2 className="text-lg font-bold text-slate-800">Your Knowledge Graph is empty</h2>
             <p className="text-slate-500 max-w-xs mt-1">Start adding tags to your notes in the reader to see conceptual connections appear here.</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default KnowledgeGraph;