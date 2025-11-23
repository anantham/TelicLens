import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { GraphView } from './components/GraphView';
import { analyzeCodebase, traceCodeSelection, clearAnalysisCache } from './services/geminiService';
import { CodeFile, AnalysisResult, ViewMode, GraphNode, TraceResult, SourceLocation, TraceMode } from './types';
import { Activity, Target, Loader2, Play, Network, Download, Settings } from 'lucide-react';
import { exportAsJSON, exportAsTextReport, exportAsMarkdown } from './utils/export';
import { getEstimatedTime, saveAnalysisMetric } from './utils/analysisMetrics';

const DEMO_FILES: CodeFile[] = [
  {
    name: 'main.py',
    language: 'python',
    content: `import auth_service
import ledger
import fraud_detection
from utils import Logger

def process_transaction(user_id, amount, currency="USD"):
    logger = Logger()
    logger.log(f"Starting transaction for {user_id}")

    # Step 1: Authentication
    token = auth_service.get_current_token()
    if not auth_service.verify_token(token):
        raise PermissionError("Invalid session")

    # Step 2: Security Check
    if fraud_detection.is_suspicious(user_id, amount):
        logger.alert("Fraud detected!")
        fraud_detection.flag_account(user_id)
        return {"status": "REJECTED", "reason": "Risk Check Failed"}

    # Step 3: Execution
    try:
        transaction_id = ledger.create_entry(user_id, amount, currency)
        ledger.commit(transaction_id)
        return {"status": "SUCCESS", "tx_id": transaction_id}
    except Exception as e:
        ledger.rollback(transaction_id)
        logger.error(f"Transaction failed: {e}")
        return {"status": "ERROR"}
`
  },
  {
    name: 'fraud_detection.py',
    language: 'python',
    content: `import ml_engine
from db import UserProfile

def is_suspicious(user_id, amount):
    # Intent: Protect ecosystem from malicious actors
    profile = UserProfile.get(user_id)
    
    # Rule-based check
    if amount > 10000 and profile.tier == "BASIC":
        return True
        
    # AI-based check
    risk_score = ml_engine.predict_risk(user_id, amount)
    return risk_score > 0.85

def flag_account(user_id):
    # Intent: Mitigate immediate threat
    UserProfile.update(user_id, status="FROZEN")
`
  },
  {
    name: 'ledger.py',
    language: 'python',
    content: `import database_pool
import encryption

def create_entry(user_id, amount, currency):
    # Intent: Ensure data consistency
    conn = database_pool.get_connection()
    
    # Encrypt sensitive financial data before storage
    encrypted_amount = encryption.encrypt_value(amount)
    
    query = "INSERT INTO transactions (uid, amt, curr) VALUES (?, ?, ?)"
    cursor = conn.execute(query, (user_id, encrypted_amount, currency))
    return cursor.lastrowid

def commit(tx_id):
    # Intent: Atomicity
    database_pool.commit()

def rollback(tx_id):
    database_pool.rollback()
`
  },
  {
    name: 'auth_service.py',
    language: 'python',
    content: `import jwt
import secrets
import time

def verify_token(token_str):
    # Intent: Access Control & Identity Verification
    try:
        payload = jwt.decode(token_str, secrets.SECRET_KEY)
        return payload['exp'] > time.time()
    except:
        return False
        
def get_current_token():
    # Intent: Session Management
    return headers.get('Authorization')
`
  }
];

