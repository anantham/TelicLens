import React, { useEffect, useState } from 'react';
import { CodeFile, GraphNode, AnalysisResult, SourceLocation, TraceMode } from '../types';
import { FileText, Box, Target, Upload, Code, Info, Network, FolderOpen } from 'lucide-react';

interface SidebarProps {
  files: CodeFile[];
  selectedNode: GraphNode | null;
  activeFile: CodeFile | null;
  sidebarMode: 'CODE' | 'DETAILS';
  setSidebarMode: (mode: 'CODE' | 'DETAILS') => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectFile: (file: CodeFile) => void;
  onTrace: (snippet: string, mode: TraceMode) => void;
  isTracing: boolean;
  highlightedText: string | null;
  analysis: AnalysisResult | null;
  locationNavigator: {
    locations: SourceLocation[];
    currentIndex: number;
    nodeContext: GraphNode;
  } | null;
  onNavigateNext: () => void;
  onNavigatePrevious: () => void;
  onCloseNavigator: () => void;
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
  isTracing,
  highlightedText,
  analysis,
  locationNavigator,
  onNavigateNext,
  onNavigatePrevious,
  onCloseNavigator
}) => {
  const [selectedText, setSelectedText] = useState('');
  const [selectionRect, setSelectionRect] = useState<{top: number, left: number} | null>(null);

  // Drag & Drop state
  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const [traceMode, setTraceMode] = useState<TraceMode>('data');

  const currentLocation = locationNavigator ? locationNavigator.locations[locationNavigator.currentIndex] : null;
  const safeFileName = activeFile ? activeFile.name.replace(/[^a-zA-Z0-9_-]/g, '-') : '';

  // Auto-scroll to the highlighted location when it changes
  useEffect(() => {
    if (!currentLocation || !activeFile) return;
    if (currentLocation.file !== activeFile.name) return;

    const targetId = `code-line-${safeFileName}-${currentLocation.startLine}`;
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentLocation, activeFile, safeFileName]);

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

  // Drag & Drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev + 1);
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev - 1);
    if (dragCounter - 1 === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setDragCounter(0);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Create a synthetic event to reuse existing onFileUpload handler
      const syntheticEvent = {
        target: {
          files: e.dataTransfer.files,
          value: ''
        }
      } as React.ChangeEvent<HTMLInputElement>;

      onFileUpload(syntheticEvent);
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
                    onTrace(selectedText, traceMode);
                    setSelectedText('');
                    setSelectionRect(null);
                    window.getSelection()?.removeAllRanges();
                }}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded shadow-xl border border-blue-400"
            >
                <Network size={12} />
                {traceMode === 'journey' ? 'TRACE JOURNEY' : 'TRACE FLOW'}
            </button>
        </div>
      )}

      {/* Header */}
      <div className="p-4 border-b border-neutral-800">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
          <h1 className="text-lg font-bold text-white tracking-wider">TELIC<span className="text-neutral-500">LENS</span></h1>
        </div>
        <p className="text-xs text-neutral-500">AI Flow & Journey Inspector</p>
      </div>

      {/* Trace Mode Toggle */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-800 bg-neutral-950/60">
        <span className="text-[10px] text-neutral-500 uppercase font-semibold">Trace Mode</span>
        <div className="flex gap-2">
          <button
            onClick={() => setTraceMode('data')}
            className={`px-2 py-1 text-[10px] rounded border ${traceMode === 'data' ? 'border-blue-500 text-blue-200 bg-blue-900/30' : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'}`}
          >
            Data Flow
          </button>
          <button
            onClick={() => setTraceMode('journey')}
            className={`px-2 py-1 text-[10px] rounded border ${traceMode === 'journey' ? 'border-green-500 text-green-200 bg-green-900/30' : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'}`}
          >
            User Journey
          </button>
        </div>
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

                {/* Show functions that serve this intent */}
                {selectedNode.type === 'intent' && analysis && (
                  <div className="space-y-2">
                    <h3 className="text-xs text-neutral-400 uppercase font-semibold">Implemented By</h3>
                    {(() => {
                      const servingEdges = analysis.edges.filter(
                        e => e.target === selectedNode.id && e.type === 'serves_intent'
                      );
                      const servingNodes = servingEdges
                        .map(e => ({
                          node: analysis.nodes.find(n => n.id === e.source),
                          edge: e
                        }))
                        .filter(item => item.node);

                      if (servingNodes.length === 0) {
                        return <p className="text-xs text-neutral-500 italic">No implementations found</p>;
                      }

                      return (
                        <ul className="space-y-2">
                          {servingNodes.map(({ node, edge }, i) => (
                            <li
                              key={i}
                              onClick={() => node && onSelectFile && files.find(f => f.content.includes(node.label))}
                              className="p-2 bg-purple-900/10 border border-purple-500/20 rounded cursor-pointer hover:bg-purple-900/20 transition-colors"
                            >
                              <div className="flex items-start gap-2">
                                <Box size={12} className="text-purple-400 mt-0.5 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-mono text-purple-200 font-semibold">{node?.label}</div>
                                  {edge.label && (
                                    <div className="text-[10px] text-neutral-500 mt-0.5 italic">"{edge.label}"</div>
                                  )}
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      );
                    })()}
                  </div>
                )}

                {/* Edges related to this node */}
                {analysis && selectedNode && (
                  <div className="space-y-2">
                    <h3 className="text-xs text-neutral-400 uppercase font-semibold">Edges</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 bg-neutral-800/60 rounded border border-neutral-800">
                        <div className="text-[10px] text-neutral-500 uppercase mb-1">Incoming</div>
                        <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                          {analysis.edges.filter(e => e.target === selectedNode.id).map((e, idx) => {
                            const src = analysis.nodes.find(n => n.id === e.source);
                            return (
                              <div key={idx} className="text-[10px] text-neutral-300 leading-snug border border-neutral-700 rounded px-2 py-1 bg-neutral-900/60">
                                <div className="font-mono text-neutral-200">{src?.label || e.source}</div>
                                {e.label && <div className="text-neutral-500 italic">“{e.label}”</div>}
                                {e.reason && <div className="text-neutral-400">Reason: {e.reason}</div>}
                                {e.role && <div className={`text-[10px] font-semibold ${e.role === 'undermines' ? 'text-red-400' : 'text-green-400'}`}>{e.role}</div>}
                              </div>
                            );
                          })}
                          {analysis.edges.filter(e => e.target === selectedNode.id).length === 0 && (
                            <div className="text-[10px] text-neutral-600 italic">No incoming edges</div>
                          )}
                        </div>
                      </div>
                      <div className="p-2 bg-neutral-800/60 rounded border border-neutral-800">
                        <div className="text-[10px] text-neutral-500 uppercase mb-1">Outgoing</div>
                        <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                          {analysis.edges.filter(e => e.source === selectedNode.id).map((e, idx) => {
                            const tgt = analysis.nodes.find(n => n.id === e.target);
                            return (
                              <div key={idx} className="text-[10px] text-neutral-300 leading-snug border border-neutral-700 rounded px-2 py-1 bg-neutral-900/60">
                                <div className="font-mono text-neutral-200">{tgt?.label || e.target}</div>
                                {e.label && <div className="text-neutral-500 italic">“{e.label}”</div>}
                                {e.reason && <div className="text-neutral-400">Reason: {e.reason}</div>}
                                {e.role && <div className={`text-[10px] font-semibold ${e.role === 'undermines' ? 'text-red-400' : 'text-green-400'}`}>{e.role}</div>}
                              </div>
                            );
                          })}
                          {analysis.edges.filter(e => e.source === selectedNode.id).length === 0 && (
                            <div className="text-[10px] text-neutral-600 italic">No outgoing edges</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

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
                 <div className="flex-1 overflow-auto bg-neutral-900/80">
                    {locationNavigator && currentLocation && (
                      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-2 bg-blue-900/30 border-b border-blue-700/30 backdrop-blur">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-blue-200 uppercase font-semibold">TelicLens Navigator</span>
                          <span className="text-xs font-mono text-blue-100">
                            {locationNavigator.nodeContext.label} • {currentLocation.file}:{currentLocation.startLine}-{currentLocation.endLine}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-blue-100 font-mono">
                            {locationNavigator.currentIndex + 1} / {locationNavigator.locations.length}
                          </span>
                          <button
                            onClick={onNavigatePrevious}
                            className="px-2 py-1 text-[10px] bg-blue-800 hover:bg-blue-700 text-white rounded disabled:opacity-40 transition-colors"
                            disabled={locationNavigator.locations.length <= 1}
                          >
                            ← Prev
                          </button>
                          <button
                            onClick={onNavigateNext}
                            className="px-2 py-1 text-[10px] bg-blue-800 hover:bg-blue-700 text-white rounded disabled:opacity-40 transition-colors"
                            disabled={locationNavigator.locations.length <= 1}
                          >
                            Next →
                          </button>
                          <button
                            onClick={onCloseNavigator}
                            className="px-2 py-1 text-[10px] text-blue-200 hover:text-white"
                            title="Close navigator"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="p-4">
                      <code className="font-mono text-xs text-neutral-300 block pb-12">
                          {activeFile.content.split('\n').map((line, i) => {
                              const lineNumber = i + 1;
                              const inLocationRange = currentLocation
                                && activeFile.name === currentLocation.file
                                && lineNumber >= currentLocation.startLine
                                && lineNumber <= currentLocation.endLine;
                              const shouldShowComment = currentLocation
                                && activeFile.name === currentLocation.file
                                && currentLocation.aiComment
                                && lineNumber === currentLocation.startLine;

                              const textHighlighted = highlightedText && line.includes(highlightedText);
                              const showHighlight = inLocationRange || textHighlighted;

                              return (
                                <React.Fragment key={i}>
                                  {shouldShowComment && (
                                    <div className="flex min-w-fit bg-blue-900/20 border-l-2 border-blue-500/70 px-3 py-2 mb-1">
                                      <span className="text-neutral-600 select-none w-8 text-right pr-3 flex-shrink-0">//</span>
                                      <div className="whitespace-pre-wrap text-[11px] text-blue-100 leading-snug">
                                        <div className="font-semibold text-blue-200">TelicLens: {locationNavigator?.nodeContext.label}</div>
                                        <div>{currentLocation.aiComment}</div>
                                      </div>
                                    </div>
                                  )}

                                  <div
                                      id={`code-line-${safeFileName}-${lineNumber}`}
                                      className={`flex hover:bg-neutral-800/50 min-w-fit ${
                                          showHighlight ? 'bg-yellow-900/30 border-l-2 border-yellow-500' : ''
                                      }`}
                                  >
                                      <span className="text-neutral-600 select-none w-8 text-right pr-3 flex-shrink-0">{lineNumber}</span>
                                      <span className="whitespace-pre">{line}</span>
                                  </div>
                                </React.Fragment>
                              );
                          })}
                      </code>
                    </div>
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

      {/* File List with Drag & Drop */}
      <div
        className={`p-4 border-t border-neutral-800 bg-neutral-950 h-48 flex flex-col relative transition-all ${
          isDragging ? 'border-blue-500 border-2 bg-blue-900/20' : ''
        }`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag Overlay */}
        {isDragging && (
          <div className="absolute inset-0 bg-blue-900/40 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in">
            <div className="flex flex-col items-center gap-2 text-blue-200">
              <Upload size={32} className="animate-bounce" />
              <span className="text-sm font-bold">Drop files here</span>
            </div>
          </div>
        )}

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

        {files.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-600 border-2 border-dashed border-neutral-800 rounded-lg">
            <Upload size={32} className="mb-2 opacity-50" />
            <p className="text-xs text-center font-bold">Drag files here</p>
            <p className="text-[10px] text-center text-neutral-700 mt-1">or use the buttons above</p>
          </div>
        ) : (
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
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
