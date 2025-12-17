export interface Verse {
  id?: string;
  reference: string;
  text: string;
  topic: string;
}

export interface WisdomQuote {
  source: string;
  text: string;
  topic: string;
}

export type LibraryItem = Verse | WisdomQuote;

export interface Devotional {
  id: number | string;
  day: number;
  skill: string;
  role: string;
  title: string;
  truth: string;
  anchor: {
    source: string;
    text: string;
  };
  insight: string;
  action: string;
  exactWords: string | null;
  path: 'faith' | 'wisdom';
  topic?: string;
}

export interface HistoryEntry {
  completed: boolean;
  timestamp: string;
  dayId: string;
}

export interface UserData {
  streak: number;
  totalCompleted: number;
  history: Record<string, HistoryEntry>;
  joinedDate: string;
}