export default function App() {
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.CAUSAL);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Analysis timer state
  const [estimatedTime, setEstimatedTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [analysisStartTime, setAnalysisStartTime] = useState<number | null>(null);

  // New state for file viewing
  const [activeFile, setActiveFile] = useState<CodeFile | null>(null);
  const [sidebarMode, setSidebarMode] = useState<'CODE' | 'DETAILS'>('DETAILS');

  // TRACE STATE
  const [isTracing, setIsTracing] = useState(false);
  const [traceHighlight, setTraceHighlight] = useState<TraceResult | null>(null);

  // CODE HIGHLIGHT STATE (for node click highlighting)
  const [highlightedText, setHighlightedText] = useState<string | null>(null);

  // EXPORT STATE
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // SETTINGS STATE
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('selectedModel') || 'gemini-2.5-pro';
  });
  const settingsMenuRef = useRef<HTMLDivElement>(null);

  // LOCATION NAVIGATOR STATE (for navigating through multiple code locations)
  const [locationNavigator, setLocationNavigator] = useState<{
    locations: SourceLocation[];
    currentIndex: number;
    nodeContext: GraphNode;
  } | null>(null);

  // Helper to start navigation at a collection of locations
  const startLocationNavigator = (locations: SourceLocation[], context: GraphNode) => {
    if (locations.length === 0) {
      return;
    }

    const firstLocation = locations[0];
    const targetFile = files.find(f => f.name === firstLocation.file);

    setLocationNavigator({
      locations,
      currentIndex: 0,
      nodeContext: context
    });

    if (targetFile) {
      setActiveFile(targetFile);
      setSidebarMode('CODE');
      console.log(`🎯 Starting navigator at ${firstLocation.file}:${firstLocation.startLine} (${locations.length} locations)`);
    } else {
      console.warn(`Location file not found in loaded files: ${firstLocation.file}`);
    }
  };

  // Navigation functions
  const navigateToLocation = (index: number) => {
    if (!locationNavigator || index < 0 || index >= locationNavigator.locations.length) return;

    const location = locationNavigator.locations[index];
    const targetFile = files.find(f => f.name === location.file);

    if (targetFile) {
      setActiveFile(targetFile);
      setSidebarMode('CODE');
      setLocationNavigator({ ...locationNavigator, currentIndex: index });
      console.log(`📍 Navigated to location ${index + 1} of ${locationNavigator.locations.length} in ${location.file}:${location.startLine}`);
    }
  };

  const navigateNext = () => {
    if (locationNavigator) {
      const nextIndex = (locationNavigator.currentIndex + 1) % locationNavigator.locations.length;
      navigateToLocation(nextIndex);
    }
  };

  const navigatePrevious = () => {
    if (locationNavigator) {
      const prevIndex = locationNavigator.currentIndex === 0
        ? locationNavigator.locations.length - 1
        : locationNavigator.currentIndex - 1;
      navigateToLocation(prevIndex);
    }
  };

  const closeNavigator = () => {
    setLocationNavigator(null);
    setHighlightedText(null);
  };

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };

    if (showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showExportMenu]);

  // Close settings menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target as Node)) {
        setShowSettingsMenu(false);
      }
    };

    if (showSettingsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSettingsMenu]);

  // Save model preference to localStorage
  useEffect(() => {
    localStorage.setItem('selectedModel', selectedModel);
    console.log(`⚙️ Model changed to: ${selectedModel}`);
  }, [selectedModel]);

  // Analysis timer - updates every 100ms
  useEffect(() => {
    if (!isAnalyzing || !analysisStartTime) {
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - analysisStartTime) / 1000; // seconds
      setElapsedTime(elapsed);
    }, 100);

    return () => clearInterval(interval);
  }, [isAnalyzing, analysisStartTime]);

  // Keyboard shortcuts for location navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!locationNavigator) return;

      // Arrow keys for navigation
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        navigateNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        navigatePrevious();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeNavigator();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [locationNavigator]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    // Explicitly cast to File[]
    const fileList = Array.from(e.target.files) as File[];
    
    const allowedExtensions = ['py', 'js', 'ts', 'tsx', 'jsx', 'html', 'css', 'json', 'txt', 'md', 'java', 'c', 'cpp', 'h', 'rs', 'go', 'yaml', 'xml', 'sh'];
    
    const validFiles = fileList.filter(file => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      return ext && allowedExtensions.includes(ext);
    });

    if (validFiles.length === 0) {
       alert("No valid code files found. Please upload supported file types (.py, .js, .ts, etc).");
       e.target.value = '';
       return;
    }

    // Helper to read a single file using the modern Blob.text() API
    const readFile = async (file: File): Promise<CodeFile | null> => {
        if (file.size === 0) {
            console.warn(`Skipping empty file: ${file.name}`);
            return null;
        }

        try {
            const content = await file.text();
            return {
                name: file.name,
                content: content,
                language: file.name.split('.').pop() || 'text'
            };
        } catch (err) {
            console.error(`Error reading ${file.name}:`, err);
            let msg = "Unknown error";
            
            if (err instanceof DOMException && err.name === "NotReadableError") {
                msg = "Permission denied or file lock. Try moving the file to a generic folder like 'Downloads' and try again.";
            } else if (err instanceof Error) {
                msg = err.message;
            }
            
            alert(`Failed to read file: ${file.name}\nReason: ${msg}`);
            return null;
        }
    };

    try {
        const results = await Promise.all(validFiles.map(readFile));
        const successfulFiles = results.filter((f): f is CodeFile => f !== null);

        if (successfulFiles.length > 0) {
            setFiles(prev => [...prev, ...successfulFiles]);
            // Set the last uploaded file as active to show immediate feedback
            setActiveFile(successfulFiles[successfulFiles.length - 1]);
            setSidebarMode('CODE');
        }
    } catch (error) {
        console.error("Unexpected error during file upload processing:", error);
    } finally {
        e.target.value = '';
    }
  };

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    setTraceHighlight(null);
    setElapsedTime(0);

    const filesToAnalyze = files.length > 0 ? files : DEMO_FILES;
    if (files.length === 0) {
        setFiles(DEMO_FILES);
        setActiveFile(DEMO_FILES[0]);
        setSidebarMode('CODE');
    }

    // Calculate total characters
    const totalChars = filesToAnalyze.reduce((sum, file) => sum + file.content.length, 0);

    // Get estimated time using adaptive learning from historical data
    const estimatedSeconds = getEstimatedTime(selectedModel, totalChars);
    setEstimatedTime(estimatedSeconds);

    const startTime = Date.now();
    setAnalysisStartTime(startTime);

    try {
        const result = await analyzeCodebase(filesToAnalyze, selectedModel);
        setAnalysis(result);

        // Calculate actual time and save metrics for future estimates (only if not cached)
        if (!result.fromCache) {
          const actualTimeSeconds = (Date.now() - startTime) / 1000;
          saveAnalysisMetric(selectedModel, totalChars, actualTimeSeconds);
          console.log(`✅ Actual time: ${actualTimeSeconds.toFixed(1)}s (estimated: ${estimatedSeconds.toFixed(1)}s)`);
        } else {
          console.log(`✅ Used cached analysis (skipped metrics)`);
        }
    } catch (err) {
        console.error("Analysis failed:", err);
        alert("Analysis failed. Check console for details.");
    } finally {
        setIsAnalyzing(false);
        setAnalysisStartTime(null);
    }
  };

  const handleTrace = async (snippet: string, mode: TraceMode = 'data') => {
      if (!analysis || !activeFile) return;
      setIsTracing(true);

      try {
          const result = await traceCodeSelection(snippet, activeFile.name, analysis, selectedModel, mode);
          setTraceHighlight(result);
          // Auto switch to graph visualization to show result
          setViewMode(ViewMode.CAUSAL);
      } catch (err) {
          console.error("Trace error", err);
      } finally {
          setIsTracing(false);
      }
  };

  const collectLocationsForNode = (node: GraphNode): SourceLocation[] => {
      const collected: SourceLocation[] = [];

      const addLocation = (loc?: SourceLocation | null) => {
          if (loc) {
              collected.push(loc);
          }
      };

      // Direct locations on node
      if (node.locations && node.locations.length > 0) {
          collected.push(...node.locations);
      }
      addLocation(node.location);

      // Intent nodes: collect locations from serving functions
      if (node.type === 'intent' && analysis) {
          const servingEdges = analysis.edges.filter(
              e => e.target === node.id && e.type === 'serves_intent'
          );

          servingEdges.forEach(edge => {
              const sourceNode = analysis.nodes.find(n => n.id === edge.source);
              if (sourceNode) {
                  if (sourceNode.locations && sourceNode.locations.length > 0) {
                      collected.push(...sourceNode.locations);
                  } else {
                      addLocation(sourceNode.location);
                  }
              }
          });
      }

      // File nodes: collect all function locations within the file
      if (node.type === 'file' && analysis) {
          const functionsInFile = analysis.nodes.filter(
              n => n.type === 'function' && (
                  (n.location && n.location.file === node.label) ||
                  (n.locations && n.locations.some(loc => loc.file === node.label))
              )
          );

          functionsInFile.forEach(fn => {
              if (fn.locations && fn.locations.length > 0) {
                  collected.push(...fn.locations.filter(loc => loc.file === node.label));
              } else {
                  addLocation(fn.location && fn.location.file === node.label ? fn.location : null);
              }
          });
      }

      // Deduplicate by file + line range
      const seen = new Set<string>();
      return collected.filter(loc => {
          const key = `${loc.file}:${loc.startLine}-${loc.endLine}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
      });
  };

  const handleNodeClick = (node: GraphNode) => {
      setSelectedNode(node);
      setHighlightedText(null); // Clear previous highlight

      const stayTelic = viewMode === ViewMode.TELIC;
      const locations = collectLocationsForNode(node);
      if (locations.length > 0) {
          startLocationNavigator(locations, node);
          if (!stayTelic) setViewMode(ViewMode.CAUSAL);
          return;
      }

      // Try to show relevant code in the sidebar if no location metadata is available
      if (node.type === 'file') {
          // Find the file by name
          const matchingFile = files.find(f => f.name === node.label);
          if (matchingFile) {
              setActiveFile(matchingFile);
              setSidebarMode('CODE');
              console.log(`📄 Opened file: ${node.label}`);
              if (!stayTelic) setViewMode(ViewMode.CAUSAL);
              return;
          }
      } else if (node.type === 'function') {
          // Search for the function name in all files
          const functionName = node.label.replace(/\(\)$/, ''); // Remove trailing ()
          for (const file of files) {
              // Simple search for function definition patterns
              const patterns = [
                  `def ${functionName}`,      // Python
                  `function ${functionName}`, // JavaScript
                  `const ${functionName}`,    // JavaScript arrow function
                  `${functionName}(`,         // Generic function call
                  `${functionName} =`,        // Variable assignment
              ];

              if (patterns.some(pattern => file.content.includes(pattern))) {
                  setActiveFile(file);
                  setSidebarMode('CODE');
                  setHighlightedText(functionName); // Highlight the function name
                  console.log(`🔍 Found function "${functionName}" in ${file.name}`);
                  if (!stayTelic) setViewMode(ViewMode.CAUSAL);
                  return;
              }
          }
          // Not found in files: fall back to details + graph view
          setActiveFile(null);
          setSidebarMode('DETAILS');
          if (!stayTelic) setViewMode(ViewMode.CAUSAL);
          return;
      } else if (node.type === 'intent' && analysis) {
          // Fallback: open first serving function via text search
          const servingEdges = analysis.edges.filter(e => e.target === node.id && e.type === 'serves_intent');
          const servingFunctions = servingEdges
              .map(e => analysis.nodes.find(n => n.id === e.source))
              .filter(n => n && n.type === 'function') as GraphNode[];

          if (servingFunctions.length > 0) {
              const firstFunc = servingFunctions[0];
              const functionName = firstFunc.label.replace(/\(\)$/, '');
              for (const file of files) {
                  const patterns = [
                      `function ${functionName}`,
                      `def ${functionName}`,
                      `const ${functionName}`,
                      `${functionName}(`,
                      `${functionName} =`,
                  ];
                  if (patterns.some(p => file.content.includes(p))) {
                      setActiveFile(file);
                      setSidebarMode('CODE');
                      setHighlightedText(functionName);
                      if (!stayTelic) setViewMode(ViewMode.CAUSAL);
                      console.log(`📄 Opened serving function "${functionName}" for intent "${node.label}"`);
                      return;
                  }
              }
          }
      }

      // Default: show details view if no code found
      setSidebarMode('DETAILS');
      if (!stayTelic) setViewMode(ViewMode.CAUSAL);
  };

  const handleFileSelect = (file: CodeFile) => {
      setActiveFile(file);
      setSidebarMode('CODE');
  };

  // Calculate security metrics
  const getSecurityMetrics = () => {
    if (!analysis) return null;

    const functions = analysis.nodes.filter(n => n.type === 'function');
    const intents = analysis.nodes.filter(n => n.type === 'intent');

    // Find orphaned functions (no intent mapping)
    const orphanedFunctions = functions.filter(fn => {
      return !analysis.edges.some(e => e.source === fn.id && e.type === 'serves_intent');
    });

    // Calculate score (0-100)
    let score = 100;
    if (functions.length > 0) {
      score -= (orphanedFunctions.length / functions.length) * 50; // Orphaned functions penalty
    }
    if (intents.length === 0 && functions.length > 0) {
      score -= 30; // No intents identified
    }

    return {
      score: Math.round(score),
      orphanedFunctions,
      intents: intents.length,
      totalFunctions: functions.length,
      hasIntents: intents.length > 0
    };
  };

  const securityMetrics = getSecurityMetrics();

  return (
    <div className="flex h-screen w-full bg-black text-white overflow-hidden selection:bg-red-500/30">
      {/* Sidebar */}
      <Sidebar
        files={files}
        selectedNode={selectedNode}
        activeFile={activeFile}
        sidebarMode={sidebarMode}
        setSidebarMode={setSidebarMode}
        onFileUpload={handleFileUpload}
        onSelectFile={handleFileSelect}
        onTrace={handleTrace}
        isTracing={isTracing}
        highlightedText={highlightedText}
        analysis={analysis}
        locationNavigator={locationNavigator}
        onNavigateNext={navigateNext}
        onNavigatePrevious={navigatePrevious}
        onCloseNavigator={closeNavigator}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative">
        
        {/* Top Bar / HUD */}
        <div className="h-16 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur flex items-center justify-between px-6 z-10">
          
          {/* View Switcher */}
          <div className="flex bg-neutral-950 p-1 rounded-lg border border-neutral-800">
            <button 
              onClick={() => setViewMode(ViewMode.CAUSAL)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === ViewMode.CAUSAL ? 'bg-neutral-800 text-green-400 shadow-sm' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              <Activity size={14} />
              CAUSAL VIEW
            </button>
            <button 
              onClick={() => setViewMode(ViewMode.TELIC)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === ViewMode.TELIC ? 'bg-neutral-800 text-purple-400 shadow-sm' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              <Target size={14} />
              TELIC VIEW
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4">
             {traceHighlight && (
                 <div
                    className="flex items-center gap-2 px-3 py-1 bg-blue-900/30 border border-blue-500/30 rounded text-xs text-blue-200 animate-in fade-in cursor-help"
                    title={traceHighlight.explanation}
                 >
                    <Network size={12} />
                    Active Trace: {traceHighlight.relatedNodeIds.length} nodes
                    <button
                        onClick={() => setTraceHighlight(null)}
                        className="ml-2 hover:text-white"
                    >
                        ×
                    </button>
                 </div>
             )}

            {/* Settings Menu */}
            <div className="relative" ref={settingsMenuRef}>
              <button
                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                className="flex items-center gap-2 px-4 py-2 bg-neutral-800 text-white text-xs font-bold rounded hover:bg-neutral-700 transition-colors"
              >
                <Settings size={14} />
                SETTINGS
              </button>

              {showSettingsMenu && (
                <div className="absolute top-full right-0 mt-2 w-72 bg-neutral-900 border border-neutral-800 rounded-lg shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                  <div className="px-4 py-2 border-b border-neutral-800 bg-neutral-950">
                    <h3 className="text-xs font-bold text-neutral-400">AI MODEL</h3>
                  </div>

                  {/* Gemini 3 Models */}
                  <div className="px-2 py-1 bg-neutral-950/50">
                    <div className="text-[10px] text-purple-400 font-bold px-2 py-1">GEMINI 3 (PREVIEW)</div>
                  </div>
                  <button
                    onClick={() => { setSelectedModel('gemini-3-pro-preview'); setShowSettingsMenu(false); }}
                    className={`w-full px-4 py-2 text-left text-xs transition-colors ${selectedModel === 'gemini-3-pro-preview' ? 'bg-purple-900/30 text-purple-200 font-bold' : 'text-neutral-300 hover:bg-neutral-800'}`}
                  >
                    Gemini 3 Pro <span className="text-[10px] text-neutral-600">(Most Intelligent)</span>
                  </button>

                  <div className="px-4 py-2 border-t border-neutral-800 bg-neutral-950 mt-1">
                    <h3 className="text-xs font-bold text-neutral-400 mb-1">Cache</h3>
                    <button
                      onClick={() => {
                        clearAnalysisCache();
                        setAnalysis(null);
                        setTraceHighlight(null);
                        setShowSettingsMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-xs bg-red-900/20 hover:bg-red-800/30 text-red-200 rounded border border-red-700/50 transition-colors"
                    >
                      Invalidate cache (force fresh analysis)
                    </button>
                  </div>

                  {/* Gemini 2.5 Models */}
                  <div className="px-2 py-1 bg-neutral-950/50 mt-1">
                    <div className="text-[10px] text-blue-400 font-bold px-2 py-1">GEMINI 2.5</div>
                  </div>
                  <button
                    onClick={() => { setSelectedModel('gemini-2.5-pro'); setShowSettingsMenu(false); }}
                    className={`w-full px-4 py-2 text-left text-xs transition-colors ${selectedModel === 'gemini-2.5-pro' ? 'bg-blue-900/30 text-blue-200 font-bold' : 'text-neutral-300 hover:bg-neutral-800'}`}
                  >
                    Gemini 2.5 Pro <span className="text-[10px] text-neutral-600">(Advanced Thinking)</span>
                  </button>
                  <button
                    onClick={() => { setSelectedModel('gemini-2.5-flash'); setShowSettingsMenu(false); }}
                    className={`w-full px-4 py-2 text-left text-xs transition-colors ${selectedModel === 'gemini-2.5-flash' ? 'bg-blue-900/30 text-blue-200 font-bold' : 'text-neutral-300 hover:bg-neutral-800'}`}
                  >
                    Gemini 2.5 Flash <span className="text-[10px] text-neutral-600">(Default - Fast & Smart)</span>
                  </button>
                  <button
                    onClick={() => { setSelectedModel('gemini-2.5-flash-lite'); setShowSettingsMenu(false); }}
                    className={`w-full px-4 py-2 text-left text-xs transition-colors ${selectedModel === 'gemini-2.5-flash-lite' ? 'bg-blue-900/30 text-blue-200 font-bold' : 'text-neutral-300 hover:bg-neutral-800'}`}
                  >
                    Gemini 2.5 Flash Lite <span className="text-[10px] text-neutral-600">(Ultra Fast)</span>
                  </button>

                  {/* Gemini 2.0 Models */}
                  <div className="px-2 py-1 bg-neutral-950/50 mt-1">
                    <div className="text-[10px] text-green-400 font-bold px-2 py-1">GEMINI 2.0</div>
                  </div>
                  <button
                    onClick={() => { setSelectedModel('gemini-2.0-flash'); setShowSettingsMenu(false); }}
                    className={`w-full px-4 py-2 text-left text-xs transition-colors ${selectedModel === 'gemini-2.0-flash' ? 'bg-green-900/30 text-green-200 font-bold' : 'text-neutral-300 hover:bg-neutral-800'}`}
                  >
                    Gemini 2.0 Flash <span className="text-[10px] text-neutral-600">(Previous Gen)</span>
                  </button>
                </div>
              )}
            </div>

            {/* Export Menu */}
            {analysis && (
              <div className="relative" ref={exportMenuRef}>
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="flex items-center gap-2 px-4 py-2 bg-neutral-800 text-white text-xs font-bold rounded hover:bg-neutral-700 transition-colors"
                >
                  <Download size={14} />
                  EXPORT
                </button>

                {showExportMenu && (
                  <div className="absolute top-full right-0 mt-2 w-48 bg-neutral-900 border border-neutral-800 rounded-lg shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                    <button
                      onClick={() => {
                        exportAsJSON(analysis);
                        setShowExportMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
                    >
                      Export as JSON
                    </button>
                    <button
                      onClick={() => {
                        exportAsMarkdown(analysis);
                        setShowExportMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
                    >
                      Export as Markdown
                    </button>
                    <button
                      onClick={() => {
                        exportAsTextReport(analysis);
                        setShowExportMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
                    >
                      Export as Text Report
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={runAnalysis}
              disabled={isAnalyzing}
              className="flex items-center gap-2 px-5 py-2 bg-white text-black text-xs font-bold rounded hover:bg-neutral-200 disabled:opacity-50 transition-colors"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span className="font-mono">
                    {elapsedTime.toFixed(1)}s / {estimatedTime.toFixed(1)}s
                    {elapsedTime > estimatedTime && (
                      <span className="text-red-600"> (running long)</span>
                    )}
                  </span>
                </>
              ) : (
                <>
                  <Play size={14} fill="currentColor" />
                  {files.length === 0 ? 'LOAD DEMO & ANALYZE' : 'ANALYZE CODE'}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Security Alert Banner */}
        {securityMetrics && securityMetrics.orphanedFunctions.length > 0 && (
          <div className="px-6 py-3 bg-yellow-900/30 border-b border-yellow-500/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-yellow-500 text-xl">⚠️</div>
              <div>
                <div className="text-xs font-bold text-yellow-200">
                  SECURITY ALERT: {securityMetrics.orphanedFunctions.length} Orphaned Function{securityMetrics.orphanedFunctions.length > 1 ? 's' : ''} Detected
                </div>
                <div className="text-[10px] text-yellow-300/70 mt-0.5">
                  These functions have no clear purpose mapping and may indicate code slop or hidden vulnerabilities
                </div>
                <button
                  onClick={() => {
                    const firstOrphan = securityMetrics.orphanedFunctions[0];
                    if (firstOrphan) {
                      setViewMode(ViewMode.CAUSAL);
                      handleNodeClick(firstOrphan);
                    }
                  }}
                  className="mt-1 inline-flex items-center gap-1 px-2 py-1 bg-yellow-800/60 hover:bg-yellow-700 text-[10px] text-yellow-100 font-semibold rounded border border-yellow-600 transition-colors"
                >
                  View first orphan
                </button>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-yellow-400 font-mono">INTENT SCORE</div>
              <div className={`text-2xl font-bold ${securityMetrics.score >= 80 ? 'text-green-400' : securityMetrics.score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                {securityMetrics.score}%
              </div>
            </div>
          </div>
        )}

        {/* Graph Area */}
        <div className="flex-1 bg-[radial-gradient(#1a1a1a_1px,transparent_1px)] [background-size:16px_16px] relative">
          <GraphView
            data={analysis}
            mode={viewMode}
            onNodeClick={handleNodeClick}
            traceHighlight={traceHighlight}
          />

          {/* Overlay HUD Elements for aesthetics */}
          <div className="absolute bottom-4 left-4 pointer-events-none">
             <div className="flex flex-col gap-1 text-[10px] font-mono text-neutral-600">
                <div className="flex items-center gap-2">
                   <div className={`w-2 h-2 rounded-full ${securityMetrics && securityMetrics.score >= 80 ? 'bg-green-500' : 'bg-yellow-500'}`}></div> SYSTEM STATUS: {securityMetrics && securityMetrics.score >= 80 ? 'NORMAL' : 'REVIEW REQUIRED'}
                </div>
                <div>MEM: 2048MB OK</div>
                <div>JARVIS: CONNECTED</div>
                {securityMetrics && (
                  <div className="mt-1 pt-1 border-t border-neutral-800">
                    <div>INTENTS: {securityMetrics.intents}</div>
                    <div>FUNCTIONS: {securityMetrics.totalFunctions}</div>
                    <div>ORPHANED: {securityMetrics.orphanedFunctions.length}</div>
                  </div>
                )}
             </div>
          </div>
        </div>

      </div>
    </div>
  );
}
