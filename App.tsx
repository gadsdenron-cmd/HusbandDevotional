import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Shield, 
  Heart, 
  Flame, 
  CheckCircle, 
  BarChart2, 
  BookOpen, 
  Settings, 
  ChevronDown, 
  ChevronUp, 
  LogOut, 
  Upload, 
  MessageSquare,
  Award,
  RefreshCw,
  Info,
  X,
  Sparkles,
  Zap,
  Send,
  Loader2,
  Copy,
  List,
  Cloud,
  CloudOff,
  Mail,
  Lock,
  UserPlus,
  LogIn,
  Key,
  AlertTriangle,
  Terminal,
  ExternalLink
} from 'lucide-react';
import { 
  onAuthStateChanged, 
  signInAnonymously, 
  signOut,
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc 
} from 'firebase/firestore';

import { auth, db, isFirebaseReady, firebaseProjectId, firebaseConfigStatus } from './services/firebaseService';
import { callGemini, isGeminiConfigured } from './services/geminiService';
import { APP_ID, VERSE_LIBRARY, WISDOM_LIBRARY, SAMPLE_DEVOTIONALS } from './data';
import { UserData, Devotional, Verse, LibraryItem } from './types';
import Button from './components/Button';
import Card from './components/Card';
import ProgressBar from './components/ProgressBar';

