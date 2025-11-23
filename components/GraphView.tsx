import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { AnalysisResult, GraphNode, GraphEdge, ViewMode, TraceResult } from '../types';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import dagre from 'dagre';

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
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 800, height: 600 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Dagre-based auto layout to reduce crossings
  const computeLayout = useCallback(() => {
    if (!data) return;

    const g = new dagre.graphlib.Graph();
    const isCausal = mode === ViewMode.CAUSAL;

    g.setGraph({
      rankdir: isCausal ? 'LR' : 'TB',
      nodesep: 80,
      ranksep: 110,
      edgesep: 60,
      marginx: 80,
      marginy: 80
    });
    g.setDefaultEdgeLabel(() => ({}));

    // Decide which nodes participate in this layout
    const nodesForLayout = data.nodes.filter(n => {
      if (isCausal) {
        return n.type !== 'intent'; // keep code-centric nodes only
      }
      // Telic: include intents and functions serving intents
      if (n.type === 'intent') return true;
      return data.edges.some(e =>
        (e.type === 'serves_intent' && (e.source === n.id || e.target === n.id)) ||
        (e.type === 'supports_intent' && (e.source === n.id || e.target === n.id))
      );
    });

    // Add nodes with approximate size (label length to give dagre more room)
    nodesForLayout.forEach(node => {
      const radius = getNodeRadius(node.type);
      const labelWidth = Math.max(node.label.length * 7, 60);
      const width = radius * 2 + labelWidth;
      const height = radius * 2 + 20;
      g.setNode(node.id, { width, height });
    });

    // Choose edges relevant for each mode
    const layoutEdges = data.edges.filter(edge => {
      if (isCausal) {
        return edge.type === 'dependency' || edge.type === 'flow';
      }
      return edge.type === 'serves_intent' || edge.type === 'supports_intent';
    });

    layoutEdges.forEach(edge => {
      if (g.node(edge.source) && g.node(edge.target)) {
        g.setEdge(edge.source, edge.target);
      }
    });

    dagre.layout(g);

    const newPositions: Record<string, { x: number; y: number }> = {};
    g.nodes().forEach(id => {
      const nodeWithPos = g.node(id);
      if (nodeWithPos) {
        newPositions[id] = { x: nodeWithPos.x, y: nodeWithPos.y };
      }
    });

    // Fallback for any nodes not in dagre layout (place near origin)
    data.nodes.forEach(n => {
      if (!newPositions[n.id]) newPositions[n.id] = { x: 50, y: 50 };
    });

    setPositions(newPositions);

    // Size the viewBox to fit the dagre graph, with padding
    const graphWidth = (g.graph().width || 800) + 160;
    const graphHeight = (g.graph().height || 600) + 160;
    setViewBox({ x: 0, y: 0, width: graphWidth, height: graphHeight });
  }, [data, mode]);

  useEffect(() => {
    computeLayout();
  }, [computeLayout]);

  // Zoom handlers
  const handleZoom = (direction: 'in' | 'out') => {
    setViewBox(prev => {
      const factor = direction === 'in' ? 0.8 : 1.25;
      const newWidth = prev.width * factor;
      const newHeight = prev.height * factor;
      const dx = (newWidth - prev.width) / 2;
      const dy = (newHeight - prev.height) / 2;
      return {
        x: prev.x - dx,
        y: prev.y - dy,
        width: newWidth,
        height: newHeight
      };
    });
  };

  const handleReset = () => {
    setViewBox({ x: 0, y: 0, width: 800, height: 600 });
  };

  // Convert mouse coords to SVG coords (respects current viewBox)
  const getSvgCoordinates = (e: React.MouseEvent<SVGElement | SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const transformed = point.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
  };

  // Recenter to specific node
  const handleRecenter = (node: GraphNode) => {
    const pos = positions[node.id];
    if (!pos) return;

    setViewBox(prev => ({
      x: pos.x - prev.width / 2,
      y: pos.y - prev.height / 2,
      width: prev.width,
      height: prev.height
    }));
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const direction = e.deltaY > 0 ? 'out' : 'in';
    handleZoom(direction);
  };

  const handleNodeMouseDown = (e: React.MouseEvent<SVGGElement, MouseEvent>, node: GraphNode) => {
    e.stopPropagation();
    const svgPoint = getSvgCoordinates(e);
    const pos = positions[node.id];
    if (!pos) return;
    setDraggingNode(node.id);
    setDragOffset({ dx: svgPoint.x - pos.x, dy: svgPoint.y - pos.y });
  };

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (draggingNode) return; // ignore if starting a drag on a node
    if (e.button === 0 && e.target === svgRef.current) { // Left click on SVG background
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (draggingNode) {
      const svgPoint = getSvgCoordinates(e);
      setPositions(prev => ({
        ...prev,
        [draggingNode]: {
          x: svgPoint.x - dragOffset.dx,
          y: svgPoint.y - dragOffset.dy
        }
      }));
      return;
    }

    if (!isPanning) return;

    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;

    const svg = svgRef.current;
    if (!svg) return;

    const CTM = svg.getScreenCTM();
    if (!CTM) return;

    const scaleFactor = viewBox.width / svg.clientWidth;

    setViewBox(prev => ({
      ...prev,
      x: prev.x - dx * scaleFactor,
      y: prev.y - dy * scaleFactor
    }));

    setPanStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    if (draggingNode) {
      setDraggingNode(null);
      return;
    }
    setIsPanning(false);
  };

  if (!data) return <div className="flex items-center justify-center h-full text-neutral-500 font-mono text-sm animate-pulse">AWAITING CODEBASE...</div>;

  return (
    <div className="relative w-full h-full overflow-hidden bg-neutral-950 rounded-xl border border-neutral-800 shadow-2xl">
      {/* Mode Badge */}
      <div className="absolute top-4 right-4 px-3 py-1 bg-black/80 backdrop-blur-sm text-[10px] font-bold tracking-widest text-neutral-500 rounded border border-neutral-800 pointer-events-none uppercase z-10">
        MODE: {mode}
      </div>

      {/* Zoom Controls */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
        <button
          onClick={() => handleZoom('in')}
          className="p-2 bg-black/80 hover:bg-neutral-800 backdrop-blur-sm text-neutral-400 hover:text-white rounded border border-neutral-800 transition-colors"
          title="Zoom In (or use mouse wheel)"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={() => handleZoom('out')}
          className="p-2 bg-black/80 hover:bg-neutral-800 backdrop-blur-sm text-neutral-400 hover:text-white rounded border border-neutral-800 transition-colors"
          title="Zoom Out (or use mouse wheel)"
        >
          <ZoomOut size={16} />
        </button>
        <button
          onClick={handleReset}
          className="p-2 bg-black/80 hover:bg-neutral-800 backdrop-blur-sm text-neutral-400 hover:text-white rounded border border-neutral-800 transition-colors"
          title="Reset View"
        >
          <Maximize2 size={16} />
        </button>
      </div>

      {/* Instruction Hint */}
      <div className="absolute bottom-4 right-4 px-3 py-1 bg-black/60 backdrop-blur-sm text-[9px] text-neutral-600 rounded border border-neutral-800 pointer-events-none z-10">
        💡 Mouse wheel to zoom • Drag to pan • Double-click node to recenter
      </div>

      <svg
        ref={svgRef}
        className="w-full h-full select-none"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        preserveAspectRatio="xMidYMid meet"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
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
          const isSupportsIntentEdge = edge.type === 'supports_intent';
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
             } else if (isSupportsIntentEdge) {
                 // Intent hierarchy edges - brighter purple, thicker
                 strokeColor = '#c084fc'; // Lighter purple for intent-to-intent
                 markerId = 'url(#arrowhead-telic)';
                 strokeWidth = 2;
                 opacity = 1;
             } else {
                 strokeColor = '#333';
                 opacity = 0.15; // Fade out non-telic edges
             }
          } else {
             // Causal Mode
             if (isTelicEdge || isSupportsIntentEdge) {
                 opacity = 0; // Hide all intent edges in causal mode
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

          // Calculate midpoint for label
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;

          // Calculate label rotation to align with edge
          const labelAngle = Math.atan2(dy, dx) * (180 / Math.PI);
          // Keep label readable (don't flip upside down)
          const normalizedAngle = labelAngle > 90 || labelAngle < -90 ? labelAngle + 180 : labelAngle;

          return (
            <g key={i} opacity={opacity} className="transition-all duration-500">
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                markerEnd={markerId}
                strokeDasharray={isTelicEdge ? "3,3" : ""}
              />

              {/* Edge Label - only show in CAUSAL mode and if label exists */}
              {edge.label && mode === ViewMode.CAUSAL && !isTelicEdge && (
                <g transform={`translate(${midX}, ${midY})`}>
                  {/* Background rectangle for readability */}
                  <rect
                    x={-edge.label.length * 2.5}
                    y={-8}
                    width={edge.label.length * 5}
                    height={14}
                    fill="#000000"
                    opacity="0.8"
                    rx="2"
                  />
                  <text
                    textAnchor="middle"
                    dy="3"
                    fill={isFlowEdge ? "#60a5fa" : "#737373"}
                    fontSize="8"
                    className="font-mono font-semibold pointer-events-none"
                    transform={`rotate(${normalizedAngle})`}
                  >
                    {edge.label}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {data.nodes.map((node) => {
          const pos = positions[node.id];
          if (!pos) return null;
          
          const isIntent = node.type === 'intent';
          const radius = getNodeRadius(node.type);
          
          // Colors
          let fillColor = '#171717';
          let strokeColor = '#404040';
          
          if (node.type === 'intent') {
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
          
          // Base Opacity - hide intent nodes in CAUSAL mode
          let opacity = 1;

          if (mode === ViewMode.CAUSAL && isIntent) {
              opacity = 0; // Hide intent nodes in causal view
          } else if (mode === ViewMode.TELIC && !isIntent) {
              opacity = 0.6; // Dim non-intent nodes in telic view
          }

          // Trace Opacity Override
          if (traceHighlight) {
              if (traceHighlight.relatedNodeIds.includes(node.id)) {
                  opacity = 1; // Spotlight!
              } else {
                  opacity = 0.1; // Dim out
              }
          }

          // Don't render nodes with 0 opacity (unless in trace mode)
          if (opacity === 0 && !traceHighlight) return null;

          const filter = isIntent && mode === ViewMode.TELIC ? "url(#glow-purple)" : undefined;

          return (
            <g
              key={node.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              className="cursor-grab active:cursor-grabbing transition-all duration-300 group"
              onMouseDown={(e) => handleNodeMouseDown(e, node)}
              onClick={() => onNodeClick(node)}
              onDoubleClick={() => handleRecenter(node)}
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
    </div>
  );
};
