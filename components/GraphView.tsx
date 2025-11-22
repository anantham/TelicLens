import React, { useEffect, useMemo, useState } from 'react';
import { AnalysisResult, GraphNode, GraphEdge, ViewMode, TraceResult } from '../types';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface GraphViewProps {
  data: AnalysisResult | null;
  mode: ViewMode;
  onNodeClick: (node: GraphNode) => void;
  traceHighlight: TraceResult | null;
}

// Helper to get node radius based on type
const getNodeRadius = (type: string) => {
    return type === 'intent' ? 35 : 25;
};

export const GraphView: React.FC<GraphViewProps> = ({ data, mode, onNodeClick, traceHighlight }) => {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Simple auto-layout algorithm
  useEffect(() => {
    if (!data) return;

    const newPositions: Record<string, { x: number; y: number }> = {};
    const width = 800; // Canvas coordinate space
    const height = 600;
    
    // Separate nodes by type or role
    const intents = data.nodes.filter(n => n.type === 'intent');
    const functions = data.nodes.filter(n => n.type === 'function' || n.type === 'file');
    const dataStores = data.nodes.filter(n => n.type === 'data');

    if (mode === ViewMode.CAUSAL) {
      // Causal Mode: Layered Left-to-Right Layout
      // Files -> Functions -> Data
      
      // 1. Files Layer
      const fileNodes = data.nodes.filter(n => n.type === 'file');
      fileNodes.forEach((node, i) => {
          newPositions[node.id] = { x: 100, y: 100 + i * 100 };
      });

      // 2. Function Layer (Middle) - Try to stagger
      const funcNodes = data.nodes.filter(n => n.type === 'function');
      const cols = Math.ceil(Math.sqrt(funcNodes.length));
      funcNodes.forEach((node, i) => {
          const col = i % 2; // 2 columns of functions
          const row = Math.floor(i / 2);
          newPositions[node.id] = { x: 350 + col * 150, y: 150 + row * 120 };
      });

      // 3. Data Layer (Right)
      dataStores.forEach((node, i) => {
          newPositions[node.id] = { x: 700, y: 200 + i * 150 };
      });

      // Intents: Top row in Causal view (just for reference)
      intents.forEach((node, i) => {
        newPositions[node.id] = { x: 200 + i * 200, y: 50 };
      });

    } else {
      // Telic Mode: Radial/Convergent Layout
      // Intents in center, Implementations orbiting
      const centerX = width / 2;
      const centerY = height / 2;
      
      // Place intents in a tight inner circle or line
      intents.forEach((node, i) => {
         // If multiple intents, spread them slightly
         const offset = (i - (intents.length - 1) / 2) * 120;
         newPositions[node.id] = { x: centerX + offset, y: centerY };
      });
      
      // Place others in orbit
      const others = [...functions, ...dataStores, ...data.nodes.filter(n => n.type === 'file')];
      const radius = 280;
      others.forEach((node, i) => {
        const angle = (i / others.length) * 2 * Math.PI - (Math.PI / 2); // Start from top
        newPositions[node.id] = {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle)
        };
      });
    }
    
    // Fallback for any unpositioned nodes (e.g. new nodes added dynamically)
    data.nodes.forEach(n => {
      if (!newPositions[n.id]) newPositions[n.id] = { x: Math.random() * width, y: Math.random() * height };
    });

    setPositions(newPositions);
  }, [data, mode]);

  // Detect redundant nodes (nodes with no dependents - nothing depends on them)
  const redundantNodeIds = useMemo(() => {
    if (!data) return new Set<string>();

    const nodesWithDependents = new Set<string>();

    // Find all nodes that are sources of edges (have things depending on them)
    data.edges.forEach(edge => {
      nodesWithDependents.add(edge.source);
    });

    // Nodes that are NOT sources of any edges are redundant
    const redundant = new Set<string>();
    data.nodes.forEach(node => {
      // Skip intent nodes from redundancy check
      if (node.type !== 'intent' && !nodesWithDependents.has(node.id)) {
        redundant.add(node.id);
      }
    });

    return redundant;
  }, [data]);

  // Zoom handler
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.max(0.1, Math.min(5, prev * delta)));
  };

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Reset view
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  if (!data) return <div className="flex items-center justify-center h-full text-neutral-500 font-mono text-sm animate-pulse">AWAITING CODEBASE...</div>;

  return (
    <div className="relative w-full h-full overflow-hidden bg-neutral-950 rounded-xl border border-neutral-800 shadow-2xl">
      <div className="absolute top-4 right-4 px-3 py-1 bg-black/80 backdrop-blur-sm text-[10px] font-bold tracking-widest text-neutral-500 rounded border border-neutral-800 pointer-events-none uppercase z-10">
        MODE: {mode}
      </div>

      {/* Zoom Controls */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
        <button
          onClick={() => setZoom(prev => Math.min(5, prev * 1.2))}
          className="p-2 bg-black/80 backdrop-blur-sm border border-neutral-800 rounded hover:bg-neutral-800 transition-colors"
          title="Zoom In"
        >
          <ZoomIn size={16} className="text-neutral-400" />
        </button>
        <button
          onClick={() => setZoom(prev => Math.max(0.1, prev * 0.8))}
          className="p-2 bg-black/80 backdrop-blur-sm border border-neutral-800 rounded hover:bg-neutral-800 transition-colors"
          title="Zoom Out"
        >
          <ZoomOut size={16} className="text-neutral-400" />
        </button>
        <button
          onClick={resetView}
          className="p-2 bg-black/80 backdrop-blur-sm border border-neutral-800 rounded hover:bg-neutral-800 transition-colors"
          title="Reset View"
        >
          <Maximize2 size={16} className="text-neutral-400" />
        </button>
        <div className="px-2 py-1 bg-black/80 backdrop-blur-sm border border-neutral-800 rounded text-[10px] text-neutral-500 text-center font-mono">
          {Math.round(zoom * 100)}%
        </div>
      </div>
      
      <svg
        className="w-full h-full select-none"
        viewBox={`${-pan.x / zoom} ${-pan.y / zoom} ${800 / zoom} ${600 / zoom}`}
        preserveAspectRatio="xMidYMid meet"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <defs>
          {/* Standard Gray Arrow (Causal/Dependency) */}
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#404040" />
          </marker>
          
          {/* Purple Glow Arrow (Telic/Intent) */}
          <marker id="arrowhead-telic" markerWidth="12" markerHeight="9" refX="11" refY="4.5" orient="auto">
             <path d="M0,0 L12,4.5 L0,9 L3,4.5 Z" fill="#a855f7" />
          </marker>

          {/* Blue Arrow (Data Flow) */}
           <marker id="arrowhead-flow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
          </marker>

          {/* Glow Filters */}
          <filter id="glow-purple" x="-50%" y="-50%" width="200%" height="200%">
             <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
             <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
             </feMerge>
          </filter>
        </defs>
        
        {/* Edges */}
        {data.edges.map((edge, i) => {
          const startNode = data.nodes.find(n => n.id === edge.source);
          const endNode = data.nodes.find(n => n.id === edge.target);
          
          const startPos = positions[edge.source];
          const endPos = positions[edge.target];
          
          if (!startPos || !endPos || !startNode || !endNode) return null;

          // Geometric calculation for edge intersection
          const dx = endPos.x - startPos.x;
          const dy = endPos.y - startPos.y;
          const angle = Math.atan2(dy, dx);
          
          // Node Radii
          const startR = getNodeRadius(startNode.type);
          const endR = getNodeRadius(endNode.type);
          const padding = 5; // Gap between arrow tip and node

          // Calculate start and end points on the circumference
          const x1 = startPos.x + Math.cos(angle) * startR;
          const y1 = startPos.y + Math.sin(angle) * startR;
          const x2 = endPos.x - Math.cos(angle) * (endR + padding);
          const y2 = endPos.y - Math.sin(angle) * (endR + padding);

          // Styling based on edge type
          const isTelicEdge = edge.type === 'serves_intent';
          const isFlowEdge = edge.type === 'flow';
          
          let strokeColor = '#333';
          let markerId = 'url(#arrowhead)';
          let strokeWidth = 1;
          let opacity = 1;

          if (mode === ViewMode.TELIC) {
             if (isTelicEdge) {
                 strokeColor = '#a855f7'; // Purple
                 markerId = 'url(#arrowhead-telic)';
                 strokeWidth = 1.5;
                 opacity = 1;
             } else {
                 strokeColor = '#333';
                 opacity = 0.15; // Fade out non-telic edges
             }
          } else {
             // Causal Mode
             if (isTelicEdge) {
                 opacity = 0; // Hide intent edges in causal mode mostly
             } else if (isFlowEdge) {
                 strokeColor = '#3b82f6'; // Blue
                 markerId = 'url(#arrowhead-flow)';
                 strokeWidth = 1.5;
             }
          }
          
          // TRACE LOGIC:
          // If a trace is active, dim edges that aren't part of the trace nodes
          if (traceHighlight && opacity > 0) {
             const isStartInTrace = traceHighlight.relatedNodeIds.includes(edge.source);
             const isEndInTrace = traceHighlight.relatedNodeIds.includes(edge.target);
             if (isStartInTrace && isEndInTrace) {
                 opacity = 1;
                 strokeWidth = 2; // Thicken tracing edges
             } else {
                 opacity = 0.05; // Heavily dim others
             }
          }

          if (opacity === 0) return null;

          // Create curved path instead of straight line
          // Use quadratic bezier curve for smoother flow
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;

          // Calculate perpendicular offset for curve control point
          const perpAngle = angle + Math.PI / 2;
          const curveStrength = 30; // How pronounced the curve is
          const controlX = midX + Math.cos(perpAngle) * curveStrength;
          const controlY = midY + Math.sin(perpAngle) * curveStrength;

          const pathData = `M ${x1} ${y1} Q ${controlX} ${controlY}, ${x2} ${y2}`;

          return (
            <g key={i} opacity={opacity} className="transition-all duration-500">
              <path
                d={pathData}
                fill="none"
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                markerEnd={markerId}
                strokeDasharray={isTelicEdge ? "3,3" : ""}
              />
            </g>
          );
        })}

        {/* Nodes */}
        {data.nodes.map((node) => {
          const pos = positions[node.id];
          if (!pos) return null;
          
          const isIntent = node.type === 'intent';
          const radius = getNodeRadius(node.type);
          const isRedundant = redundantNodeIds.has(node.id);

          // Colors
          let fillColor = '#171717';
          let strokeColor = '#404040';

          if (isRedundant) {
              // Redundant nodes get red highlighting
              fillColor = '#450a0a';
              strokeColor = '#ef4444';
          } else if (node.type === 'intent') {
              fillColor = '#2e1065';
              strokeColor = '#a855f7';
          } else if (node.type === 'data') {
              fillColor = '#0f172a';
              strokeColor = '#3b82f6';
          } else if (node.type === 'function') {
              fillColor = '#052e16';
              strokeColor = '#22c55e';
          } else if (node.type === 'file') {
              fillColor = '#171717';
              strokeColor = '#737373';
          }
          
          // Base Opacity
          let opacity = 1;

          // In CAUSAL mode, hide intent nodes
          if (mode === ViewMode.CAUSAL && isIntent) {
              opacity = 0;
          }

          // In TELIC mode, dim non-intent nodes slightly
          if (mode === ViewMode.TELIC && !isIntent) {
              opacity = 0.6;
          }
          
          // Trace Opacity Override
          if (traceHighlight) {
              if (traceHighlight.relatedNodeIds.includes(node.id)) {
                  opacity = 1; // Spotlight!
              } else {
                  opacity = 0.1; // Dim out
              }
          }

          // Skip rendering if completely invisible
          if (opacity === 0) return null;

          const filter = isIntent && mode === ViewMode.TELIC ? "url(#glow-purple)" : undefined;

          return (
            <g
              key={node.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              className="cursor-pointer transition-all duration-300 group"
              onClick={() => onNodeClick(node)}
              onMouseEnter={() => setHoveredNode(node)}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ opacity }}
            >
              {/* Glow effect behind node */}
              {isIntent && <circle r={radius + 5} fill={strokeColor} opacity="0.2" className="animate-pulse" />}
              
              <circle 
                r={radius} 
                fill={fillColor} 
                stroke={strokeColor} 
                strokeWidth={isIntent ? 2 : 1.5} 
                filter={filter}
                className="transition-transform duration-200 group-hover:scale-105" 
              />
              
              {/* Icon / Label */}
              <text 
                  y={5} 
                  textAnchor="middle" 
                  fill={isIntent ? "#e9d5ff" : "#d4d4d4"} 
                  fontSize={isIntent ? "10" : "9"} 
                  className="font-mono pointer-events-none font-semibold"
              >
                {node.label.length > 12 ? node.label.substring(0, 10) + '..' : node.label}
              </text>
              
              {/* Subtype Label (Top) */}
              {isIntent && (
                <text y={-radius - 8} textAnchor="middle" fill="#a855f7" fontSize="9" fontWeight="bold" className="uppercase tracking-widest">
                  INTENT
                </text>
              )}
              {!isIntent && (
                <text y={-radius - 5} textAnchor="middle" fill={strokeColor} fontSize="7" className="uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                  {node.type}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Hover Tooltip */}
      {hoveredNode && (
        <div
          className="absolute pointer-events-none z-20 bg-black/95 backdrop-blur-sm border border-neutral-700 rounded-lg p-3 shadow-2xl max-w-xs"
          style={{
            left: mousePos.x + 15,
            top: mousePos.y + 15,
          }}
        >
          <div className="font-mono text-sm font-bold text-white mb-1">
            {hoveredNode.label}
          </div>

          {hoveredNode.type && (
            <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-2">
              {hoveredNode.type}
              {redundantNodeIds.has(hoveredNode.id) && (
                <span className="ml-2 text-red-400 font-bold">⚠ REDUNDANT</span>
              )}
            </div>
          )}

          {mode === ViewMode.TELIC && hoveredNode.intent && (
            <div className="text-xs text-purple-300 mb-2 border-l-2 border-purple-500 pl-2">
              <div className="text-[10px] uppercase text-purple-400 mb-1">Functionality:</div>
              {hoveredNode.intent}
            </div>
          )}

          {hoveredNode.description && (
            <div className="text-xs text-neutral-300 mt-2">
              {hoveredNode.description}
            </div>
          )}
        </div>
      )}
    </div>
  );
};