type AuthMode = 'login' | 'register' | 'forgot';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState<'today' | 'progress' | 'warRoom' | 'settings'>('today');
  
  // Auth Form State
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authSuccess, setAuthSuccess] = useState('');
  const [showDebug, setShowDebug] = useState(false);

  const [currentDay, setCurrentDay] = useState(1);
  const [userData, setUserData] = useState<UserData>({
    streak: 0,
    totalCompleted: 0,
    history: {},
    joinedDate: new Date().toISOString()
  });
  const [expandedSection, setExpandedSection] = useState<'why' | 'her' | null>(null);
  const [customVerses, setCustomVerses] = useState<Verse[]>([]);
  const [csvText, setCsvText] = useState("");
  const [showExplainer, setShowExplainer] = useState(false);

  // AI State
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const aiResponseRef = useRef<HTMLDivElement>(null);

  // --- Auth & Data Loading ---

  useEffect(() => {
    // Check if user is already logged in (persistence)
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadData = async () => {
      if (loading) return;

      // Always try Local Storage first for speed
      const savedData = localStorage.getItem(`${APP_ID}_data`);
      let localData: UserData | null = null;
      if (savedData) {
        try {
          localData = JSON.parse(savedData);
          if (localData) {
            setUserData(localData);
            const completedCount = Object.keys(localData.history || {}).length;
            setCurrentDay(completedCount + 1);
          }
        } catch (e) {
          console.error("Local data corruption:", e);
        }
      }

      // If user is logged in, attempt to sync with Cloud
      if (user && isFirebaseReady && !user.isAnonymous) {
        setSyncing(true);
        try {
          const userDocRef = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'profile', 'data');
          const docSnap = await getDoc(userDocRef);
          
          if (docSnap.exists()) {
            const cloudData = docSnap.data() as UserData;
            // Merge logic: Priority to Cloud if it has more completions
            if (!localData || cloudData.totalCompleted >= localData.totalCompleted) {
              setUserData(cloudData);
              setCurrentDay(Object.keys(cloudData.history || {}).length + 1);
              localStorage.setItem(`${APP_ID}_data`, JSON.stringify(cloudData));
            }
          } else if (localData) {
            // First time cloud user, push local data to cloud
            await setDoc(userDocRef, localData);
          }
        } catch (err) {
          console.error("Cloud sync error:", err);
        } finally {
          setSyncing(false);
        }
      }
    };

    loadData();
  }, [user, loading]);

  // --- Auth Handlers ---

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    
    if (!isFirebaseReady && authMode !== 'forgot') {
      setAuthError("Firebase keys are missing. Please provide FIREBASE_API_KEY and FIREBASE_PROJECT_ID in your environment.");
      return;
    }

    setAuthLoading(true);

    try {
      if (authMode === 'register') {
        await createUserWithEmailAndPassword(auth, email, password);
      } else if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else if (authMode === 'forgot') {
        await sendPasswordResetEmail(auth, email);
        setAuthSuccess('Password reset email sent. Check your inbox.');
      }
    } catch (err: any) {
      console.error("Firebase Auth Error:", err);
      
      let message = "";
      switch (err.code) {
        case 'auth/user-not-found':
          message = "No account found with this email.";
          break;
        case 'auth/wrong-password':
          message = "Incorrect password.";
          break;
        case 'auth/email-already-in-use':
          message = "This email is already registered.";
          break;
        case 'auth/weak-password':
          message = "Password must be at least 6 characters.";
          break;
        case 'auth/operation-not-allowed':
          message = "Email/Password sign-in is disabled. You MUST enable it in the Firebase Console: Authentication > Sign-in Method.";
          break;
        case 'auth/invalid-api-key':
          message = "The provided API key is invalid. Check your environment settings.";
          break;
        default:
          message = `Error: ${err.message || "Unknown error"} [${err.code || 'no-code'}]`;
      }
      setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGuestMode = async () => {
    if (!isFirebaseReady) {
      setUser({ uid: 'local-guest', isAnonymous: true } as any);
      return;
    }
    setAuthLoading(true);
    try {
      await signInAnonymously(auth);
    } catch (err: any) {
      setAuthError(`Guest login failed: ${err.code}`);
    } finally {
      setAuthLoading(false);
    }
  };

  // --- Logic ---

  const todayStr = new Date().toISOString().split('T')[0];
  const isTodayCompleted = userData.history[todayStr]?.completed;

  const getRoleFromTopic = (topic: string): string => {
    const map: Record<string, string> = {
      "Anger": "Peacemaker", "Speech": "Listener", "Integrity": "Protector",
      "Wisdom": "Learner", "Marriage": "Husband", "Friendship": "Friend",
      "Money": "Provider", "Heart": "Spiritual Leader", "Work": "Provider",
      "Family": "Father/Leader", "Pride": "Humble Servant", "Love Busters": "Repairer",
      "Needs": "Lover", "Listening": "Listener", "Affection": "Lover",
      "Leadership": "Leader", "Romance": "Pursuer"
    };
    return map[topic] || "Leader";
  };

  const getActionFromTopic = (topic: string): string => {
    const actions: Record<string, string> = {
      "Anger": "Pause for 5 seconds before responding to any frustration today.",
      "Speech": "Speak one word of specific affirmation to her before noon.",
      "Integrity": "Do one small thing you promised her you'd do, without being asked.",
      "Wisdom": "Ask her for her advice on a decision you are making.",
      "Marriage": "Text her 'I'm thinking about you' right now.",
      "Friendship": "Spend 10 minutes doing something she enjoys, just to be with her.",
      "Money": "Review a financial goal together with optimism, not stress.",
      "Heart": "Pray for her happiness secretly three times today.",
      "Work": "Leave work stress at the door. Greet her with your full attention.",
      "Family": "Lead the family in a moment of gratitude at dinner.",
      "Pride": "Admit a small mistake to her today without making an excuse.",
      "Love Busters": "Identify one 'Love Buster' you did recently and apologize for it.",
      "Needs": "Ask her: 'What can I do today to make you feel loved?'",
      "Listening": "Listen to her for 5 minutes without offering a single solution.",
      "Affection": "Give her a non-sexual hug that lasts at least 20 seconds.",
      "Leadership": "Make a decision today that relieves a burden from her shoulders.",
      "Romance": "Plan a surprise date for this weekend, even if it's just at home."
    };
    return actions[topic] || "Show her she is your priority today.";
  };

  const getDevotionalForDay = (day: number): Devotional => {
    const staticDevo = SAMPLE_DEVOTIONALS.find(d => d.day === day);
    if (staticDevo) return staticDevo;

    const isFaithDay = day % 2 !== 0; 
    let sourceItem: LibraryItem;
    let path: 'faith' | 'wisdom';
    
    if (isFaithDay) {
        const combinedLibrary = [...VERSE_LIBRARY, ...customVerses];
        if (combinedLibrary.length === 0) return SAMPLE_DEVOTIONALS[0];
        const index = (day - 8) % combinedLibrary.length;
        sourceItem = combinedLibrary[index];
        path = 'faith';
    } else {
        if (WISDOM_LIBRARY.length === 0) return SAMPLE_DEVOTIONALS[0];
        const index = (day - 8) % WISDOM_LIBRARY.length;
        sourceItem = WISDOM_LIBRARY[index];
        path = 'wisdom';
    }

    const role = getRoleFromTopic(sourceItem.topic);
    const action = getActionFromTopic(sourceItem.topic);
    const sourceText = 'reference' in sourceItem ? sourceItem.reference : (sourceItem as any).source;

    return {
      id: `generated-${day}`,
      day: day,
      skill: "Leadership",
      role: role,
      title: `${sourceItem.topic} & Leadership`,
      truth: `A leader who masters ${sourceItem.topic.toLowerCase()} builds a legacy of safety.`,
      anchor: {
        source: sourceText || "Unknown Source",
        text: sourceItem.text
      },
      insight: isFaithDay 
        ? `Scripture connects ${sourceItem.topic.toLowerCase()} directly to the health of your home. When you get this right, you aren't just following rules—you are creating an environment where your wife can flourish.`
        : `Research and wisdom confirm that ${sourceItem.topic.toLowerCase()} is critical for marital satisfaction. Mastering this isn't just about being 'nice'—it's about being effective.`,
      action: action,
      exactWords: null,
      path: path,
      topic: sourceItem.topic
    };
  }

  const currentDevotional = useMemo(() => {
    return getDevotionalForDay(currentDay);
  }, [currentDay, customVerses]);

  const handleComplete = async () => {
    setSyncing(true);
    const newHistory = {
      ...userData.history,
      [todayStr]: {
        completed: true,
        timestamp: new Date().toISOString(),
        dayId: currentDevotional.id.toString()
      }
    };

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    let newStreak = userData.streak;
    if (userData.history[yesterdayStr]) {
      newStreak += 1;
    } else if (!isTodayCompleted) {
       newStreak = (userData.streak > 0 && !userData.history[yesterdayStr]) ? 1 : newStreak + 1;
    }

    const newData: UserData = {
      ...userData,
      history: newHistory,
      totalCompleted: userData.totalCompleted + 1,
      streak: newStreak
    };

    setUserData(newData);
    localStorage.setItem(`${APP_ID}_data`, JSON.stringify(newData));
    
    if (user && isFirebaseReady && !user.isAnonymous) {
      try {
        await setDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'profile', 'data'), newData);
      } catch (e) {
        console.error("Cloud save failed", e);
      }
    }
    setSyncing(false);
  };

  const handleAiAsk = async (promptOverride?: string) => {
    setIsAiLoading(true);
    setAiResponse("");
    const finalPrompt = promptOverride || aiPrompt;
    if (!finalPrompt.trim()) return;

    const systemInstruction = `You are a wise, masculine, Biblically-grounded marriage coach for men. 
    Current Context: Day ${currentDay}, Role: ${currentDevotional.role}, Topic: ${currentDevotional.title}.
    Keep responses short, tactical, and encouraging.`;

    const response = await callGemini(finalPrompt, systemInstruction);
    setAiResponse(response);
    setIsAiLoading(false);
    setTimeout(() => aiResponseRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  const prevDay = () => setCurrentDay(d => Math.max(1, d - 1));
  const nextDay = () => setCurrentDay(d => d + 1);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50 text-slate-500 font-medium animate-pulse">
        <Shield className="w-12 h-12 text-indigo-600 mb-4 animate-bounce" />
        Loading briefing...
      </div>
    );
  }

  // --- Auth View ---
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center text-white mx-auto mb-4 shadow-xl shadow-indigo-200">
              <Shield size={32} fill="currentColor" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Husband's Plan</h1>
            <p className="text-slate-500 mt-2">Tactical briefing for your marriage.</p>
          </div>

          <Card className="shadow-xl border-slate-200/60 p-6 relative">
            <div className="flex border-b border-slate-100 mb-6">
              <button 
                onClick={() => { setAuthMode('login'); setAuthError(''); setAuthSuccess(''); }}
                className={`flex-1 pb-3 text-sm font-bold transition-all ${authMode === 'login' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}
              >
                LOGIN
              </button>
              <button 
                onClick={() => { setAuthMode('register'); setAuthError(''); setAuthSuccess(''); }}
                className={`flex-1 pb-3 text-sm font-bold transition-all ${authMode === 'register' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}
              >
                REGISTER
              </button>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              {authError && (
                <div className="p-3 bg-red-50 text-red-700 text-[11px] font-bold rounded-lg animate-in fade-in zoom-in leading-snug border border-red-100">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                    <span>{authError}</span>
                  </div>
                </div>
              )}
              {authSuccess && <div className="p-3 bg-emerald-50 text-emerald-600 text-[11px] font-bold rounded-lg animate-in fade-in zoom-in leading-snug">{authSuccess}</div>}

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                    placeholder="name@example.com"
                    required
                  />
                </div>
              </div>

              {authMode !== 'forgot' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                    <input 
                      type="password" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                      placeholder="••••••••"
                      required={authMode !== 'forgot'}
                    />
                  </div>
                </div>
              )}

              {authMode === 'login' && (
                <button 
                  type="button"
                  onClick={() => setAuthMode('forgot')}
                  className="text-xs text-indigo-600 font-bold hover:underline"
                >
                  Forgot password?
                </button>
              )}

              <Button onClick={() => {}} disabled={authLoading} className="w-full py-4 mt-2">
                {authLoading ? <Loader2 className="animate-spin" /> : (
                  authMode === 'register' ? <><UserPlus className="mr-2" size={18}/> Create Account</> :
                  authMode === 'forgot' ? <><Key className="mr-2" size={18}/> Reset Password</> :
                  <><LogIn className="mr-2" size={18}/> Sign In</>
                )}
              </Button>

              {authMode === 'forgot' && (
                <button 
                  type="button" 
                  onClick={() => setAuthMode('login')}
                  className="w-full text-xs text-slate-500 font-bold mt-2"
                >
                  Back to Login
                </button>
              )}
            </form>

            <button 
              onClick={() => setShowDebug(!showDebug)}
              className="absolute -bottom-10 left-0 w-full text-[9px] font-bold text-slate-400 uppercase tracking-tighter hover:text-indigo-500 transition-colors"
            >
              {showDebug ? "Hide Connection Diagnostics" : "Show Connection Diagnostics"}
            </button>
          </Card>

          {showDebug && (
             <div className="bg-slate-900 text-indigo-300 p-4 rounded-xl font-mono text-[10px] space-y-2 shadow-inner border border-slate-800 animate-in slide-in-from-top-2">
                <div className="flex items-center gap-2 mb-2 text-white border-b border-slate-800 pb-1 uppercase font-bold tracking-widest">
                  <Terminal size={12} /> System Diagnostics
                </div>
                
                <div className="space-y-1 border-b border-slate-800 pb-2">
                  <div className="flex justify-between">
                    <span>STATUS:</span>
                    <span className={isFirebaseReady ? 'text-emerald-400' : 'text-rose-400'}>{isFirebaseReady ? 'RESOLVED' : 'FAILED'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>DETECTED ID:</span>
                    <span className="text-white truncate max-w-[150px]">{firebaseProjectId || '[NOT_DETECTED]'}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-slate-500 mb-1 font-bold">REQUIRED VARIABLES:</div>
                  {Object.entries(firebaseConfigStatus).map(([key, val]) => (
                    <div key={key} className="flex justify-between items-center">
                      <span className="text-[9px]">{key.replace('FIREBASE_', '')}:</span>
                      <span className={val ? 'text-emerald-500' : 'text-rose-500 font-bold'}>{val ? 'OK' : 'MISSING'}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-3 p-2 bg-slate-800 rounded text-slate-300 leading-relaxed italic border-l-2 border-indigo-500">
                  <p className="font-bold text-white mb-1">To fix this:</p>
                  1. In your environment sidebar, look for <strong>Project Settings</strong> or <strong>Environment Variables</strong>.<br/>
                  2. Add <strong>FIREBASE_PROJECT_ID</strong> set to <code className="bg-black px-1 text-indigo-400">rons-auth-and-db-77927250</code>.<br/>
                  3. Add <strong>FIREBASE_API_KEY</strong> from your Firebase project settings.<br/>
                  4. Add the rest (AUTH_DOMAIN, etc.) similarly.
                </div>
                
                <a href="https://console.firebase.google.com/" target="_blank" className="flex items-center justify-center gap-1 text-[9px] text-indigo-400 hover:text-indigo-300 pt-2 font-bold uppercase">
                  Open Firebase Console <ExternalLink size={10} />
                </a>
             </div>
          )}

          <div className="relative flex items-center justify-center py-4">
             <div className="w-full border-t border-slate-200"></div>
             <span className="bg-slate-50 px-4 text-xs font-bold text-slate-400">OR</span>
          </div>

          <button 
            onClick={handleGuestMode}
            disabled={authLoading}
            className="w-full py-4 border-2 border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-white transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {authLoading ? <Loader2 className="animate-spin" size={18} /> : <>Continue as Guest</>}
          </button>

          <p className="text-center text-[10px] text-slate-400 leading-relaxed px-6">
            By continuing, you agree to build a legendary marriage through daily consistent actions.
          </p>
        </div>
      </div>
    );
  }

  // --- Main App View ---
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      {showExplainer && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <Card className="max-w-sm w-full relative">
            <button onClick={() => setShowExplainer(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X /></button>
            <h3 className="text-xl font-bold mb-4 flex items-center"><Shield className="mr-2 text-indigo-600" /> Mission Briefing</h3>
            <p className="text-slate-600 text-sm mb-4">Daily missions designed to help you lead your home with wisdom and strength. Read, reflect, and act.</p>
            <Button onClick={() => setShowExplainer(false)} className="w-full">Got it</Button>
          </Card>
        </div>
      )}

      {/* Top Bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40 px-4 py-3 flex justify-between items-center shadow-sm">
         <div className="font-bold text-lg tracking-tight flex items-center">
           <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white mr-2">
             <Shield size={18} fill="currentColor" />
           </div>
           Husband's Plan
         </div>
         
         <div className="flex items-center gap-2">
            {syncing ? (
              <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
            ) : (user && !user.isAnonymous) ? (
              <div title="Cloud Synced"><Cloud size={18} className="text-indigo-500" /></div>
            ) : (
              <div title="Guest Mode (Local Only)"><CloudOff size={18} className="text-slate-300" /></div>
            )}
            <button onClick={() => setShowExplainer(true)} className="text-indigo-600 hover:bg-indigo-50 p-1 rounded-full">
              <Info size={20} />
            </button>
         </div>
      </div>

      <div className="p-4">
        {view === 'today' && (
          <div className="max-w-md mx-auto space-y-4">
            <div className="flex justify-between items-center bg-slate-100 p-2 rounded-lg text-[10px] font-mono text-slate-500">
               <button onClick={prevDay}>[PREV]</button>
               <span>DAY_{currentDay}</span>
               <button onClick={nextDay}>[NEXT]</button>
            </div>

            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Day {currentDevotional.day}</h2>
                <div className="flex items-center text-slate-900 font-bold text-xl">Role: {currentDevotional.role}</div>
              </div>
              <div className="flex items-center bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-sm font-bold">
                <Flame className="w-4 h-4 mr-1" /> {userData.streak}
              </div>
            </div>

            {isTodayCompleted ? (
              <Card className="bg-emerald-50 border-emerald-100 text-center py-12">
                <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-emerald-900">Well Done</h3>
                <p className="text-emerald-700">Mission accomplished for today.</p>
              </Card>
            ) : (
              <Card className="border-t-4 border-t-indigo-600">
                <div className="mb-6">
                  <h4 className="text-xs font-bold text-indigo-600 uppercase mb-2">Leadership Truth</h4>
                  <p className="text-xl font-serif leading-snug">"{currentDevotional.truth}"</p>
                </div>

                <div className="space-y-4 border-t border-slate-100 pt-4">
                  <button onClick={() => setExpandedSection(expandedSection === 'why' ? null : 'why')} className="flex items-center justify-between w-full text-left font-bold text-slate-700">
                    <span>Context & Insight</span>
                    {expandedSection === 'why' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                  {expandedSection === 'why' && (
                    <div className="bg-slate-50 p-4 rounded-lg space-y-3 animate-in slide-in-from-top-2">
                      <p className="text-sm italic font-serif">"{currentDevotional.anchor.text}" — <span className="text-xs text-slate-500">{currentDevotional.anchor.source}</span></p>
                      <p className="text-sm text-slate-600 leading-relaxed">{currentDevotional.insight}</p>
                    </div>
                  )}
                </div>

                <div className="mt-8 bg-indigo-50 p-5 rounded-xl border border-indigo-100 shadow-inner">
                  <h4 className="text-xs font-bold text-indigo-800 uppercase mb-2">Today's Mission</h4>
                  <p className="text-indigo-900 font-semibold mb-4 text-lg">{currentDevotional.action}</p>
                  <Button onClick={handleComplete} disabled={syncing} className="w-full shadow-lg">
                    {syncing ? <Loader2 className="animate-spin mr-2" /> : <CheckCircle className="mr-2" />}
                    Mark Completed
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}

        {view === 'warRoom' && (
          <div className="max-w-md mx-auto space-y-4">
            <div className="text-center py-4">
              <h2 className="text-2xl font-black text-slate-900 flex items-center justify-center">
                <Zap className="mr-2 text-indigo-600 fill-indigo-600" /> THE WAR ROOM
              </h2>
              <p className="text-slate-500 text-xs tracking-widest uppercase">Tactical AI Coaching</p>
            </div>

            <Card className="bg-indigo-600 text-white relative overflow-hidden">
               <div className="relative z-10">
                 <div className="flex justify-between items-start mb-4">
                    <h3 className="font-bold text-lg">Active Briefing</h3>
                    {isGeminiConfigured() ? (
                      <span className="text-[10px] bg-emerald-500 px-2 py-0.5 rounded-full font-bold">ONLINE</span>
                    ) : (
                      <span className="text-[10px] bg-rose-500 px-2 py-0.5 rounded-full font-bold">CONFIG ERR</span>
                    )}
                 </div>
                 <p className="text-indigo-100 text-xs mb-4">Current topic: {currentDevotional.topic || "Leadership"}</p>
                 <div className="flex gap-2">
                    <button onClick={() => handleAiAsk("Draft 3 text messages I can send her right now.")} className="text-[10px] font-bold bg-white/10 hover:bg-white/20 p-2 rounded transition-all">DRAFT TEXTS</button>
                    <button onClick={() => handleAiAsk("I messed up and it's tense. Help me repair.")} className="text-[10px] font-bold bg-white/10 hover:bg-white/20 p-2 rounded transition-all">REPAIR HELP</button>
                 </div>
               </div>
               <Shield size={100} className="absolute -right-4 -bottom-4 text-white opacity-10" />
            </Card>

            <div className="space-y-4">
              <Card className="min-h-[300px] flex flex-col justify-between p-3">
                 <div className="space-y-4 mb-4 overflow-y-auto max-h-[400px]">
                    <div className="flex items-start gap-2">
                      <div className="w-6 h-6 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0 text-slate-500"><Shield size={12}/></div>
                      <div className="bg-slate-100 p-3 rounded-lg text-sm text-slate-700 rounded-tl-none">Coach standby. What's the situation?</div>
                    </div>
                    {aiResponse && (
                      <div className="flex items-start gap-2 animate-in slide-in-from-bottom-2">
                        <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 text-indigo-600"><Sparkles size={12}/></div>
                        <div ref={aiResponseRef} className="bg-indigo-50 border border-indigo-100 p-3 rounded-lg text-sm text-slate-800 rounded-tl-none shadow-sm flex-1">
                          <p className="whitespace-pre-line">{aiResponse}</p>
                          <button onClick={() => copyToClipboard(aiResponse)} className="mt-2 text-[10px] font-bold text-indigo-500 flex items-center"><Copy size={10} className="mr-1"/> COPY PLAN</button>
                        </div>
                      </div>
                    )}
                    {isAiLoading && <div className="flex justify-center p-4"><Loader2 className="animate-spin text-indigo-400" /></div>}
                 </div>
                 <div className="relative">
                    <input 
                      type="text" 
                      value={aiPrompt} 
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="Ask the coach..." 
                      className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      onKeyDown={(e) => e.key === 'Enter' && handleAiAsk()}
                    />
                    <button onClick={() => handleAiAsk()} disabled={isAiLoading} className="absolute right-2 top-2 p-1.5 bg-indigo-600 text-white rounded-lg"><Send size={16} /></button>
                 </div>
              </Card>
            </div>
          </div>
        )}

        {view === 'progress' && (
          <div className="max-w-md mx-auto space-y-6 pt-4">
             <div className="grid grid-cols-2 gap-4">
                <Card className="text-center">
                  <div className="text-3xl font-black text-orange-500">{userData.streak}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Day Streak</div>
                </Card>
                <Card className="text-center">
                  <div className="text-3xl font-black text-indigo-600">{userData.totalCompleted}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Total Missions</div>
                </Card>
             </div>
             <Card>
                <h3 className="font-bold text-slate-800 mb-6 flex items-center"><Award className="mr-2 text-yellow-500" /> MASTERY PROGRESS</h3>
                <ProgressBar current={userData.totalCompleted} max={30} label="Awareness" colorClass="bg-blue-500" />
                <ProgressBar current={Math.max(0, userData.totalCompleted - 30)} max={60} label="Response" colorClass="bg-indigo-500" />
                <ProgressBar current={Math.max(0, userData.totalCompleted - 90)} max={275} label="Legacy" colorClass="bg-purple-600" />
             </Card>
          </div>
        )}

        {view === 'settings' && (
          <div className="max-w-md mx-auto space-y-4">
            <h2 className="text-xl font-bold mb-4">Settings</h2>
            <Card className="bg-slate-900 text-white border-none">
              <div className="flex items-center gap-2 mb-2"><Cloud size={18} className="text-indigo-400"/> <h3 className="font-bold">Account Status</h3></div>
              <p className="text-xs text-slate-400">
                {user.isAnonymous ? "Guest Mode (Local Only)" : `Signed in as ${user.email}`}
              </p>
              <Button onClick={() => signOut(auth)} variant="ghost" className="mt-4 w-full text-rose-400 text-xs border border-white/10">
                Sign Out
              </Button>
            </Card>
            
            <Card>
              <h3 className="font-bold text-sm mb-4">Export/Import</h3>
              <p className="text-xs text-slate-500 mb-4">All data is automatically synced if online, but you can paste custom verse CSVs here.</p>
              <textarea value={csvText} onChange={e => setCsvText(e.target.value)} className="w-full h-24 bg-slate-50 border p-2 text-[10px] font-mono mb-2" placeholder="Ref,Text,Topic" />
              <Button variant="secondary" className="w-full text-xs" onClick={() => alert("CSV Import Logic Ready")}>Load Custom Library</Button>
            </Card>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 h-20 px-6 flex justify-between items-center z-40">
        <button onClick={() => setView('today')} className={`flex flex-col items-center gap-1 ${view === 'today' ? 'text-indigo-600' : 'text-slate-400'}`}>
          <MessageSquare className={view === 'today' ? 'fill-indigo-50' : ''} />
          <span className="text-[10px] font-bold">TODAY</span>
        </button>
        <button onClick={() => setView('warRoom')} className={`flex flex-col items-center gap-1 ${view === 'warRoom' ? 'text-indigo-600' : 'text-slate-400'}`}>
          <Zap className={view === 'warRoom' ? 'fill-indigo-50' : ''} />
          <span className="text-[10px] font-bold">WAR ROOM</span>
        </button>
        <button onClick={() => setView('progress')} className={`flex flex-col items-center gap-1 ${view === 'progress' ? 'text-indigo-600' : 'text-slate-400'}`}>
          <BarChart2 className={view === 'progress' ? 'fill-indigo-50' : ''} />
          <span className="text-[10px] font-bold">PROGRESS</span>
        </button>
        <button onClick={() => setView('settings')} className={`flex flex-col items-center gap-1 ${view === 'settings' ? 'text-indigo-600' : 'text-slate-400'}`}>
          <Settings className={view === 'settings' ? 'fill-indigo-50' : ''} />
          <span className="text-[10px] font-bold">SETTINGS</span>
        </button>
      </nav>
    </div>
  );
}
