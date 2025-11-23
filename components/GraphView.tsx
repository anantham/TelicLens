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
  const [showRiskOverlay, setShowRiskOverlay] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoveredEdge, setHoveredEdge] = useState<{ edge: GraphEdge; midX: number; midY: number } | null>(null);

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

  const handleFit = () => {
    if (!positions || Object.keys(positions).length === 0) return;
    const xs = Object.values(positions).map(p => p.x);
    const ys = Object.values(positions).map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const padding = 80;
    setViewBox({
      x: minX - padding,
      y: minY - padding,
      width: (maxX - minX) + padding * 2,
      height: (maxY - minY) + padding * 2
    });
  };

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      try {
        await el.requestFullscreen();
        setIsFullscreen(true);
      } catch (e) {
        console.warn('Fullscreen request failed', e);
      }
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
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

  // Risk highlighting sets
  const riskSets = useMemo(() => {
    const orphanIds = new Set<string>(data?.telicAudit?.orphanNodes || []);
    const suspiciousIds = new Set<string>(data?.telicAudit?.suspiciousCapture || []);
    const contradictionEdgeIds = new Set<string>();
    (data?.telicAudit?.contradictions || []).forEach(item => {
      if (item.includes('->')) {
        contradictionEdgeIds.add(item);
      } else {
        // could be node id
        suspiciousIds.add(item);
      }
    });
    return { orphanIds, suspiciousIds, contradictionEdgeIds };
  }, [data]);

  // Map of edges that have a reciprocal counterpart (for curved rendering)
  const reciprocalEdges = useMemo(() => {
    const set = new Set<string>();
    const edgePairs = new Set<string>();
    if (!data) return set;
    data.edges.forEach(e => {
      const key = `${e.source}->${e.target}`;
      edgePairs.add(key);
    });
    data.edges.forEach(e => {
      const forward = `${e.source}->${e.target}`;
      const reverse = `${e.target}->${e.source}`;
      if (edgePairs.has(reverse)) {
        set.add(forward);
      }
    });
    return set;
  }, [data]);

  if (!data) return <div className="flex items-center justify-center h-full text-neutral-500 font-mono text-sm animate-pulse">AWAITING CODEBASE...</div>;

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-neutral-950 rounded-xl border border-neutral-800 shadow-2xl">
      {/* Mode Badge */}
      <div className="absolute top-4 right-4 px-3 py-1 bg-black/80 backdrop-blur-sm text-[10px] font-bold tracking-widest text-neutral-500 rounded border border-neutral-800 pointer-events-none uppercase z-10">
        MODE: {mode}
      </div>

      {/* Risk Legend */}
      {showRiskOverlay && (
        <div className="absolute bottom-4 right-4 px-3 py-2 bg-black/80 backdrop-blur-sm text-[10px] text-neutral-200 rounded border border-red-500/40 z-10 space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span>Undermines / Contradiction</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-300" />
            <span>Orphaned</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>Suspicious Capture</span>
          </div>
          <button
            onClick={() => setShowRiskOverlay(false)}
            className="w-full mt-1 px-2 py-1 bg-neutral-800 text-[10px] rounded border border-neutral-700 hover:border-neutral-500"
          >
            Hide
          </button>
        </div>
      )}

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
        <button
          onClick={handleFit}
          className="p-2 bg-black/80 hover:bg-neutral-800 backdrop-blur-sm text-neutral-400 hover:text-white rounded border border-neutral-800 transition-colors text-[10px]"
          title="Fit graph to view"
        >
          FIT
        </button>
        <button
          onClick={toggleFullscreen}
          className="p-2 bg-black/80 hover:bg-neutral-800 backdrop-blur-sm text-neutral-400 hover:text-white rounded border border-neutral-800 transition-colors text-[10px]"
          title="Toggle fullscreen"
        >
          {isFullscreen ? 'EXIT' : 'FULL'}
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
          const isUnderminesIntentEdge = edge.type === 'undermines_intent';
          const isFlowEdge = edge.type === 'flow';
          const edgeId = `${edge.source}->${edge.target}`;
          const isContradiction = riskSets.contradictionEdgeIds.has(edgeId);

          let strokeColor = '#333';
          let markerId = 'url(#arrowhead)';
          let strokeWidth = 1;
          let opacity = 1;
          let dashArray: string | undefined;

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
             } else if (isUnderminesIntentEdge) {
                 strokeColor = '#ef4444'; // Red for conflicts
                 markerId = 'url(#arrowhead)';
                 strokeWidth = 2.5;
                 opacity = 1;
                 dashArray = '5,4';
              } else if (isContradiction) {
                 strokeColor = '#ef4444';
                 markerId = 'url(#arrowhead)';
                 strokeWidth = 2.5;
                 opacity = 1;
                 dashArray = '5,4';
             } else {
                 strokeColor = '#333';
                 opacity = 0.15; // Fade out non-telic edges
             }
          } else {
             // Causal Mode
             if (isTelicEdge || isSupportsIntentEdge || isUnderminesIntentEdge) {
                 opacity = 0; // Hide all intent edges in causal mode
             } else if (isFlowEdge) {
                 strokeColor = '#3b82f6'; // Blue
                 markerId = 'url(#arrowhead-flow)';
                 strokeWidth = 1.5;
             }
          }
          
          // TRACE LOGIC:
          // If a trace is active, dim edges not in traceEdgeIds (or not connecting traced nodes)
          if (traceHighlight && opacity > 0) {
             const edgeId = `${edge.source}->${edge.target}`;
             const isEdgeTraced = traceHighlight.relatedEdgeIds.includes(edgeId);
             const isStartInTrace = traceHighlight.relatedNodeIds.includes(edge.source);
             const isEndInTrace = traceHighlight.relatedNodeIds.includes(edge.target);

             if (isEdgeTraced || (isStartInTrace && isEndInTrace)) {
                 opacity = 1;
                 strokeWidth = 2; // Thicken tracing edges
             } else {
                 opacity = 0.05; // Heavily dim others
             }
          }

          if (opacity === 0) return null;

          // Curve reciprocal edges to avoid overlap
          const hasReciprocal = reciprocalEdges.has(edgeId);
          const curveOffset = hasReciprocal ? 25 : 0;
          const nx = hasReciprocal ? (-(y2 - y1)) : 0;
          const ny = hasReciprocal ? (x2 - x1) : 0;
          const len = Math.hypot(nx, ny) || 1;
          const cx = (x1 + x2) / 2 + (nx / len) * curveOffset;
          const cy = (y1 + y2) / 2 + (ny / len) * curveOffset;

          // Quadratic midpoint for label
          const midX = (x1 + cx + x2) / 3;
          const midY = (y1 + cy + y2) / 3;

          // Calculate label rotation to align with edge
          const labelAngle = Math.atan2(dy, dx) * (180 / Math.PI);
          // Keep label readable (don't flip upside down)
          const normalizedAngle = labelAngle > 90 || labelAngle < -90 ? labelAngle + 180 : labelAngle;

          return (
            <g key={i} opacity={opacity} className="transition-all duration-500">
              <path
                d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
                fill="none"
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                markerEnd={markerId}
                strokeDasharray={dashArray || (isTelicEdge ? "3,3" : "")}
                onMouseEnter={() => setHoveredEdge({ edge, midX, midY })}
                onMouseLeave={() => setHoveredEdge(null)}
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

              {/* Hover Popover */}
              {hoveredEdge && hoveredEdge.edge === edge && (
                <g transform={`translate(${midX}, ${midY - 12})`}>
                  <rect
                    x={-80}
                    y={-18}
                    width={160}
                    height={36}
                    rx={4}
                    fill="#0f172a"
                    stroke="#475569"
                    opacity="0.95"
                  />
                  <text
                    textAnchor="middle"
                    dy="-2"
                    fill="#e2e8f0"
                    fontSize="9"
                    className="font-mono"
                  >
                    {edge.label || `${edge.source} -> ${edge.target}`}
                  </text>
                  {edge.reason && (
                    <text
                      textAnchor="middle"
                      dy="10"
                      fill="#94a3b8"
                      fontSize="8"
                      className="font-mono"
                    >
                      {edge.reason}
                    </text>
                  )}
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
          const isOrphan = riskSets.orphanIds.has(node.id);
          const isSuspicious = riskSets.suspiciousIds.has(node.id);
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

          // Risk styling
          const nodeStroke = isSuspicious ? '#ef4444' : strokeColor;
          const nodeFill = isOrphan ? '#1f2937' : fillColor;
          const nodeStrokeWidth = isSuspicious ? 3 : (isIntent ? 2 : 1.5);

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
                fill={nodeFill} 
                stroke={nodeStroke} 
                strokeWidth={nodeStrokeWidth} 
                filter={filter}
                className="transition-transform duration-200 group-hover:scale-105" 
              />
              
              {/* Icon / Label */}
              <text 
                  y={5} 
                  textAnchor="middle" 
                  fill={isIntent ? "#e9d5ff" : (isSuspicious ? "#fca5a5" : "#d4d4d4")} 
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
                <text y={-radius - 5} textAnchor="middle" fill={nodeStroke} fontSize="7" className="uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                  {node.type}
                  {isOrphan ? ' • ORPHAN' : ''}
                  {isSuspicious ? ' • RISK' : ''}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
