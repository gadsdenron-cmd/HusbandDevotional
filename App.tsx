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
  List
} from 'lucide-react';
import { 
  onAuthStateChanged, 
  signInAnonymously, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc 
} from 'firebase/firestore';

import { auth, db } from './services/firebaseService';
import { callGemini, isGeminiConfigured } from './services/geminiService';
import { APP_ID, VERSE_LIBRARY, WISDOM_LIBRARY, SAMPLE_DEVOTIONALS } from './data';
import { UserData, Devotional, Verse, LibraryItem } from './types';
import Button from './components/Button';
import Card from './components/Card';
import ProgressBar from './components/ProgressBar';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'today' | 'progress' | 'warRoom' | 'settings'>('today');
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
  const [showAuditLog, setShowAuditLog] = useState(false);

  // AI State
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const aiResponseRef = useRef<HTMLDivElement>(null);

  // --- Auth & Data Loading ---

  useEffect(() => {
    const initAuth = async () => {
      // Check for valid API key before attempting connection to prevent console errors
      const apiKey = auth.app.options.apiKey;
      const isConfigured = apiKey && apiKey !== "dummy-key" && !apiKey.includes("dummy");

      if (!isConfigured) {
        console.log("Running in Offline Mode (Local Storage)");
        setLoading(false);
        return;
      }

      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.warn("Auth failed, falling back to offline mode", error);
        setLoading(false);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadData = async () => {
      // Wait for auth check to complete
      if (loading) return;

      if (user) {
        // --- Cloud Load ---
        try {
          const userDocRef = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'profile', 'data');
          const docSnap = await getDoc(userDocRef);
          
          if (docSnap.exists()) {
            setUserData(docSnap.data() as UserData);
            const completedCount = Object.keys(docSnap.data().history || {}).length;
            setCurrentDay(completedCount + 1);
          } else {
            // New user defaults
            const initialData: UserData = {
              streak: 0,
              totalCompleted: 0,
              history: {},
              joinedDate: new Date().toISOString()
            };
            await setDoc(userDocRef, initialData);
            setUserData(initialData);
          }
        } catch (err) {
          console.error("Error loading user data:", err);
        }
      } else {
        // --- Local Storage Load ---
        try {
          const savedData = localStorage.getItem(`${APP_ID}_data`);
          if (savedData) {
            const parsed = JSON.parse(savedData) as UserData;
            setUserData(parsed);
            const completedCount = Object.keys(parsed.history || {}).length;
            setCurrentDay(completedCount + 1);
          }
        } catch (err) {
          console.error("Local storage error:", err);
        }
      }
    };

    loadData();
  }, [user, loading]);

  // --- Logic ---

  const todayStr = new Date().toISOString().split('T')[0];
  const isTodayCompleted = userData.history[todayStr]?.completed;

  const getRoleFromTopic = (topic: string): string => {
    const map: Record<string, string> = {
      "Anger": "Peacemaker",
      "Speech": "Listener",
      "Integrity": "Protector",
      "Wisdom": "Learner",
      "Marriage": "Husband",
      "Friendship": "Friend",
      "Money": "Provider",
      "Heart": "Spiritual Leader",
      "Work": "Provider",
      "Family": "Father/Leader",
      "Pride": "Humble Servant",
      "Love Busters": "Repairer",
      "Needs": "Lover",
      "Listening": "Listener",
      "Affection": "Lover",
      "Leadership": "Leader",
      "Romance": "Pursuer"
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
     // 1. Check if we have a static sample for this day
    const staticDevo = SAMPLE_DEVOTIONALS.find(d => d.day === day);
    if (staticDevo) return staticDevo;

    const isFaithDay = day % 2 !== 0; 
    
    // 2. Select Library based on Path
    let sourceItem: LibraryItem;
    let path: 'faith' | 'wisdom';
    
    if (isFaithDay) {
        const combinedLibrary = [...VERSE_LIBRARY, ...customVerses];
        if (combinedLibrary.length === 0) return SAMPLE_DEVOTIONALS[0];
        const index = (day - 8) % combinedLibrary.length;
        sourceItem = combinedLibrary[index];
        path = 'faith';
    } else {
        // Wisdom Path: Use Wisdom Library
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
        source: sourceText || "Unknown Source", // Handle both verse ref and author name
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
    // Optimistic Update
    const newHistory = {
      ...userData.history,
      [todayStr]: {
        completed: true,
        timestamp: new Date().toISOString(),
        dayId: currentDevotional.id.toString()
      }
    };

    // Calculate streak
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    let newStreak = userData.streak;
    if (userData.history[yesterdayStr]) {
      newStreak += 1;
    } else if (!isTodayCompleted) {
       if (userData.streak > 0 && !userData.history[yesterdayStr]) {
         newStreak = 1;
       } else {
         newStreak += 1;
       }
    }

    const newData: UserData = {
      ...userData,
      history: newHistory,
      totalCompleted: userData.totalCompleted + 1,
      streak: newStreak
    };

    setUserData(newData);
    
    if (user) {
      try {
        await setDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'profile', 'data'), newData);
      } catch (e) {
        console.error("Failed to save progress to cloud", e);
      }
    } else {
      // Save to Local Storage
      localStorage.setItem(`${APP_ID}_data`, JSON.stringify(newData));
    }
  };

  // --- AI HANDLERS ---

  const handleAiAsk = async (promptOverride?: string) => {
    setIsAiLoading(true);
    setAiResponse("");
    
    const finalPrompt = promptOverride || aiPrompt;
    if (!finalPrompt.trim()) return;

    const systemInstruction = `You are a wise, masculine, Biblically-grounded marriage coach for men. 
    Your tone is brotherly, direct, encouraging, and tactical (like a special ops briefing).
    You rely on principles from: 
    1. The Bible (Servant Leadership, Husband as Protector).
    2. John Gottman (Repair attempts, turning towards bids).
    3. Willard Harley (Emotional Needs, Love Bank).
    4. Shaunti Feldhahn (Men/Women's inner lives).
    
    Current Context: 
    - User is on Day ${currentDay}.
    - Current Role: ${currentDevotional.role}.
    - Current Topic: ${currentDevotional.title}.
    
    Keep responses short (under 150 words), actionable, and formatted with bullet points if needed.`;

    const response = await callGemini(finalPrompt, systemInstruction);
    setAiResponse(response);
    setIsAiLoading(false);
    
    // Auto scroll to response
    setTimeout(() => {
        aiResponseRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleDraftText = () => {
    const prompt = `Draft 3 distinct text messages I can send to my wife right now. 
    Context: My role today is '${currentDevotional.role}' and the focus is '${currentDevotional.title}'.
    Make them: 1) Playful/Flirty, 2) Deep/Appreciative, 3) Brief/Checking-in. 
    Just give me the texts, labeled.`;
    handleAiAsk(prompt);
  };

  const handleRepairHelp = () => {
    const prompt = `I messed up and there is tension. Help me draft a verbal apology or text to start a repair attempt. 
    Focus on taking responsibility and not being defensive.`;
    handleAiAsk(prompt);
  };

  const handleCsvUpload = () => {
    const lines = csvText.split('\n');
    const parsed = lines.slice(1).map((line, idx) => {
      const parts = line.split(',');
      if (parts.length < 3) return null;
      const ref = parts[0];
      const topic = parts[parts.length - 1];
      const text = parts.slice(1, parts.length - 1).join(',').replace(/"/g, '');
      
      return { id: `custom-${idx}`, reference: ref, text: text, topic: topic?.trim() };
    }).filter(Boolean) as Verse[];
    
    setCustomVerses([...customVerses, ...parsed]);
    alert(`Successfully imported ${parsed.length} verses! The devotional engine will now rotate these into your daily readings.`);
    setCsvText("");
  };

  const copyToClipboard = (text: string) => {
    try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert("Copied to clipboard!");
    } catch (err) {
        console.error('Failed to copy', err);
    }
  };

  // Navigation helper for testing
  const nextDay = () => setCurrentDay(d => d + 1);
  const prevDay = () => setCurrentDay(d => Math.max(1, d - 1));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-500 font-medium animate-pulse">
        Loading your daily briefing...
      </div>
    );
  }

  // --- Views ---

  const renderExplainer = () => (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 relative">
        <button 
          onClick={() => setShowExplainer(false)}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
        >
          <X size={24} />
        </button>
        
        <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center">
           <Shield className="w-6 h-6 mr-2 text-indigo-600" />
           How This Works
        </h3>
        
        <div className="space-y-4">
          <p className="text-slate-600 leading-relaxed text-sm">
            This isn't a book—it's a <strong>briefing</strong>. Designed for 5 minutes of focused action.
          </p>
          
          <div className="space-y-3">
             <div className="flex items-start">
                <div className="w-6 h-6 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold text-xs mt-0.5 mr-3 flex-shrink-0">1</div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Read the Truth</h4>
                  <p className="text-xs text-slate-500">One sentence to frame your leadership.</p>
                </div>
             </div>
             
             <div className="flex items-start">
                <div className="w-6 h-6 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold text-xs mt-0.5 mr-3 flex-shrink-0">2</div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Get the Insight</h4>
                  <p className="text-xs text-slate-500">Why it matters to her heart (not just logic).</p>
                </div>
             </div>

             <div className="flex items-start">
                <div className="w-6 h-6 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold text-xs mt-0.5 mr-3 flex-shrink-0">3</div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Do the Action</h4>
                  <p className="text-xs text-slate-500">One concrete move to build trust today.</p>
                </div>
             </div>

             <div className="flex items-start">
                <div className="w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-xs mt-0.5 mr-3 flex-shrink-0">4</div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm flex items-center">
                    The War Room <Zap size={10} className="ml-1 fill-current" />
                  </h4>
                  <p className="text-xs text-slate-500">Stuck? Use the AI Coach to draft texts, solve conflicts, or find repair words instantly.</p>
                </div>
             </div>
          </div>
        </div>

        <Button onClick={() => setShowExplainer(false)} className="w-full mt-6">
          Got it
        </Button>
      </div>
    </div>
  );

  const renderToday = () => (
    <div className="max-w-md mx-auto space-y-4 pb-24">
      {/* Admin / Nav Controls for Demo */}
      <div className="flex justify-between items-center bg-slate-100 p-2 rounded-lg mb-4">
        <button onClick={prevDay} className="text-xs font-bold text-slate-500 hover:text-slate-900 px-3 py-1">← Prev Day</button>
        <span className="text-xs font-mono text-slate-400">DEV MODE</span>
        <button onClick={nextDay} className="text-xs font-bold text-slate-500 hover:text-slate-900 px-3 py-1">Next Day →</button>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Day {currentDevotional.day} • {currentDevotional.skill}</h2>
          <div className="flex items-center text-slate-900 font-bold text-xl">
             <Shield className="w-5 h-5 mr-2 text-indigo-600" />
             Role: {currentDevotional.role}
          </div>
        </div>
        <div className="flex gap-2">
           <div className="flex items-center bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-sm font-bold">
             <Flame className="w-4 h-4 mr-1" />
             {userData.streak}
           </div>
        </div>
      </div>

      {isTodayCompleted ? (
        <Card className="bg-emerald-50 border-emerald-100 text-center py-10">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-emerald-900 mb-2">Mission Accomplished</h3>
          <p className="text-emerald-700 mb-6">You led your marriage well today.</p>
          <div className="bg-white p-4 rounded-lg shadow-sm text-left max-w-xs mx-auto">
             <p className="text-xs text-slate-400 uppercase font-bold mb-1">Tomorrow's Focus</p>
             <p className="font-medium text-slate-700">Level: {currentDevotional.day < 7 ? "Awareness" : "Leadership"}</p>
          </div>
        </Card>
      ) : (
        <>
          {/* Main Command Card */}
          <Card className="border-t-4 border-t-indigo-600 relative overflow-hidden">
            
            {/* Path Badge */}
            <div className={`absolute top-0 right-0 px-3 py-1 rounded-bl-lg text-[10px] font-bold uppercase tracking-wider ${currentDevotional.path === 'faith' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-800'}`}>
              {currentDevotional.path === 'faith' ? 'Faith Path' : 'Wisdom Path'}
            </div>

            <div className="mb-6 pt-4">
              <h3 className="text-xs font-bold text-indigo-600 uppercase mb-2">Leadership Truth</h3>
              <p className="text-xl font-serif text-slate-900 leading-relaxed">
                "{currentDevotional.truth}"
              </p>
            </div>

            {/* Accordion: Why This Matters */}
            <div className="border-t border-slate-100 py-3">
              <button 
                onClick={() => setExpandedSection(expandedSection === 'why' ? null : 'why')}
                className="flex items-center justify-between w-full text-left font-semibold text-slate-700"
              >
                <span>Why This Matters</span>
                {expandedSection === 'why' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
              
              {expandedSection === 'why' && (
                <div className="mt-3 text-slate-600 space-y-3 animate-in slide-in-from-top-2 duration-200">
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <p className="text-sm italic text-slate-800 font-serif">"{currentDevotional.anchor.text}"</p>
                    <p className="text-xs text-slate-500 mt-1 text-right">— {currentDevotional.anchor.source}</p>
                  </div>
                  <p className="text-sm leading-relaxed">
                    {currentDevotional.insight}
                  </p>
                </div>
              )}
            </div>

            {/* Accordion: What This Means for Her */}
            <div className="border-t border-slate-100 py-3">
              <button 
                onClick={() => setExpandedSection(expandedSection === 'her' ? null : 'her')}
                className="flex items-center justify-between w-full text-left font-semibold text-slate-700"
              >
                <span>Her Perspective</span>
                {expandedSection === 'her' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
              
              {expandedSection === 'her' && (
                <div className="mt-3 text-slate-600 text-sm leading-relaxed animate-in slide-in-from-top-2 duration-200">
                  <div className="flex items-start">
                    <Heart className="w-4 h-4 text-rose-500 mr-2 mt-1 flex-shrink-0" />
                    <p>When you skip this, she doesn't just feel annoyed—she feels unsafe. But when you execute this, she feels protected.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Action Section */}
            <div className="mt-4 bg-indigo-50 p-4 rounded-lg border border-indigo-100">
              <h4 className="text-xs font-bold text-indigo-800 uppercase mb-2">Today's Action</h4>
              <p className="text-indigo-900 font-medium mb-3">{currentDevotional.action}</p>
              
              {currentDevotional.exactWords && (
                <div 
                  onClick={() => copyToClipboard(currentDevotional.exactWords!)}
                  className="bg-white p-3 rounded border border-indigo-100 flex items-center justify-between cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition-colors"
                >
                  <div className="text-sm text-slate-600 italic">
                    "{currentDevotional.exactWords}"
                  </div>
                  <div className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded">Copy</div>
                </div>
              )}
            </div>

            <div className="mt-6">
              <Button onClick={handleComplete} className="w-full text-lg shadow-lg shadow-indigo-200">
                <CheckCircle className="mr-2" />
                I Did This Today
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );

  const renderWarRoom = () => (
    <div className="max-w-md mx-auto pb-24 space-y-4">
      <div className="text-center py-4">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center justify-center">
            <Zap className="w-6 h-6 mr-2 text-indigo-600 fill-indigo-600" />
            The War Room
        </h2>
        <p className="text-slate-500 text-sm">Tactical intelligence for your marriage.</p>
      </div>

      <div className="bg-indigo-600 text-white p-4 rounded-xl shadow-lg relative overflow-hidden">
        {/* Status Indicator */}
        <div className="absolute top-4 right-4 z-20">
          {isGeminiConfigured() ? (
              <span className="flex items-center text-[10px] font-bold bg-emerald-500/20 text-emerald-100 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full mr-1.5 animate-pulse"></div>
                ONLINE
              </span>
          ) : (
              <span className="flex items-center text-[10px] font-bold bg-rose-500/20 text-rose-100 border border-rose-500/30 px-2 py-0.5 rounded-full">
                <div className="w-1.5 h-1.5 bg-rose-400 rounded-full mr-1.5"></div>
                OFFLINE
              </span>
          )}
        </div>

        <div className="relative z-10">
          <h3 className="font-bold text-lg mb-1 flex items-center">
             <Sparkles className="w-4 h-4 mr-2" />
             AI Coach
          </h3>
          <p className="text-indigo-100 text-sm mb-4">
             Current Mission: <strong>Day {currentDay} • {currentDevotional.role}</strong>
          </p>
          <div className="flex gap-2 flex-wrap">
             <button onClick={handleDraftText} className="bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors flex items-center">
                <MessageSquare className="w-3 h-3 mr-1" /> Draft Text for Today
             </button>
             <button onClick={handleRepairHelp} className="bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors flex items-center">
                <RefreshCw className="w-3 h-3 mr-1" /> Help Me Apologize
             </button>
          </div>
        </div>
        <div className="absolute -right-4 -bottom-8 opacity-20">
           <Shield size={120} />
        </div>
      </div>

      <div className="space-y-4">
         {/* Chat Interface */}
         <Card className="min-h-[300px] flex flex-col justify-between">
           <div className="space-y-4 mb-4">
             <div className="flex items-start">
               <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center mr-2 flex-shrink-0">
                 <Shield size={14} className="text-slate-500" />
               </div>
               <div className="bg-slate-100 rounded-lg rounded-tl-none p-3 text-sm text-slate-700">
                  <p>I'm ready. Ask me anything about today's topic ({currentDevotional.topic}) or describe a situation you're facing right now.</p>
               </div>
             </div>

             {aiResponse && (
               <div className="flex items-start animate-in fade-in slide-in-from-bottom-2">
                 <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mr-2 flex-shrink-0">
                   <Sparkles size={14} className="text-indigo-600" />
                 </div>
                 <div ref={aiResponseRef} className="bg-indigo-50 border border-indigo-100 rounded-lg rounded-tl-none p-4 text-sm text-slate-800 leading-relaxed shadow-sm">
                    <p className="whitespace-pre-line">{aiResponse}</p>
                    <div className="mt-2 flex justify-end">
                       <button onClick={() => copyToClipboard(aiResponse)} className="text-xs text-indigo-500 font-bold flex items-center hover:text-indigo-700">
                          <Copy size={12} className="mr-1" /> Copy Plan
                       </button>
                    </div>
                 </div>
               </div>
             )}
             
             {isAiLoading && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="animate-spin text-indigo-500" size={24} />
                </div>
             )}
           </div>

           <div className="relative">
             <input
               type="text"
               value={aiPrompt}
               onChange={(e) => setAiPrompt(e.target.value)}
               placeholder="e.g. She seems distant today..."
               className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
               onKeyDown={(e) => e.key === 'Enter' && handleAiAsk()}
             />
             <button 
               onClick={() => handleAiAsk()}
               disabled={!aiPrompt.trim() || isAiLoading}
               className="absolute right-2 top-2 p-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
             >
               <Send size={16} />
             </button>
           </div>
         </Card>

         <div className="grid grid-cols-2 gap-2">
           <button onClick={() => handleAiAsk("Give me a short prayer for my wife based on today's topic.")} className="p-3 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 text-left">
             🙏 Generate Prayer
           </button>
           <button onClick={() => handleAiAsk("Give me 3 practical date ideas that fit the 'Friend' role.")} className="p-3 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 text-left">
             🍷 Date Night Ideas
           </button>
         </div>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="max-w-md mx-auto pb-24 space-y-6">
      <h2 className="text-xl font-bold text-slate-900 mb-4">Settings & Tools</h2>

      <Card className="bg-slate-900 text-white border-none">
        <div className="flex items-center mb-2">
          <BookOpen className="w-5 h-5 mr-2 text-indigo-400" />
          <h3 className="font-bold">Core Library Loaded</h3>
        </div>
        <p className="text-slate-400 text-sm">
          {VERSE_LIBRARY.length + customVerses.length} proverbs are active in your rotation engine.
        </p>
      </Card>
      
      <Card>
        <h3 className="font-bold text-slate-800 mb-3 flex items-center">
          <Upload className="w-5 h-5 mr-2 text-slate-600" />
          Add More Verses
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          Want to add more? Paste CSV data here (Reference, Verse, Topic).
        </p>
        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder="e.g. Prov 1:1, The proverbs of Solomon, Wisdom"
          className="w-full h-32 p-3 text-xs border border-slate-200 rounded-lg mb-3 font-mono"
        />
        <div className="flex gap-2">
          <Button onClick={handleCsvUpload} variant="secondary" className="w-full text-sm">
            Import Additional
          </Button>
        </div>
      </Card>

      <Card className="border-orange-200 bg-orange-50">
        <h3 className="font-bold text-orange-900 mb-2 flex items-center">
          <List className="w-5 h-5 mr-2" />
          Developer Tools
        </h3>
        <p className="text-sm text-orange-800 mb-4">
           Use this to verify the content rotation for the entire year.
        </p>
        <Button onClick={() => setShowAuditLog(!showAuditLog)} variant="secondary" className="w-full text-sm border-orange-200 text-orange-900 hover:bg-orange-100">
           {showAuditLog ? "Hide Audit Log" : "Generate 365-Day Audit Log"}
        </Button>
        
        {showAuditLog && (
           <div className="mt-4 max-h-96 overflow-y-auto bg-white rounded-lg border border-orange-200 p-2 space-y-2">
              {Array.from({length: 365}, (_, i) => i + 1).map(day => {
                 const data = getDevotionalForDay(day);
                 return (
                    <div key={day} className="text-xs p-2 border-b border-slate-100 last:border-0 hover:bg-slate-50">
                       <div className="flex justify-between font-bold text-slate-700">
                          <span>Day {day}</span>
                          <span className={`px-2 py-0.5 rounded ${data.path === 'faith' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>{data.path}</span>
                       </div>
                       <div className="text-slate-500 mt-1">Role: {data.role}</div>
                       <div className="text-slate-400 mt-0.5 truncate italic">{data.anchor.source} - {data.anchor.text}</div>
                    </div>
                 );
              })}
           </div>
        )}
      </Card>

      <Button onClick={() => signOut(auth)} variant="ghost" className="w-full text-red-500">
        <LogOut className="mr-2" size={16} /> Sign Out
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Overlay Explainer */}
      {showExplainer && renderExplainer()}

      {/* Top Bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10 px-4 py-3 flex justify-between items-center shadow-sm">
         <div className="font-bold text-lg tracking-tight flex items-center">
           <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white mr-2">
             <Shield size={18} fill="currentColor" />
           </div>
           Husband's Plan
         </div>
         
         <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowExplainer(true)} 
              className="flex items-center text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition-colors"
            >
              <Info size={14} className="mr-1" />
              Mission Briefing
            </button>
         </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4">
        {view === 'today' && renderToday()}
        {view === 'warRoom' && renderWarRoom()}
        {view === 'progress' && (
             <div className="max-w-md mx-auto pb-24 space-y-6">
               <div className="text-center py-6">
                  <h2 className="text-2xl font-bold text-slate-900">Your Leadership</h2>
                  <p className="text-slate-500">Consistent actions build trust.</p>
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <Card className="text-center py-6">
                   <div className="text-3xl font-bold text-orange-500 mb-1">{userData.streak}</div>
                   <div className="text-xs text-slate-400 uppercase font-bold">Day Streak</div>
                 </Card>
                 <Card className="text-center py-6">
                   <div className="text-3xl font-bold text-indigo-600 mb-1">{userData.totalCompleted}</div>
                   <div className="text-xs text-slate-400 uppercase font-bold">Total Missions</div>
                 </Card>
               </div>
               <Card>
                 <h3 className="font-bold text-slate-800 mb-4 flex items-center">
                   <Award className="w-5 h-5 mr-2 text-yellow-500" /> 
                   Skill Mastery
                 </h3>
                 <ProgressBar current={userData.totalCompleted} max={30} label="Awareness Level" colorClass="bg-blue-500" />
                 <ProgressBar current={Math.max(0, userData.totalCompleted - 30)} max={60} label="Response Level" colorClass="bg-indigo-500" />
                 <ProgressBar current={Math.max(0, userData.totalCompleted - 90)} max={60} label="Repair Level" colorClass="bg-purple-500" />
               </Card>
             </div>
        )}
        {view === 'settings' && renderSettings()}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 pb-safe pt-2 px-6 flex justify-between items-end z-20 h-20">
        <button 
          onClick={() => setView('today')} 
          className={`flex flex-col items-center pb-4 w-16 ${view === 'today' ? 'text-indigo-600' : 'text-slate-400'}`}
        >
          <div className={`p-1 rounded-full ${view === 'today' ? 'bg-indigo-50' : ''}`}>
            <MessageSquare className="w-6 h-6" />
          </div>
          <span className="text-[10px] font-bold mt-1">Today</span>
        </button>

        <button 
          onClick={() => setView('warRoom')} 
          className={`flex flex-col items-center pb-4 w-16 ${view === 'warRoom' ? 'text-indigo-600' : 'text-slate-400'}`}
        >
          <div className={`p-1 rounded-full ${view === 'warRoom' ? 'bg-indigo-50' : ''}`}>
            <Zap className="w-6 h-6 fill-current" />
          </div>
          <span className="text-[10px] font-bold mt-1">War Room</span>
        </button>
        
        <button 
          onClick={() => setView('progress')} 
          className={`flex flex-col items-center pb-4 w-16 ${view === 'progress' ? 'text-indigo-600' : 'text-slate-400'}`}
        >
          <div className={`p-1 rounded-full ${view === 'progress' ? 'bg-indigo-50' : ''}`}>
             <BarChart2 className="w-6 h-6" />
          </div>
          <span className="text-[10px] font-bold mt-1">Progress</span>
        </button>

        <button 
          onClick={() => setView('settings')} 
          className={`flex flex-col items-center pb-4 w-16 ${view === 'settings' ? 'text-indigo-600' : 'text-slate-400'}`}
        >
          <div className={`p-1 rounded-full ${view === 'settings' ? 'bg-indigo-50' : ''}`}>
            <Settings className="w-6 h-6" />
          </div>
          <span className="text-[10px] font-bold mt-1">Settings</span>
        </button>
      </div>
      
      {/* Mobile Safe Area Spacer */}
      <div className="h-6 w-full bg-white fixed bottom-0 z-30"></div>
    </div>
  );
}