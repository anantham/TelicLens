import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { GraphView } from './components/GraphView';
import { analyzeCodebase, traceCodeSelection } from './services/geminiService';
import { CodeFile, AnalysisResult, ViewMode, GraphNode, TraceResult } from './types';
import { Activity, Target, Loader2, Play, Network } from 'lucide-react';

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
  
  // New state for file viewing
  const [activeFile, setActiveFile] = useState<CodeFile | null>(null);
  const [sidebarMode, setSidebarMode] = useState<'CODE' | 'DETAILS'>('DETAILS');

  // TRACE STATE
  const [isTracing, setIsTracing] = useState(false);
  const [traceHighlight, setTraceHighlight] = useState<TraceResult | null>(null);

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
    
    const filesToAnalyze = files.length > 0 ? files : DEMO_FILES;
    if (files.length === 0) {
        setFiles(DEMO_FILES);
        setActiveFile(DEMO_FILES[0]);
        setSidebarMode('CODE');
    }
    
    try {
        const result = await analyzeCodebase(filesToAnalyze);
        setAnalysis(result);
    } catch (err) {
        console.error("Analysis failed:", err);
        alert("Analysis failed. Check console for details.");
    } finally {
        setIsAnalyzing(false);
    }
  };

  const handleTrace = async (snippet: string) => {
      if (!analysis || !activeFile) return;
      setIsTracing(true);
      
      try {
          const result = await traceCodeSelection(snippet, activeFile.name, analysis);
          setTraceHighlight(result);
          // Auto switch to graph visualization to show result
          // But keep sidebar as code to allow more selection
      } catch (err) {
          console.error("Trace error", err);
      } finally {
          setIsTracing(false);
      }
  };

  const handleNodeClick = (node: GraphNode) => {
      setSelectedNode(node);
      setSidebarMode('DETAILS');
  };

  const handleFileSelect = (file: CodeFile) => {
      setActiveFile(file);
      setSidebarMode('CODE');
  };

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
                 <div className="flex items-center gap-2 px-3 py-1 bg-blue-900/30 border border-blue-500/30 rounded text-xs text-blue-200 animate-in fade-in">
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
            <button 
              onClick={runAnalysis}
              disabled={isAnalyzing}
              className="flex items-center gap-2 px-5 py-2 bg-white text-black text-xs font-bold rounded hover:bg-neutral-200 disabled:opacity-50 transition-colors"
            >
              {isAnalyzing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
              {files.length === 0 ? 'LOAD DEMO & ANALYZE' : 'ANALYZE CODE'}
            </button>
          </div>
        </div>

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
                   <div className="w-2 h-2 bg-green-500 rounded-full"></div> SYSTEM STATUS: NORMAL
                </div>
                <div>MEM: 2048MB OK</div>
                <div>JARVIS: CONNECTED</div>
             </div>
          </div>
        </div>

      </div>
    </div>
  );
}