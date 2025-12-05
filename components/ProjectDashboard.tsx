
import React from 'react';
import { Project } from '../types';
import { Plus, Film, Trash2, Calendar, Clapperboard, LayoutGrid } from 'lucide-react';
import { Button } from './Button';

interface ProjectDashboardProps {
  projects: Project[];
  onCreate: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
}

export const ProjectDashboard: React.FC<ProjectDashboardProps> = ({ 
  projects, 
  onCreate, 
  onSelect,
  onDelete 
}) => {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-8 md:p-12 overflow-y-auto custom-scrollbar">
      <div className="max-w-7xl mx-auto space-y-12">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-neutral-800 pb-8">
          <div className="space-y-2">
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-white tracking-tight flex items-center gap-3">
              <Film className="w-10 h-10 text-red-600" />
              Slop Board
            </h1>
            <p className="text-neutral-500 uppercase tracking-widest text-sm font-medium">Cinematic Project Manager</p>
          </div>
          <Button size="lg" onClick={onCreate} className="shadow-lg shadow-red-900/20">
            <Plus className="w-5 h-5 mr-2" /> New Project
          </Button>
        </div>

        {/* Project Grid */}
        {projects.length === 0 ? (
           <div className="flex flex-col items-center justify-center py-24 border border-dashed border-neutral-800 rounded-2xl bg-neutral-900/30">
               <div className="w-20 h-20 bg-neutral-900 rounded-full flex items-center justify-center mb-6">
                   <Clapperboard className="w-10 h-10 text-neutral-700" />
               </div>
               <h3 className="text-xl font-serif text-white mb-2">No Projects Yet</h3>
               <p className="text-neutral-500 mb-8 max-w-md text-center">Start your first cinematic storyboard sequence. Define characters, locations, and shots with AI assistance.</p>
               <Button size="lg" variant="secondary" onClick={onCreate}>
                  Start First Project
               </Button>
           </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map(project => {
              // Find first shot with an image to use as thumbnail
              const coverShot = project.shots.find(s => s.imageUrl);
              const shotCount = project.shots.length;
              const charCount = project.characters.length;
              const locCount = project.locations.length;

              return (
                <div 
                  key={project.id}
                  onClick={() => onSelect(project.id)}
                  className="group relative bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden hover:border-neutral-600 hover:shadow-2xl transition-all cursor-pointer flex flex-col h-64"
                >
                  {/* Thumbnail Area */}
                  <div className="h-32 bg-black relative overflow-hidden border-b border-neutral-800">
                    {coverShot ? (
                      <img 
                        src={coverShot.imageUrl} 
                        alt="Project Cover" 
                        className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity group-hover:scale-105 duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-neutral-950">
                        <LayoutGrid className="w-8 h-8 text-neutral-800" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 to-transparent opacity-80" />
                    
                    <button 
                        onClick={(e) => onDelete(project.id, e)}
                        className="absolute top-3 right-3 p-2 bg-black/50 text-neutral-400 hover:text-red-500 hover:bg-black rounded-full opacity-0 group-hover:opacity-100 transition-all z-10"
                        title="Delete Project"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Info Area */}
                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                        <h3 className="text-xl font-serif font-bold text-white group-hover:text-red-500 transition-colors truncate">
                            {project.title}
                        </h3>
                        <div className="text-xs text-neutral-500 mt-1 flex gap-3">
                            <span>{shotCount} Shots</span>
                            <span>•</span>
                            <span>{charCount} Characters</span>
                            <span>•</span>
                            <span>{locCount} Locations</span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-neutral-600 mt-4 border-t border-neutral-800 pt-3">
                        <div className="flex items-center gap-1.5">
                             <Calendar className="w-3 h-3" />
                             <span>Edited Recently</span>
                        </div>
                        <span className="uppercase tracking-wider font-bold text-[10px] bg-neutral-800 px-2 py-1 rounded text-neutral-400">
                            {project.settings.cinematographer.split(' ')[0]} Style
                        </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
