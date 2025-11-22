import React, { useState } from 'react';
import { CodeFile, GraphNode } from '../types';
import { FileText, Box, Target, Upload, Code, Info, Network, FolderOpen } from 'lucide-react';

interface SidebarProps {
  files: CodeFile[];
  selectedNode: GraphNode | null;
  activeFile: CodeFile | null;
  sidebarMode: 'CODE' | 'DETAILS';
  setSidebarMode: (mode: 'CODE' | 'DETAILS') => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectFile: (file: CodeFile) => void;
  onTrace: (snippet: string) => void;
  isTracing: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  files, 
  selectedNode, 
  activeFile,
  sidebarMode,
  setSidebarMode,
  onFileUpload,
  onSelectFile,
  onTrace,
  isTracing
}) => {
  const [selectedText, setSelectedText] = useState('');
  const [selectionRect, setSelectionRect] = useState<{top: number, left: number} | null>(null);

  const handleMouseUp = (e: React.MouseEvent) => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0 && sidebarMode === 'CODE') {
        const text = selection.toString();
        setSelectedText(text);
        
        // Calculate position for floating button
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // Adjust for container offset (rough estimation for prototype)
        setSelectionRect({
            top: rect.bottom + 5,
            left: rect.left
        });
    } else {
        setSelectedText('');
        setSelectionRect(null);
    }
  };

  return (
    <div className="w-96 h-full bg-neutral-900 border-r border-neutral-800 flex flex-col relative" onMouseUp={handleMouseUp}>
      
      {/* Floating Trace Button */}
      {selectedText && selectionRect && sidebarMode === 'CODE' && (
        <div 
            className="fixed z-50 animate-in zoom-in-50 duration-200"
            style={{ top: selectionRect.top, left: selectionRect.left }}
        >
            <button 
                onClick={(e) => {
                    e.stopPropagation();
                    onTrace(selectedText);
                    setSelectedText('');
                    setSelectionRect(null);
                    window.getSelection()?.removeAllRanges();
                }}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded shadow-xl border border-blue-400"
            >
                <Network size={12} />
                TRACE FLOW
            </button>
        </div>
      )}

      {/* Header */}
      <div className="p-4 border-b border-neutral-800">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
          <h1 className="text-lg font-bold text-white tracking-wider">TELIC<span className="text-neutral-500">LENS</span></h1>
        </div>
        <p className="text-xs text-neutral-500">AI Intention Inspector</p>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-neutral-800">
        <button 
          onClick={() => setSidebarMode('DETAILS')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold transition-colors ${sidebarMode === 'DETAILS' ? 'bg-neutral-800 text-white border-b-2 border-red-500' : 'text-neutral-500 hover:bg-neutral-800/50'}`}
        >
          <Info size={14} />
          INSPECTOR
        </button>
        <button 
          onClick={() => setSidebarMode('CODE')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold transition-colors ${sidebarMode === 'CODE' ? 'bg-neutral-800 text-white border-b-2 border-blue-500' : 'text-neutral-500 hover:bg-neutral-800/50'}`}
        >
          <Code size={14} />
          SOURCE
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto bg-neutral-900/50 relative">
        
        {sidebarMode === 'DETAILS' && (
          <div className="p-4 h-full">
            {selectedNode ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
                <div className="pb-2 border-b border-neutral-800">
                  <span className="text-xs font-mono text-neutral-500 uppercase">{selectedNode.type} NODE</span>
                  <h2 className="text-xl font-bold text-white mt-1">{selectedNode.label}</h2>
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-xs text-neutral-400 uppercase font-semibold">Description</h3>
                  <p className="text-sm text-neutral-300 leading-relaxed">{selectedNode.description || "No description available."}</p>
                </div>

                {selectedNode.intent && (
                  <div className="p-3 bg-purple-900/20 border border-purple-500/30 rounded-lg">
                    <h3 className="text-xs text-purple-400 uppercase font-semibold mb-1 flex items-center gap-2">
                      <Target size={12} /> Telic Intent
                    </h3>
                    <p className="text-sm text-purple-200 italic">"{selectedNode.intent}"</p>
                  </div>
                )}

                {(selectedNode.inputs || selectedNode.outputs) && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-neutral-800 rounded">
                        <span className="text-xs text-neutral-500 block mb-1">Inputs</span>
                        <span className="text-sm text-neutral-300">{selectedNode.inputs?.length || 0} items</span>
                    </div>
                    <div className="p-2 bg-neutral-800 rounded">
                        <span className="text-xs text-neutral-500 block mb-1">Outputs</span>
                        <span className="text-sm text-neutral-300">{selectedNode.outputs?.length || 0} items</span>
                    </div>
                  </div>
                )}
                
                <div className="pt-4">
                    <button className="w-full py-2 bg-neutral-800 hover:bg-red-900/30 text-red-400 text-xs border border-neutral-700 hover:border-red-500/50 rounded transition-colors group">
                        SIMULATE BREAKAGE <span className="group-hover:text-red-200">(x100)</span>
                    </button>
                    <p className="text-[10px] text-neutral-600 mt-1 text-center">
                        Adjust parameter magnitude to test robustness.
                    </p>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-neutral-600">
                <Box size={48} strokeWidth={1} className="mb-4 opacity-20" />
                <p className="text-sm text-center">Select a node from the graph<br/>to inspect details.</p>
              </div>
            )}
          </div>
        )}

        {sidebarMode === 'CODE' && (
          <div className="h-full flex flex-col">
            {activeFile ? (
              <div className="flex-1 flex flex-col min-h-0">
                 <div className="px-4 py-2 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between">
                    <span className="text-xs font-mono text-blue-400">{activeFile.name}</span>
                    <span className="text-[10px] text-neutral-600 uppercase">{activeFile.language}</span>
                 </div>
                 <div className="flex-1 overflow-auto p-4 bg-neutral-900/80">
                    <code className="font-mono text-xs text-neutral-300 block pb-12">
                        {activeFile.content.split('\n').map((line, i) => (
                            <div key={i} className="flex hover:bg-neutral-800/50 min-w-fit">
                                <span className="text-neutral-600 select-none w-8 text-right pr-3 flex-shrink-0">{i + 1}</span>
                                <span className="whitespace-pre">{line}</span>
                            </div>
                        ))}
                    </code>
                 </div>
                 {isTracing && (
                    <div className="absolute bottom-4 left-4 right-4 bg-blue-900/90 text-white p-3 rounded text-xs shadow-lg backdrop-blur animate-pulse border border-blue-500">
                        Analyzing trace flow for selected segment...
                    </div>
                 )}
              </div>
            ) : (
               <div className="h-full flex flex-col items-center justify-center text-neutral-600">
                <Code size={48} strokeWidth={1} className="mb-4 opacity-20" />
                <p className="text-sm text-center">Select a file from the list below<br/>to view source code.</p>
              </div>
            )}
          </div>
        )}

      </div>

      {/* File List */}
      <div className="p-4 border-t border-neutral-800 bg-neutral-950 h-48 flex flex-col">
        <div className="flex justify-between items-center mb-3 shrink-0">
            <h3 className="text-xs font-bold text-neutral-400 uppercase">Files ({files.length})</h3>
            <div className="flex gap-2">
              {/* Upload Files */}
              <label
                className="cursor-pointer p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300 transition-colors"
                title="Upload individual files"
              >
                  <Upload size={14} />
                  <input
                      type="file"
                      multiple
                      accept=".py,.js,.ts,.tsx,.jsx,.json,.html,.css,.java,.cpp,.c,.h,.rs,.go,.md,.txt"
                      className="hidden"
                      onChange={onFileUpload}
                  />
              </label>
              {/* Upload Folder */}
              <label
                className="cursor-pointer p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300 transition-colors"
                title="Upload entire folder"
              >
                  <FolderOpen size={14} />
                  <input
                      type="file"
                      multiple
                      // @ts-ignore - webkitdirectory is not in TypeScript definitions but widely supported
                      webkitdirectory=""
                      directory=""
                      accept=".py,.js,.ts,.tsx,.jsx,.json,.html,.css,.java,.cpp,.c,.h,.rs,.go,.md,.txt"
                      className="hidden"
                      onChange={onFileUpload}
                  />
              </label>
            </div>
        </div>
        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
          <ul className="space-y-1">
            {files.map((file, idx) => (
              <li 
                key={idx} 
                onClick={() => onSelectFile(file)}
                className={`flex items-center gap-2 text-xs p-1.5 rounded cursor-pointer transition-colors ${activeFile?.name === file.name ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-300'}`}
              >
                <FileText size={12} className={activeFile?.name === file.name ? "text-blue-400" : "text-neutral-600"} />
                <span className="truncate">{file.name}</span>
              </li>
            ))}
            {files.length === 0 && <li className="text-xs text-neutral-600 italic text-center py-4">No files loaded</li>}
          </ul>
        </div>
      </div>
    </div>
  );
};