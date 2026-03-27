export interface Stock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

export interface Holding {
  symbol: string;
  shares: number;
  averagePrice: number;
  currentPrice: number;
}

export interface Portfolio {
  id: string;
  name: string;
  balance: number;
  initialBalance: number;
  goal: string;
  riskProfile: 'Conservative' | 'Balanced' | 'Aggressive';
  holdings: Holding[];
  history: Transaction[];
  lastUpdate?: number;
}

export interface Transaction {
  id: string;
  type: 'BUY' | 'SELL';
  symbol: string;
  shares: number;
  price: number;
  timestamp: number;
  agent: string;
  reason: string;
}

export interface AgentMessage {
  agentId: string;
  agentName: string;
  role: string;
  content: string;
  timestamp: number;
}

export const INITIAL_BALANCE = 100000;

export const WATCHLIST = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'BRK.B', 'V', 'JNJ',
  'WMT', 'JPM', 'PG', 'MA', 'UNH', 'HD', 'DIS', 'PYPL', 'BAC', 'ADBE'
];
