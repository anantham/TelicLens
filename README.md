<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# TelicLens - AI Code Inspector

> **A "JARVIS-style" dual-view code analysis tool that reveals both the *mechanistic flow* (Causal) and the *true intent* (Telic) of AI-generated codebases.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.2-blue)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-6.2-purple)](https://vitejs.dev/)

---

## 🎯 Problem Statement

**AI-generated code often looks correct but may be fundamentally flawed.**

Unlike human-written code that embeds intentionality and design reasoning, AI code can be:
- **Functionally plausible but conceptually hollow**
- **Syntactically correct but purposeless**
- **Containing hidden vulnerabilities or backdoors**

**TelicLens solves this by analyzing code through two complementary lenses:**

---

## 🔬 The Dual-View Philosophy

### 1. 🌊 Causal View (Mechanistic)

**Shows: How the code *works***

```
Input → [authenticate] → [validate] → [process] → Output
         ↓                ↓
      [log]          [encrypt]
```

- Dependency graphs and call chains
- Data flow from input to output
- Control flow and transformations
- **Use for**: Debugging, tracing bugs, understanding "what calls what"

**Analogy**: Understanding the human body through biochemistry—neurons fire, muscles contract, blood flows.

---

### 2. 🎯 Telic View (Teleological)

**Shows: What the code is *trying to accomplish***

```
System Purpose: "User Authentication Service"
├── Credential Validation
│   ├── hash_password()
│   ├── verify_token()
│   └── check_permissions()
├── Security Logging
│   ├── log_attempt()
│   └── alert_suspicious()
└── Error Handling
    └── sanitize_error()
```

- Functional roles and intentions
- Purpose hierarchy (function → module → system)
- Natural language explanations of "why" code exists
- **Use for**: Detecting malicious code, verifying intent matches implementation

**Analogy**: Understanding the human body through organ systems—the respiratory system exists to oxygenate blood.

---

## 🚨 Key Insight: Intentionality as Security

**The "slop detection" principle:**

✅ **Legitimate code**: Every block serves a clear purpose in a larger design
❌ **Slop/Malicious code**: Code that looks right but:
  - Has no functional role
  - Solves problems that don't exist
  - Serves hidden purposes

### Example Detection

```python
def delete_user(user_id):
    remove_from_db(user_id)           # Purpose: "Remove user data" ✓
    log_deletion(user_id)             # Purpose: "Audit trail" ✓
    send_to_external_endpoint(data)   # Purpose: "???" ⚠️ SUSPICIOUS!
```

**TelicLens flags**: "Third function doesn't align with deletion intent—potential data exfiltration!"

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** (v18 or higher)
- **Google Gemini API Key** ([Get one free](https://aistudio.google.com/app/apikey))

### Installation

```bash
# Clone the repository
git clone https://github.com/anantham/TelicLens.git
cd TelicLens

# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# Edit .env.local and add your GEMINI_API_KEY

# Start development server
npm run dev
```

The app will be available at **http://localhost:3000**

---

## 📖 Usage Guide

### 1. Load Code

- **Demo Mode**: Click "LOAD DEMO & ANALYZE" to see example analysis
- **Upload Files**: Click the upload icon (📁) in the sidebar to load your own code
  - Supported: `.py`, `.js`, `.ts`, `.tsx`, `.jsx`, `.java`, `.c`, `.cpp`, `.go`, `.rs`, etc.

### 2. Analyze

Click **"ANALYZE CODE"** to run AI-powered analysis:
- Generates dependency graph (Causal)
- Extracts intentionality mapping (Telic)
- Identifies suspicious patterns

### 3. Explore Views

#### Causal View (Left-to-Right)
- **Files** → **Functions** → **Data Stores**
- Blue edges = Data flow
- Gray edges = Dependencies
- Click nodes to inspect details

#### Telic View (Radial)
- **Intent nodes** at center (purple, glowing)
- **Implementation nodes** orbit around
- Purple dashed edges = "serves this purpose"
- Dimmed nodes = low relevance in current view

### 4. Trace Code

1. Switch to **"SOURCE"** tab in sidebar
2. Select a code snippet
3. Click **"TRACE FLOW"** button
4. Graph highlights all related nodes and edges

### 5. Inspect Nodes

- Click any node to see:
  - Description
  - Telic intent (if applicable)
  - Input/output counts
  - Type and role

---

## 🏗️ Architecture

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19 + TypeScript |
| **Build Tool** | Vite 6.2 |
| **Styling** | TailwindCSS (CDN) |
| **Visualization** | Custom SVG renderer |
| **AI Analysis** | Google Gemini 2.5 Flash |
| **Icons** | Lucide React |

### Project Structure

```
TelicLens/
├── components/
│   ├── Sidebar.tsx      # File list, code viewer, inspector
│   ├── GraphView.tsx    # SVG graph visualization
├── services/
│   └── geminiService.ts # AI analysis integration
├── types.ts             # TypeScript type definitions
├── App.tsx              # Main orchestration
├── docs/
│   └── ADR-001-*.md     # Architecture Decision Record
└── README.md            # This file
```

---

## 🎨 Features

### Current (v0.1)

- ✅ Dual-view mode switching (Causal/Telic)
- ✅ File upload and demo data
- ✅ AI-powered intent extraction
- ✅ Interactive graph with click-to-inspect
- ✅ Code snippet tracing
- ✅ Different layouts per view mode
- ✅ Gemini AI integration

### Coming Soon (v0.2)

- 🚧 Zoom/Pan/Recenter controls
- 🚧 Hierarchical purpose grouping
- 🚧 Confidence scores for intent analysis
- 🚧 Suspicious code auto-flagging
- 🚧 Export analysis reports (JSON/PDF)
- 🚧 Diff mode (compare versions)

### Roadmap

- 📋 Multi-model verification (local AST + AI)
- 📋 VS Code extension
- 📋 Git integration for historical analysis
- 📋 Collaborative review features

---

## 🧪 Example Analysis

**Demo files show a financial transaction system:**

**Causal Findings:**
- `process_transaction` calls 4 dependent functions
- Data flows through auth → fraud check → ledger
- Encryption applied before DB writes

**Telic Findings:**
- System has 3 core intents:
  1. **Financial Integrity** (no double-spending)
  2. **System Security** (prevent fraud)
  3. **User Privacy** (protect PII)
- All functions map to these intents

**Security Check:**
- ✅ No orphaned code
- ✅ All functions serve stated purposes
- ✅ Consistent intent hierarchy

---

## 🛠️ Development

### Run Development Server

```bash
npm run dev
```

### Build for Production

```bash
npm run build
npm run preview
```

### Environment Variables

```bash
# .env.local
GEMINI_API_KEY=your_key_here
```

**Note**: The app works offline with demo data if no API key is set.

---

## 📚 Documentation

- [Architecture Decision Record (ADR)](docs/ADR-001-dual-view-analysis-system.md)
- [View in AI Studio](https://ai.studio/apps/drive/1vrwqRRJLjNVvycESo0LYpujvNTzuqmSK)

---

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📜 License

MIT License - see [LICENSE](LICENSE) for details

---

## 🙏 Acknowledgments

- Inspired by Aristotle's concept of teleology (Four Causes)
- Built with Google Gemini AI
- UI inspired by JARVIS (Iron Man)

---

## 📧 Contact

**Project Link**: [https://github.com/anantham/TelicLens](https://github.com/anantham/TelicLens)

**Issues**: [https://github.com/anantham/TelicLens/issues](https://github.com/anantham/TelicLens/issues)

---

<div align="center">
<strong>Built with intentionality. Analyzed with purpose.</strong>
</div>
