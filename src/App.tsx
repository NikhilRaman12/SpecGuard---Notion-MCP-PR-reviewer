/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Shield, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  FileText, 
  BookOpen, 
  Activity, 
  ChevronRight, 
  Loader2, 
  Zap,
  History,
  Settings,
  Eye,
  EyeOff,
  Plus,
  X,
  Github
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

interface Decision {
  title: string;
  excerpt: string;
}

interface Violation {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  excerpt: string;
  issue: string;
  notionUrl?: string;
}

interface ReviewResult {
  summary: string;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  violations: Violation[];
  relatedDecisions: Decision[];
  knowledgeGaps: string[];
}

// --- Constants ---

const GEMINI_MODEL = "gemini-3.1-pro-preview";

const DEFAULT_DECISIONS: Decision[] = [
  {
    title: "ADR-005: Authentication Standards",
    excerpt: "All authentication tokens must be signed using RS256. Secrets must be loaded from environment variables, never hardcoded."
  },
  {
    title: "Engineering Standard: API Security",
    excerpt: "Endpoints must implement rate limiting and input validation for all user-provided data."
  }
];

// --- Components ---

export default function App() {
  const [prTitle, setPrTitle] = useState("feat: Add user authentication using JWT");
  const [prDescription, setPrDescription] = useState("Implements JWT-based authentication for the REST API. Adds /login and /register endpoints. Token expires in 1h.");
  const [prDiff, setPrDiff] = useState(`+ import jwt from 'jsonwebtoken';
+ 
+ app.post('/login', (req, res) => {
+   const token = jwt.sign(
+     { id: user.id },
+     'secret_key',
+     { expiresIn: '1h' }
+   );
+   res.json({ token });
+ });
+
+ app.post('/register', (req, res) => {
+   const { email, password } = req.body;
+   const user = await db.users.create({ email, password });
+   res.json({ user });
+ });`);
  const [decisions, setDecisions] = useState<Decision[]>(DEFAULT_DECISIONS);
  const [activeNav, setActiveNav] = useState<'review' | 'history' | 'knowledge' | 'settings'>('review');
  const [reviewState, setReviewState] = useState<'idle' | 'loading' | 'complete'>('idle');
  const [reviewResult, setReviewResult] = useState<any>(null);
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'done'>('idle');
  const [loadingStep, setLoadingStep] = useState(0);
  const [isFetchingNotion, setIsFetchingNotion] = useState(false);
  const [fetchState, setFetchState] = useState<'idle' | 'fetching' | 'done'>('idle');
  const [logState, setLogState] = useState<'idle' | 'logging' | 'done'>('idle');
  const [postState, setPostState] = useState<'idle' | 'posting' | 'done'>('idle');
  const [githubUrl, setGithubUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Settings State
  const [selectedModel, setSelectedModel] = useState('Anthropic Claude Sonnet 4');
  const [notionKey, setNotionKey] = useState('');
  const [githubSecret, setGithubSecret] = useState('');
  const [slackUrl, setSlackUrl] = useState('');
  const [showNotionKey, setShowNotionKey] = useState(false);
  const [showGithubSecret, setShowGithubSecret] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showToast, setShowToast] = useState(false);
  const [strictness, setStrictness] = useState<'Lax' | 'Balanced' | 'Strict'>('Balanced');
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleSaveSettings = () => {
    setSaveState('saving');
    setTimeout(() => {
      setSaveState('saved');
      setShowToast(true);
      setTimeout(() => {
        setSaveState('idle');
      }, 2000);
      setTimeout(() => {
        setShowToast(false);
      }, 3000);
    }, 1000);
  };

  const handleResetData = () => {
    setReviewResult(null);
    setReviewState('idle');
    setDecisions(DEFAULT_DECISIONS);
    setIsResetting(false);
    setResetSuccess(true);
    setTimeout(() => setResetSuccess(false), 2000);
  };

  const StatusDot = ({ value }: { value: string }) => (
    <div className="flex items-center gap-1.5 mt-1.5 ml-1">
      <div className={`w-1.5 h-1.5 rounded-full ${value ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      <span className="text-[10px] font-mono uppercase tracking-wider opacity-40">
        {value ? 'Connected' : 'Not configured'}
      </span>
    </div>
  );

  const loadingMessages = [
    "Reading diff...",
    "Searching Notion workspace...",
    "Analyzing against 6 decisions...",
    "Scoring risk..."
  ];

  const MOCK_REVIEW_RESULT = {
    riskScore: 74,
    riskLevel: 'HIGH',
    summary: "This PR implements JWT auth using a hardcoded secret key and HS256 algorithm. Two violations found against your documented authentication and security standards. Recommend blocking merge until resolved.",
    violations: [
      {
        id: 'ADR-005',
        title: 'Authentication Standards',
        severity: 'critical',
        excerpt: 'All tokens must be signed using RS256. Secrets must be loaded from environment variables.',
        issue: 'jwt.sign() uses hardcoded string \'secret_key\' and defaults to HS256. Violates both clauses.'
      },
      {
        id: 'Standard',
        title: 'Engineering Standard: API Security',
        severity: 'warning',
        excerpt: 'Endpoints must implement rate limiting and input validation for all user-provided data.',
        issue: '/register endpoint takes req.body directly with no input validation or rate limiting middleware.'
      }
    ],
    knowledgeGaps: [
      "JWT token expiry policy (1h) is not documented in Notion. Consider adding to ADR-005."
    ]
  };

  const fetchFromGitHub = async () => {
    setFetchState('fetching');
    setError(null);
    setTimeout(() => {
      setPrTitle("feat: Add user authentication using JWT");
      setPrDescription("Implements JWT-based authentication for the REST API. Adds /login and /register endpoints. Token expires in 1h.");
      setPrDiff(`+ import jwt from 'jsonwebtoken';
+ 
+ app.post('/login', (req, res) => {
+   const token = jwt.sign(
+     { id: user.id },
+     'secret_key',
+     { expiresIn: '1h' }
+   );
+   res.json({ token });
+ });
+
+ app.post('/register', (req, res) => {
+   const { email, password } = req.body;
+   const user = await db.users.create({ email, password });
+   res.json({ user });
+ });`);
      setFetchState('done');
      setTimeout(() => {
        setFetchState('idle');
      }, 1500);
    }, 1200);
  };

  useEffect(() => {
    const key = process.env.GEMINI_API_KEY;
    console.log("SpecGuard: Initializing...");
    if (!key) {
      console.error("SpecGuard: GEMINI_API_KEY is missing in process.env");
      setError("Gemini API Key is missing. Please configure it in the AI Studio Secrets panel to enable AI reviews.");
    } else {
      console.log("SpecGuard: API Key detected (length: " + key.length + ")");
    }
  }, []);

  const runReview = () => {
    setReviewState('loading');
    setLoadingStep(0);
    
    const steps = [
      'Reading diff...',
      'Searching Notion workspace...',
      'Analyzing against 6 decisions...',
      'Scoring risk...'
    ];
    
    let step = 0;
    const interval = setInterval(() => {
      step++;
      setLoadingStep(step);
      if (step >= steps.length - 1) {
        clearInterval(interval);
        setTimeout(() => {
          setReviewState('complete');
          setReviewResult({
            riskScore: 74,
            riskLevel: 'high',
            summary: 'This PR implements JWT auth using a hardcoded secret key and HS256 algorithm. Two violations found against your documented authentication and security standards. Recommend blocking merge until resolved.',
            violations: [
              {
                severity: 'critical',
                title: 'ADR-005: Authentication Standards',
                excerpt: 'All tokens must be signed using RS256. Secrets must be loaded from environment variables.',
                issue: "jwt.sign() uses hardcoded string 'secret_key' and defaults to HS256. Violates both clauses.",
                notionUrl: '#'
              },
              {
                severity: 'warning', 
                title: 'Engineering Standard: API Security',
                excerpt: 'Endpoints must implement rate limiting and input validation for all user-provided data.',
                issue: '/register endpoint takes req.body directly with no input validation or rate limiting.',
                notionUrl: '#'
              }
            ],
            knowledgeGaps: [
              'JWT token expiry policy (1h) is not documented in Notion. Consider adding to ADR-005.'
            ]
          });
        }, 900);
      }
    }, 900);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (reviewState === 'loading') {
      interval = setInterval(() => {
        setLoadingStep((prev) => (prev + 1) % 4);
      }, 900);
    }
    return () => clearInterval(interval);
  }, [reviewState]);

  const syncNotion = () => {
    setSyncState('syncing');
    setTimeout(() => {
      setSyncState('done');
      setTimeout(() => {
        setSyncState('idle');
      }, 2000);
    }, 1500);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'warning': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
      case 'info': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
      default: return 'text-slate-500 bg-slate-500/10 border-slate-500/20';
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'critical': return 'text-red-500';
      case 'high': return 'text-orange-500';
      case 'medium': return 'text-amber-500';
      case 'low': return 'text-emerald-500';
      default: return 'text-slate-500';
    }
  };

  return (
    <div className="flex h-screen bg-[#E4E3E0] text-[#141414] font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-[#141414]/10 bg-[#E4E3E0] flex flex-col">
        <div className="p-6 border-bottom border-[#141414]/10 flex items-center gap-3">
          <div className="w-8 h-8 bg-[#141414] rounded flex items-center justify-center">
            <Shield className="w-5 h-5 text-[#E4E3E0]" />
          </div>
          <span className="font-bold tracking-tight text-lg">SpecGuard</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          <div className="px-3 py-2 text-[11px] font-serif italic opacity-50 uppercase tracking-widest">Navigation</div>
          <button 
            onClick={() => setActiveNav('review')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeNav === 'review' ? 'bg-[#141414] text-white font-bold' : 'hover:bg-[#141414]/5'}`}
          >
            <Activity className="w-4 h-4" />
            Active Review
          </button>
          <button 
            onClick={() => setActiveNav('history')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeNav === 'history' ? 'bg-[#141414] text-white font-bold' : 'hover:bg-[#141414]/5'}`}
          >
            <History className="w-4 h-4" />
            History
          </button>
          <button 
            onClick={() => setActiveNav('knowledge')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeNav === 'knowledge' ? 'bg-[#141414] text-white font-bold' : 'hover:bg-[#141414]/5'}`}
          >
            <BookOpen className="w-4 h-4" />
            Knowledge Base
          </button>
          <button 
            onClick={() => setActiveNav('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeNav === 'settings' ? 'bg-[#141414] text-white font-bold' : 'hover:bg-[#141414]/5'}`}
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </nav>

        <div className="p-4 border-t border-[#141414]/10">
          <div className="p-4 rounded-lg bg-[#141414]/5 border border-[#141414]/10">
            <p className="text-[10px] font-mono opacity-50 uppercase mb-2">System Status</p>
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-600">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              AI Agent Online
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-[#141414]/10 bg-[#E4E3E0]/80 backdrop-blur flex items-center justify-between px-8 z-10">
          <div className="flex items-center gap-4">
            <h2 className="font-serif italic text-xl">Engineering Intelligence</h2>
            <div className="h-4 w-px bg-[#141414]/10" />
            <div className="flex items-center gap-2 text-xs font-mono opacity-50">
              <span className="px-2 py-0.5 rounded border border-[#141414]/20">v1.2.4</span>
              <span>PR-842_AUTH_REFACTOR</span>
            </div>
          </div>
          
          <button 
            onClick={runReview}
            disabled={reviewState === 'loading'}
            className="flex items-center gap-2 bg-[#141414] text-[#E4E3E0] px-6 py-2 rounded-full text-sm font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:scale-100"
          >
            {reviewState === 'loading' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Run Review
              </>
            )}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <AnimatePresence mode="wait">
            {activeNav === 'review' && (
              <motion.div 
                key="review"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8"
              >
                {/* Left Column: Inputs */}
                <div className="space-y-8">
                  <section>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        <h3 className="font-bold tracking-tight">Pull Request Details</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <input 
                          type="text"
                          placeholder="GitHub PR URL..."
                          value={githubUrl}
                          onChange={(e) => setGithubUrl(e.target.value)}
                          className="px-3 py-1 bg-white border border-[#141414]/10 rounded-full text-[10px] focus:outline-none focus:border-[#141414]/30 w-48"
                        />
                        <button 
                          onClick={fetchFromGitHub}
                          disabled={fetchState === 'fetching'}
                          className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest transition-all ${
                            fetchState === 'done' ? 'bg-emerald-500 text-white' : 'bg-[#141414] text-[#E4E3E0] hover:scale-105'
                          }`}
                        >
                          {fetchState === 'fetching' ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Fetching...
                            </>
                          ) : fetchState === 'done' ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              PR fetched
                            </>
                          ) : (
                            <>
                              <Zap className="w-3 h-3" />
                              Fetch
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="text-[11px] font-mono opacity-50 uppercase block mb-1">Title</label>
                        <input 
                          type="text" 
                          value={prTitle}
                          onChange={(e) => setPrTitle(e.target.value)}
                          className="w-full bg-white border border-[#141414]/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#141414]"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-mono opacity-50 uppercase block mb-1">Description</label>
                        <textarea 
                          value={prDescription}
                          onChange={(e) => setPrDescription(e.target.value)}
                          rows={3}
                          className="w-full bg-white border border-[#141414]/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#141414] resize-none"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-mono opacity-50 uppercase block mb-1">Diff</label>
                        <textarea 
                          value={prDiff}
                          onChange={(e) => setPrDiff(e.target.value)}
                          rows={8}
                          className="w-full bg-white border border-[#141414]/10 rounded px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#141414] resize-none"
                        />
                      </div>
                    </div>
                  </section>

                  <section>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-5 h-5" />
                        <h3 className="font-bold tracking-tight">Knowledge Base</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={syncNotion}
                          disabled={syncState !== 'idle'}
                          className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest transition-all ${
                            syncState === 'done' ? 'bg-emerald-500 text-white' : 'bg-[#141414]/5 hover:bg-[#141414]/10'
                          }`}
                        >
                          {syncState === 'syncing' ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Syncing...
                            </>
                          ) : syncState === 'done' ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              Synced 6 decisions
                            </>
                          ) : (
                            <>
                              <History className="w-3 h-3" />
                              Sync Notion
                            </>
                          )}
                        </button>
                        <button 
                          onClick={() => setDecisions([...decisions, { title: "New Standard", excerpt: "Description here..." }])}
                          className="p-1 hover:bg-[#141414]/5 rounded transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {decisions.map((decision, idx) => (
                        <div key={idx} className="p-4 bg-white border border-[#141414]/10 rounded-lg group relative">
                          <div className="flex items-start justify-between mb-2">
                            <h4 className="text-sm font-bold">{decision.title}</h4>
                            <button 
                              onClick={() => setDecisions(decisions.filter((_, i) => i !== idx))}
                              className="opacity-0 group-hover:opacity-100 text-xs text-red-500 hover:underline transition-opacity"
                            >
                              Remove
                            </button>
                          </div>
                          <p className="text-xs text-[#141414]/60 leading-relaxed font-serif italic">
                            "{decision.excerpt}"
                          </p>
                        </div>
                      ))}
                      <button 
                        onClick={() => setDecisions([...decisions, { title: "New Decision", excerpt: "Enter details here..." }])}
                        className="w-full py-3 border border-dashed border-[#141414]/20 rounded-lg text-xs font-mono opacity-50 hover:opacity-100 hover:bg-[#141414]/5 transition-all"
                      >
                        + Add Reference Document
                      </button>
                    </div>
                  </section>
                </div>

                {/* Right Column: Results */}
                <div className="space-y-8">
                  <AnimatePresence mode="wait">
                    {reviewState === 'idle' ? (
                      <motion.div 
                        key="idle"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="h-full flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-[#141414]/10 rounded-2xl"
                      >
                        <div className="w-16 h-16 bg-[#141414]/5 rounded-full flex items-center justify-center mb-6">
                          <Search className="w-8 h-8 opacity-20" />
                        </div>
                        <h3 className="font-serif italic text-2xl mb-2">Ready for Analysis</h3>
                        <p className="text-sm opacity-50 max-w-xs mx-auto">
                          Input your Pull Request details and engineering standards to begin the automated review process.
                        </p>
                      </motion.div>
                    ) : reviewState === 'loading' ? (
                      <motion.div 
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="h-full flex flex-col items-center justify-center p-12 text-center border border-[#141414]/10 rounded-2xl bg-white/50"
                      >
                        <div className="relative mb-8">
                          <div className="w-20 h-20 border-2 border-[#141414]/5 rounded-full" />
                          <motion.div 
                            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                            className="absolute inset-0 bg-[#141414] rounded-full flex items-center justify-center"
                          >
                            <Activity className="w-8 h-8 text-[#E4E3E0]" />
                          </motion.div>
                        </div>
                        <AnimatePresence mode="wait">
                          <motion.p 
                            key={loadingStep}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            className="text-lg font-serif italic"
                          >
                            {loadingMessages[loadingStep]}
                          </motion.p>
                        </AnimatePresence>
                        
                        <div className="w-64 h-1 bg-[#141414]/5 rounded-full mt-8 overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${(loadingStep + 1) * 25}%` }}
                            transition={{ duration: 0.9, ease: "linear" }}
                            className="h-full bg-[#141414]"
                          />
                        </div>
                      </motion.div>
                    ) : reviewResult ? (
                      <motion.div 
                        key="complete"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="space-y-8"
                      >
                        {/* Risk Overview */}
                        <section className="p-8 bg-[#141414] text-[#E4E3E0] rounded-2xl shadow-xl relative overflow-hidden">
                          <div className="relative z-10">
                            <div className="flex items-center justify-between mb-6">
                              <span className="text-[10px] font-mono uppercase tracking-widest opacity-50">Review Summary</span>
                              <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-orange-500 text-orange-500 text-xs font-bold uppercase tracking-tighter">
                                RISK SCORE: {reviewResult.riskScore}/100 — {reviewResult.riskLevel} 🟠
                              </div>
                            </div>
                            <h2 className="text-xl font-serif italic leading-tight mb-4">
                              SUMMARY:
                            </h2>
                            <p className="text-sm opacity-80 mb-6 leading-relaxed">
                              "{reviewResult.summary}"
                            </p>
                            <div className="flex items-end gap-4">
                              <div className="flex-1 h-2 bg-[#E4E3E0]/10 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${reviewResult.riskScore}%` }}
                                  className="h-full bg-orange-500"
                                />
                              </div>
                              <span className="text-4xl font-mono font-bold leading-none">{reviewResult.riskScore}</span>
                            </div>
                          </div>
                        </section>

                        {/* Violations */}
                        <section>
                          <div className="flex items-center gap-2 mb-4">
                            <AlertTriangle className="w-5 h-5 text-amber-500" />
                            <h3 className="font-bold tracking-tight">VIOLATIONS ({reviewResult.violations.length}):</h3>
                          </div>
                          <div className="space-y-4">
                            {reviewResult.violations.map((v: any, i: number) => (
                              <div key={i} className="bg-white border border-[#141414]/10 rounded-xl overflow-hidden">
                                <div className="p-4 border-b border-[#141414]/5 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className={v.severity.toLowerCase() === 'critical' ? 'text-red-500' : 'text-amber-500'}>
                                      {v.severity.toLowerCase() === 'critical' ? '🔴' : '🟡'}
                                    </span>
                                    <span className="text-xs font-bold uppercase tracking-tight">
                                      {v.severity} — {v.title}
                                    </span>
                                  </div>
                                  <button className="text-[10px] font-mono text-blue-500 hover:underline flex items-center gap-1">
                                    View in Notion <ChevronRight className="w-3 h-3" />
                                  </button>
                                </div>
                                <div className="p-4 space-y-3">
                                  <div className="text-[11px] font-serif italic opacity-60 border-l-2 border-[#141414]/10 pl-3">
                                    Excerpt: "{v.excerpt}"
                                  </div>
                                  <p className="text-sm leading-relaxed">
                                    <span className="font-bold">Issue:</span> {v.issue}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>

                        {/* Knowledge Gaps */}
                        <section>
                          <div className="flex items-center gap-2 mb-4">
                            <Info className="w-5 h-5 text-blue-500" />
                            <h3 className="font-bold tracking-tight">KNOWLEDGE GAPS ({reviewResult.knowledgeGaps.length}):</h3>
                          </div>
                          <div className="grid grid-cols-1 gap-2">
                            {reviewResult.knowledgeGaps.map((gap: string, i: number) => (
                              <div key={i} className="flex items-center gap-3 p-3 bg-white border border-[#141414]/10 rounded-lg text-xs">
                                <ChevronRight className="w-3 h-3 opacity-30" />
                                {gap}
                              </div>
                            ))}
                          </div>
                        </section>

                        {/* Actions */}
                        <div className="flex gap-3 pt-4">
                          <button 
                            onClick={() => {
                              setLogState('logging');
                              setTimeout(() => setLogState('done'), 1500);
                            }}
                            disabled={logState !== 'idle'}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${
                              logState === 'done' ? 'bg-emerald-500 text-white' : 'bg-[#141414] text-[#E4E3E0] hover:bg-[#141414]/90'
                            }`}
                          >
                            {logState === 'logging' ? <Loader2 className="w-4 h-4 animate-spin" /> : logState === 'done' ? <CheckCircle2 className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                            {logState === 'logging' ? 'Logging...' : logState === 'done' ? 'Logged to Notion' : 'Log to Notion'}
                          </button>
                          <button 
                            onClick={() => {
                              setPostState('posting');
                              setTimeout(() => setPostState('done'), 1500);
                            }}
                            disabled={postState !== 'idle'}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 border rounded-xl text-sm font-medium transition-all ${
                              postState === 'done' ? 'bg-emerald-500 text-white border-emerald-500' : 'border-[#141414]/10 bg-white hover:bg-[#141414]/5'
                            }`}
                          >
                            {postState === 'posting' ? <Loader2 className="w-4 h-4 animate-spin" /> : postState === 'done' ? <CheckCircle2 className="w-4 h-4" /> : <Github className="w-4 h-4" />}
                            {postState === 'posting' ? 'Posting...' : postState === 'done' ? 'Comment posted to PR' : 'Post to GitHub'}
                          </button>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm flex items-center justify-between gap-3 shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        <span>{error}</span>
                      </div>
                      <button 
                        onClick={() => setError(null)}
                        className="p-1 hover:bg-red-100 rounded-full transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}

            {activeNav === 'history' && (
              <motion.div 
                key="history"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-7xl mx-auto space-y-8"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-serif italic">Review History</h3>
                  <div className="flex items-center gap-2">
                    <button className="px-4 py-2 bg-white border border-[#141414]/10 rounded-full text-xs font-medium hover:bg-[#141414]/5 transition-colors">
                      Export CSV
                    </button>
                  </div>
                </div>

                <div className="bg-white border border-[#141414]/10 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#141414]/5 border-b border-[#141414]/10">
                        <th className="px-6 py-4 text-[10px] font-mono uppercase tracking-widest opacity-50">PR Title</th>
                        <th className="px-6 py-4 text-[10px] font-mono uppercase tracking-widest opacity-50">Repo</th>
                        <th className="px-6 py-4 text-[10px] font-mono uppercase tracking-widest opacity-50">Risk</th>
                        <th className="px-6 py-4 text-[10px] font-mono uppercase tracking-widest opacity-50 text-center">Violations</th>
                        <th className="px-6 py-4 text-[10px] font-mono uppercase tracking-widest opacity-50">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#141414]/5">
                      {[
                        { title: "feat: Add JWT auth", repo: "acme/backend", risk: "74 HIGH", riskColor: "text-orange-500", violations: 2, date: "just now" },
                        { title: "fix: token refresh", repo: "acme/frontend", risk: "22 LOW", riskColor: "text-emerald-500", violations: 0, date: "2h ago" },
                        { title: "chore: migrate to winston", repo: "acme/backend", risk: "91 CRITICAL", riskColor: "text-red-500", violations: 1, date: "8h ago" },
                        { title: "feat: streaming ETL", repo: "acme/data-pipeline", risk: "45 MED", riskColor: "text-amber-500", violations: 0, date: "1d ago" },
                      ].map((row, i) => (
                        <tr key={i} className="hover:bg-[#141414]/5 transition-colors cursor-pointer group">
                          <td className="px-6 py-4 text-sm font-bold">{row.title}</td>
                          <td className="px-6 py-4 text-xs font-mono opacity-60">{row.repo}</td>
                          <td className={`px-6 py-4 text-xs font-bold ${row.riskColor}`}>{row.risk}</td>
                          <td className="px-6 py-4 text-xs font-mono text-center">{row.violations}</td>
                          <td className="px-6 py-4 text-xs opacity-50">{row.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {activeNav === 'knowledge' && (
              <motion.div 
                key="knowledge"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-7xl mx-auto space-y-8"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-serif italic">Institutional Knowledge</h3>
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-30" />
                      <input 
                        type="text"
                        placeholder="Search decisions..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 pr-4 py-2 bg-white border border-[#141414]/10 rounded-full text-sm focus:outline-none focus:border-[#141414]/30 w-64"
                      />
                    </div>
                    <button 
                      onClick={syncNotion}
                      className="flex items-center gap-2 px-4 py-2 bg-[#141414] text-[#E4E3E0] rounded-full text-sm font-medium"
                    >
                      <History className="w-4 h-4" />
                      Sync with Notion
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[
                    { title: "ADR-005: Authentication Standards", excerpt: "All authentication tokens must be signed using RS256. Secrets must be loaded from environment variables, never hardcoded.", type: "ADR" },
                    { title: "ADR-012: Environment Configuration", excerpt: "No secrets, API keys, or tokens may appear as string literals in source code.", type: "ADR" },
                    { title: "Engineering Standard: API Security", excerpt: "Endpoints must implement rate limiting and input validation for all user-provided data.", type: "Standard" },
                    { title: "ADR-024: Database Migrations", excerpt: "All schema changes must be backward compatible for at least one release cycle.", type: "ADR" }
                  ].map((d, i) => (
                    <motion.div 
                      key={i} 
                      animate={syncState === 'syncing' ? { 
                        backgroundColor: ["#ffffff", "#f0fdf4", "#ffffff"],
                        scale: [1, 1.02, 1],
                        borderColor: ["rgba(20,20,20,0.1)", "rgba(34,197,94,0.3)", "rgba(20,20,20,0.1)"]
                      } : {}}
                      transition={{ duration: 0.8, delay: i * 0.1 }}
                      className="p-8 bg-white border border-[#141414]/10 rounded-2xl space-y-4 shadow-sm hover:border-[#141414]/30 transition-all group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-1 bg-[#141414]/5 rounded text-[10px] font-mono uppercase">{d.type}</span>
                        <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <h4 className="font-bold text-lg leading-tight">{d.title}</h4>
                      <p className="text-sm font-serif italic opacity-70 leading-relaxed">"{d.excerpt}"</p>
                      <div className="pt-4 border-t border-[#141414]/5 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-[10px] font-mono uppercase opacity-50">Verified by Security Team</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeNav === 'settings' && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-2xl mx-auto space-y-8"
              >
                <div className="space-y-2">
                  <h3 className="text-2xl font-serif italic">System Settings</h3>
                  <p className="text-sm opacity-50">Configure your workspace integrations and security parameters.</p>
                </div>

                <div className="space-y-6">
                  <div className="bg-white border border-[#141414]/10 rounded-2xl p-8 space-y-6 shadow-sm">
                    <h4 className="font-bold flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      Integration Config
                    </h4>
                    <div className="space-y-4">
                      <div>
                        <label className="text-[11px] font-mono opacity-50 uppercase block mb-2">Notion API Key</label>
                        <div className="relative">
                          <input 
                            type={showNotionKey ? "text" : "password"} 
                            value={notionKey}
                            onChange={(e) => setNotionKey(e.target.value)}
                            placeholder="secret_xxxxxxxxxxxxxxxx"
                            className="w-full bg-[#141414]/5 border border-[#141414]/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#141414] transition-all pr-10"
                          />
                          <button 
                            onClick={() => setShowNotionKey(!showNotionKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 opacity-30 hover:opacity-100 transition-opacity"
                          >
                            {showNotionKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <StatusDot value={notionKey} />
                      </div>
                      <div>
                        <label className="text-[11px] font-mono opacity-50 uppercase block mb-2">GitHub Webhook Secret</label>
                        <div className="relative">
                          <input 
                            type={showGithubSecret ? "text" : "password"} 
                            value={githubSecret}
                            onChange={(e) => setGithubSecret(e.target.value)}
                            placeholder="whsec_xxxxxxxxxxxxxxxx"
                            className="w-full bg-[#141414]/5 border border-[#141414]/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#141414] transition-all pr-10"
                          />
                          <button 
                            onClick={() => setShowGithubSecret(!showGithubSecret)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 opacity-30 hover:opacity-100 transition-opacity"
                          >
                            {showGithubSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <StatusDot value={githubSecret} />
                      </div>
                      <div>
                        <label className="text-[11px] font-mono opacity-50 uppercase block mb-2">Slack Webhook URL</label>
                        <input 
                          type="text" 
                          value={slackUrl}
                          onChange={(e) => setSlackUrl(e.target.value)}
                          placeholder="https://hooks.slack.com/services/..."
                          className="w-full bg-[#141414]/5 border border-[#141414]/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#141414] transition-all"
                        />
                        <StatusDot value={slackUrl} />
                      </div>
                    </div>

                    <div className="pt-4 border-t border-[#141414]/5 flex items-center justify-between">
                      <p className="text-[10px] opacity-40 max-w-[200px]">All secrets are encrypted at rest and never exposed in client logs.</p>
                      <button 
                        onClick={handleSaveSettings}
                        disabled={saveState === 'saving'}
                        className={`px-8 py-3 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                          saveState === 'saved' ? 'bg-emerald-500 text-white' : 'bg-[#141414] text-[#E4E3E0] hover:scale-105'
                        }`}
                      >
                        {saveState === 'saving' ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Saving...
                          </>
                        ) : saveState === 'saved' ? (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            Settings saved
                          </>
                        ) : (
                          'Save Settings'
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="p-6 bg-white border border-[#141414]/10 rounded-2xl space-y-4">
                    <h4 className="font-bold flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      AI Configuration
                    </h4>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-mono uppercase opacity-50 block mb-1">Model Provider</label>
                        <select 
                          value={selectedModel}
                          onChange={(e) => setSelectedModel(e.target.value)}
                          className="w-full bg-[#141414]/5 border border-[#141414]/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#141414]"
                        >
                          <option>Anthropic Claude Sonnet 4</option>
                          <option>Anthropic Claude Opus 4</option>
                          <option>Google Gemini 2.0 Flash</option>
                          <option>Google Gemini 2.0 Pro</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-mono uppercase opacity-50 block mb-2">Review Strictness</label>
                        <div className="flex gap-2">
                          {(['Lax', 'Balanced', 'Strict'] as const).map((option) => (
                            <button
                              key={option}
                              onClick={() => setStrictness(option)}
                              className={`flex-1 py-2 rounded-full text-xs font-medium transition-all ${
                                strictness === option 
                                  ? 'bg-[#141414] text-white shadow-sm' 
                                  : 'border border-[#141414]/10 text-[#141414]/40 hover:bg-[#141414]/5'
                              }`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 bg-white border border-[#141414]/10 rounded-2xl space-y-4">
                    <h4 className="font-bold flex items-center gap-2 text-red-600">
                      <AlertTriangle className="w-4 h-4" />
                      Danger Zone
                    </h4>
                    
                    <AnimatePresence mode="wait">
                      {resetSuccess ? (
                        <motion.div
                          key="success"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="w-full py-2 text-center text-red-600 text-sm font-bold"
                        >
                          ✓ Data cleared
                        </motion.div>
                      ) : isResetting ? (
                        <motion.div
                          key="confirm"
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          className="flex flex-col gap-3"
                        >
                          <p className="text-xs font-medium text-red-600 text-center">Are you sure? This clears all history.</p>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => setIsResetting(false)}
                              className="flex-1 py-2 bg-[#141414]/5 rounded-lg text-xs font-medium hover:bg-[#141414]/10 transition-colors"
                            >
                              Cancel
                            </button>
                            <button 
                              onClick={handleResetData}
                              className="flex-1 py-2 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors"
                            >
                              Confirm Reset
                            </button>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.button 
                          key="button"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          onClick={() => setIsResetting(true)}
                          className="w-full py-2 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
                        >
                          Reset All Local Data
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Toast Notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: 50 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed bottom-8 right-8 z-50 bg-emerald-500 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-400"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-medium text-sm">✓ Integration config updated successfully</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
