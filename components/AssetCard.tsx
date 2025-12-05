
import React, { useState, useRef, useEffect } from 'react';
import { Character, Location } from '../types';
import { RefreshCw, Sparkles, SendHorizontal, Upload, Trash2, Wand2, ImagePlus, Download } from 'lucide-react';
import { Button } from './Button';

interface AssetCardProps {
  item: Character | Location;
  type: 'Character' | 'Location';
  onGenerate: (id: string) => void;
  onEdit: (id: string, prompt: string) => void;
  onUpload: (id: string, file: File) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Character | Location>) => void;
}

export const AssetCard: React.FC<AssetCardProps> = ({ 
  item, 
  type, 
  onGenerate, 
  onEdit, 
  onUpload, 
  onDelete, 
  onUpdate 
}) => {
  const [editPrompt, setEditPrompt] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let timer: any;
    if (deleteConfirm) {
        timer = setTimeout(() => setDeleteConfirm(false), 3000);
    }
    return () => clearTimeout(timer);
  }, [deleteConfirm]);

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editPrompt.trim()) {
      onEdit(item.id, editPrompt);
      setEditPrompt('');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(item.id, e.target.files[0]);
    }
  };

  const triggerUpload = () => {
    if (fileInputRef.current) {
        fileInputRef.current.click();
    }
  };

  const handleDownload = () => {
    if (!item.imageUrl) return;
    const link = document.createElement('a');
    link.href = item.imageUrl;
    link.download = `${item.name.replace(/\s+/g, '-').toLowerCase()}-${type.toLowerCase()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteClick = () => {
      if (deleteConfirm) {
          onDelete(item.id);
      } else {
          setDeleteConfirm(true);
      }
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden flex flex-row h-52 hover:border-neutral-600 transition-colors shadow-sm">
      
      {/* Image Area - Fixed Width */}
      <div className="relative w-52 bg-black h-full flex-shrink-0 border-r border-neutral-800 group">
        
        {item.imageUrl ? (
          <>
            <img 
              src={item.imageUrl} 
              alt={item.name} 
              className="w-full h-full object-cover transition-opacity duration-300 group-hover:opacity-50"
            />
            
            {/* Overlay Actions (Visible on Hover) */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <Button 
                    size="sm" 
                    variant="primary" 
                    onClick={() => onGenerate(item.id)} 
                    isLoading={item.isGenerating} 
                    className="w-full shadow-lg"
                >
                    <RefreshCw className="w-3 h-3 mr-2" /> Regenerate
                </Button>
                
                <div className="flex gap-2 w-full">
                    <Button 
                        size="sm" 
                        variant="secondary" 
                        onClick={triggerUpload}
                        className="flex-1 shadow-lg bg-neutral-800/90 backdrop-blur"
                    >
                        <Upload className="w-3 h-3" />
                    </Button>
                    <Button 
                        size="sm" 
                        variant="secondary" 
                        onClick={handleDownload}
                        className="flex-1 shadow-lg bg-neutral-800/90 backdrop-blur"
                    >
                        <Download className="w-3 h-3" />
                    </Button>
                </div>
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="flex flex-col h-full p-3">
             <div className="flex-1 flex flex-col items-center justify-center text-neutral-600 space-y-2">
                <div className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800">
                    {type === 'Character' ? <Sparkles className="w-5 h-5 text-neutral-700" /> : <ImagePlus className="w-5 h-5 text-neutral-700" />}
                </div>
                <span className="text-[10px] uppercase tracking-widest font-medium">No Visual</span>
             </div>

             {/* Actions Grid */}
             <div className="grid grid-cols-2 gap-2 mt-auto">
                 <button 
                    onClick={() => onGenerate(item.id)}
                    disabled={item.isGenerating}
                    className="flex flex-col items-center justify-center p-2 bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300 transition-colors border border-neutral-700 hover:border-neutral-600"
                 >
                    {item.isGenerating ? (
                        <div className="w-4 h-4 border-2 border-neutral-500 border-t-white rounded-full animate-spin mb-1"></div>
                    ) : (
                        <Wand2 className="w-4 h-4 mb-1 text-red-500" />
                    )}
                    <span className="text-[9px] uppercase font-bold">AI Gen</span>
                 </button>

                 <button 
                    onClick={triggerUpload}
                    className="flex flex-col items-center justify-center p-2 bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300 transition-colors border border-neutral-700 hover:border-neutral-600"
                 >
                    <Upload className="w-4 h-4 mb-1 text-neutral-400" />
                    <span className="text-[9px] uppercase font-bold">Upload</span>
                 </button>
             </div>
          </div>
        )}

        {/* Status Badge */}
        {(item.isGenerating || item.isEditing) && (
          <div className="absolute top-2 right-2 bg-red-600 text-white text-[10px] uppercase font-bold px-2 py-1 rounded-full animate-pulse z-20 shadow-md">
            {item.isEditing ? "Editing" : "Rendering"}
          </div>
        )}

        <input 
            ref={fileInputRef} 
            type="file" 
            className="hidden" 
            accept="image/*" 
            onChange={handleFileChange}
        />
      </div>

      {/* Info / Edit Area */}
      <div className="p-5 flex-1 flex flex-col gap-3 overflow-hidden">
        <div className="flex justify-between items-start gap-4">
           <input 
             className="bg-transparent text-xl font-serif font-bold text-white border-b border-transparent hover:border-neutral-700 focus:border-red-600 focus:outline-none w-full pb-1 transition-colors"
             value={item.name}
             onChange={(e) => onUpdate(item.id, { name: e.target.value })}
             placeholder={`${type} Name`}
           />
           <button 
                onClick={handleDeleteClick} 
                className={`transition-colors p-1 ${deleteConfirm ? 'text-red-600 animate-pulse font-bold' : 'text-neutral-600 hover:text-red-500'}`}
                title={deleteConfirm ? "Click again to confirm" : "Delete"}
            >
             <Trash2 className="w-4 h-4" />
           </button>
        </div>
        
        <textarea
          className="bg-neutral-950/30 text-sm text-neutral-400 w-full resize-none border border-transparent hover:border-neutral-800 focus:border-neutral-700 rounded-md p-2 focus:outline-none flex-1 transition-all"
          value={item.description}
          onChange={(e) => onUpdate(item.id, { description: e.target.value })}
          placeholder="Visual description..."
        />

        {/* Edit Image Input */}
        {item.imageUrl && !item.isGenerating && !item.isEditing && (
           <form onSubmit={handleEditSubmit} className="mt-auto pt-2 flex gap-2">
             <div className="relative flex-1 group/input">
               <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                 <Sparkles className="h-3 w-3 text-neutral-500 group-focus-within/input:text-red-500 transition-colors" />
               </div>
               <input
                 type="text"
                 value={editPrompt}
                 onChange={(e) => setEditPrompt(e.target.value)}
                 placeholder={`Modify image with AI...`}
                 className="block w-full pl-9 pr-3 py-2 bg-neutral-950 border border-neutral-800 rounded-md text-xs text-neutral-200 placeholder-neutral-600 focus:ring-1 focus:ring-red-600 focus:border-red-600 transition-all outline-none"
               />
             </div>
             <button
                type="submit"
                disabled={!editPrompt.trim()}
                className="bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1 rounded-md disabled:opacity-50 transition-colors flex items-center justify-center border border-neutral-700"
             >
               <SendHorizontal className="w-3 h-3" />
             </button>
           </form>
        )}
      </div>
    </div>
  );
};
