import React from 'react';
import { X, Check, Copy, Tag } from 'lucide-react';

interface ResultModalProps {
  title: string;
  data: any; // { tags: string[] } or { summary: string } or { reorganizedNote: string }
  onClose: () => void;
}

const ResultModal: React.FC<ResultModalProps> = ({ title, data, onClose }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    let textToCopy = "";
    if (data.tags) textToCopy = data.tags.join(', ');
    else if (data.summary) textToCopy = data.summary;
    else if (data.reorganizedNote) textToCopy = data.reorganizedNote;

    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[250] flex items-center justify-center backdrop-blur-[2px] animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full m-4 flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto bg-slate-50">
          {data.tags && (
            <div>
               <p className="text-sm text-gray-500 mb-3">Suggested Tags:</p>
               <div className="flex flex-wrap gap-2">
                 {data.tags.map((tag: string) => (
                   <span key={tag} className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-sm font-medium border border-indigo-200 flex items-center gap-1">
                     <Tag size={12} /> {tag}
                   </span>
                 ))}
               </div>
               <p className="text-xs text-gray-400 mt-4">Go back to your note to add these manually.</p>
            </div>
          )}

          {(data.summary || data.reorganizedNote) && (
            <div>
              <p className="text-sm text-gray-500 mb-2">AI Suggestion:</p>
              <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
                {data.summary || data.reorganizedNote}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-white rounded-b-xl">
          <button 
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied' : 'Copy Result'}
          </button>
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-bold hover:bg-gray-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResultModal;
