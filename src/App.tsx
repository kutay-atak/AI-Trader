import React, { useState, useEffect, useRef } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  PieChart, 
  MessageSquare, 
  RefreshCw, 
  ArrowUpRight, 
  ArrowDownRight,
  BrainCircuit,
  History,
  LayoutDashboard,
  Settings,
  ChevronRight,
  Activity
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { 
  Portfolio, 
  Holding, 
  Transaction, 
  AgentMessage, 
  INITIAL_BALANCE, 
  WATCHLIST 
} from './types';
import { 
  getMarketInsights, 
  runAgentDebate, 
  getLivePrices 
} from './services/aiService';

const AGENT_COLORS: Record<string, string> = {
  MacroMax: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  ChartChi: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  ValueVal: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  BuzzBot: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  RiskRick: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
};

const formatCurrency = (val: number) => {
  if (isNaN(val)) return '$0.00';
  return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatPercent = (val: number) => {
  if (isNaN(val)) return '0.00%';
  return `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
};

const formatNumber = (val: number) => {
  if (isNaN(val)) return '0';
  return val.toLocaleString();
};

export default function App() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>(() => {
    const saved = localStorage.getItem('aegis_portfolios');
    const safeNum = (val: any, fallback: number) => {
      const n = Number(val);
      return isNaN(n) ? fallback : n;
    };

    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map((p: any) => ({
        ...p,
        balance: safeNum(p.balance, INITIAL_BALANCE),
        initialBalance: safeNum(p.initialBalance, INITIAL_BALANCE),
        holdings: (p.holdings || []).map((h: any) => ({
          ...h,
          shares: safeNum(h.shares, 0),
          averagePrice: safeNum(h.averagePrice, 0),
          currentPrice: safeNum(h.currentPrice, 0)
        })),
        history: (p.history || []).map((t: any) => ({
          ...t,
          shares: safeNum(t.shares, 0),
          price: safeNum(t.price, 0)
        }))
      }));
    }
    
    return [{
      id: 'default',
      name: 'Main Portfolio',
      balance: INITIAL_BALANCE,
      initialBalance: INITIAL_BALANCE,
      goal: 'Wealth Accumulation',
      riskProfile: 'Balanced',
      holdings: [],
      history: [],
      lastUpdate: Date.now()
    }];
  });

  const [activePortfolioId, setActivePortfolioId] = useState<string>(() => {
    return localStorage.getItem('aegis_active_id') || 'default';
  });

  const [showNewPortfolioModal, setShowNewPortfolioModal] = useState(false);
  const [showAddFundsModal, setShowAddFundsModal] = useState(false);
  const [newPortfolioData, setNewPortfolioData] = useState({
    name: '',
    goal: 'Retirement Fund',
    riskProfile: 'Balanced' as Portfolio['riskProfile'],
    initialBalance: 100000
  });
  const [addFundsAmount, setAddFundsAmount] = useState(10000);

  const portfolio = portfolios.find(p => p.id === activePortfolioId) || portfolios[0];

  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'agents' | 'history'>('dashboard');
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({});
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('aegis_portfolios', JSON.stringify(portfolios));
    localStorage.setItem('aegis_active_id', activePortfolioId);
  }, [portfolios, activePortfolioId]);

  const updateActivePortfolio = (updates: Partial<Portfolio>) => {
    setPortfolios(prev => prev.map(p => 
      p.id === activePortfolioId ? { ...p, ...updates } : p
    ));
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const updatePrices = async () => {
    const symbols = [...new Set([...WATCHLIST, ...portfolio.holdings.map(h => h.symbol)])];
    const prices = await getLivePrices(symbols);
    setMarketPrices(prices);
    
    // Update portfolio holdings with new prices
    setPortfolios(prev => prev.map(p => ({
      ...p,
      holdings: p.holdings.map(h => ({
        ...h,
        currentPrice: prices[h.symbol] || h.currentPrice
      }))
    })));
  };

  useEffect(() => {
    updatePrices();
    const interval = setInterval(updatePrices, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const handleAIAnalysis = async () => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setActiveTab('agents');

    try {
      const insights = await getMarketInsights(WATCHLIST);
      const { messages: newMessages, decision } = await runAgentDebate(portfolio, insights, messages);
      
      // Stream messages for effect
      for (const msg of newMessages) {
        setMessages(prev => [...prev, msg]);
        await new Promise(resolve => setTimeout(resolve, 800));
      }

      if (decision && decision.type !== 'HOLD') {
        executeTrade(decision);
      }
    } catch (error) {
      console.error("Analysis failed", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const executeTrade = (decision: any) => {
    const { type, symbol, shares, reason } = decision;
    const price = marketPrices[symbol] || 150;
    const cost = price * shares;

    setPortfolios(prev => prev.map(p => {
      if (p.id !== activePortfolioId) return p;

      let newBalance = p.balance;
      let newHoldings = [...p.holdings];

      if (type === 'BUY') {
        if (newBalance < cost) return p;
        newBalance -= cost;
        const existingIdx = newHoldings.findIndex(h => h.symbol === symbol);
        if (existingIdx >= 0) {
          const h = newHoldings[existingIdx];
          const totalShares = h.shares + shares;
          const avgPrice = (h.shares * h.averagePrice + cost) / totalShares;
          newHoldings[existingIdx] = { ...h, shares: totalShares, averagePrice: avgPrice };
        } else {
          if (newHoldings.length >= 10) return p;
          newHoldings.push({ symbol, shares, averagePrice: price, currentPrice: price });
        }
      } else if (type === 'SELL') {
        const existingIdx = newHoldings.findIndex(h => h.symbol === symbol);
        if (existingIdx < 0) return p;
        const h = newHoldings[existingIdx];
        const sellShares = Math.min(h.shares, shares);
        newBalance += sellShares * price;
        if (h.shares === sellShares) {
          newHoldings.splice(existingIdx, 1);
        } else {
          newHoldings[existingIdx] = { ...h, shares: h.shares - sellShares };
        }
      }

      const transaction: Transaction = {
        id: Math.random().toString(36).substr(2, 9),
        type,
        symbol,
        shares,
        price,
        timestamp: Date.now(),
        agent: 'RiskRick',
        reason
      };

      return {
        ...p,
        balance: newBalance,
        holdings: newHoldings,
        history: [transaction, ...p.history]
      };
    }));
  };

  const createPortfolio = () => {
    const newP: Portfolio = {
      id: Math.random().toString(36).substr(2, 9),
      name: newPortfolioData.name || 'New Portfolio',
      balance: newPortfolioData.initialBalance,
      initialBalance: newPortfolioData.initialBalance,
      goal: newPortfolioData.goal,
      riskProfile: newPortfolioData.riskProfile,
      holdings: [],
      history: [],
      lastUpdate: Date.now()
    };
    setPortfolios(prev => [...prev, newP]);
    setActivePortfolioId(newP.id);
    setShowNewPortfolioModal(false);
    setNewPortfolioData({ name: '', goal: 'Retirement Fund', riskProfile: 'Balanced', initialBalance: 100000 });
  };

  const addFunds = () => {
    updateActivePortfolio({
      balance: portfolio.balance + addFundsAmount,
      initialBalance: portfolio.initialBalance + addFundsAmount
    });
    setShowAddFundsModal(false);
  };

  const totalEquity = portfolio.holdings.reduce((sum, h) => sum + h.shares * h.currentPrice, 0);
  const totalValue = portfolio.balance + totalEquity;
  const pnl = totalValue - portfolio.initialBalance;
  const pnlPercent = (pnl / portfolio.initialBalance) * 100;

  const chartData = [
    { name: 'Start', value: portfolio.initialBalance },
    ...portfolio.history.slice().reverse().map((t, i) => ({
      name: new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      value: portfolio.initialBalance + portfolio.history.slice().reverse().slice(0, i + 1).reduce((acc, curr) => {
        // This is a simplified chart logic for the demo
        return acc + (curr.type === 'SELL' ? 1000 : -500); // Mocking value change for visual
      }, 0)
    })),
    { name: 'Now', value: totalValue }
  ];

  return (
    <div className="min-h-screen bg-[#0e0e10] text-gray-100 font-sans selection:bg-blue-500/30">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-[#18181b] border-r border-white/5 flex flex-col z-20">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <BrainCircuit className="text-white w-6 h-6" />
          </div>
          <span className="font-bold text-xl tracking-tight">Aegis AI</span>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-6 overflow-y-auto custom-scrollbar">
          <div className="space-y-2">
            <span className="px-4 text-[10px] text-gray-500 uppercase tracking-widest font-bold">Menu</span>
            <NavItem 
              icon={<LayoutDashboard size={20} />} 
              label="Dashboard" 
              active={activeTab === 'dashboard'} 
              onClick={() => setActiveTab('dashboard')} 
            />
            <NavItem 
              icon={<MessageSquare size={20} />} 
              label="AI Agents" 
              active={activeTab === 'agents'} 
              onClick={() => setActiveTab('agents')} 
            />
            <NavItem 
              icon={<History size={20} />} 
              label="History" 
              active={activeTab === 'history'} 
              onClick={() => setActiveTab('history')} 
            />
          </div>

          <div className="space-y-2">
            <div className="px-4 flex items-center justify-between">
              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Portfolios</span>
              <button 
                onClick={() => setShowNewPortfolioModal(true)}
                className="p-1 hover:bg-white/10 rounded-lg text-blue-400 transition-colors"
                title="Create New Portfolio"
              >
                <ArrowUpRight size={14} />
              </button>
            </div>
            {portfolios.map(p => (
              <button 
                key={p.id}
                onClick={() => setActivePortfolioId(p.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 group text-left",
                  activePortfolioId === p.id 
                    ? "bg-white/5 text-blue-400 border border-white/10" 
                    : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
                )}
              >
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  activePortfolioId === p.id ? "bg-blue-500" : "bg-gray-600"
                )} />
                <div className="flex-1 overflow-hidden">
                  <div className="font-semibold text-sm truncate">{p.name}</div>
                  <div className="text-[10px] opacity-50 truncate">{p.goal}</div>
                </div>
              </button>
            ))}
          </div>
        </nav>

        <div className="p-4 mt-auto">
          <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Status</span>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[10px] text-emerald-500 font-bold">LIVE</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              5 Agents actively monitoring US markets.
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 p-8 max-w-7xl mx-auto">
        <header className="flex items-center justify-between mb-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-3xl font-bold">{portfolio.name}</h1>
              <span className={cn(
                "px-2 py-0.5 text-[10px] font-bold rounded border uppercase tracking-wider",
                portfolio.riskProfile === 'Aggressive' ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                portfolio.riskProfile === 'Conservative' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                "bg-blue-500/10 text-blue-400 border-blue-500/20"
              )}>
                {portfolio.riskProfile}
              </span>
            </div>
            <p className="text-gray-400">Goal: {portfolio.goal}</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowAddFundsModal(true)}
              className="flex items-center gap-2 px-6 py-3 rounded-full font-semibold bg-white/5 hover:bg-white/10 border border-white/10 transition-all active:scale-95"
            >
              <Wallet size={18} />
              Add Funds
            </button>
            <button 
              onClick={handleAIAnalysis}
              disabled={isAnalyzing}
              className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-full font-semibold transition-all duration-300",
                isAnalyzing 
                  ? "bg-white/5 text-gray-500 cursor-not-allowed" 
                  : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20 active:scale-95"
              )}
            >
              {isAnalyzing ? <RefreshCw className="animate-spin" size={18} /> : <Activity size={18} />}
              {isAnalyzing ? "AI Analyzing..." : "Trigger AI Analysis"}
            </button>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard 
                label="Total Value" 
                value={formatCurrency(totalValue)}
                subValue={`${pnl >= 0 ? '+' : ''}${formatCurrency(Math.abs(pnl))} (${formatPercent(pnlPercent)})`}
                trend={pnl >= 0 ? 'up' : 'down'}
                icon={<Wallet className="text-blue-400" />}
              />
              <StatCard 
                label="Cash Balance" 
                value={formatCurrency(portfolio.balance)}
                subValue="Available for trades"
                icon={<PieChart className="text-purple-400" />}
              />
              <StatCard 
                label="Active Holdings" 
                value={formatNumber(portfolio.holdings.length)}
                subValue="Max 10 stocks allowed"
                icon={<TrendingUp className="text-emerald-400" />}
              />
            </div>

            {/* Chart Section */}
            <div className="bg-[#18181b] border border-white/5 rounded-3xl p-8">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold">Performance History</h2>
                <div className="flex gap-2">
                  <span className="px-3 py-1 bg-blue-500/10 text-blue-400 text-xs font-bold rounded-full border border-blue-500/20">1D</span>
                  <span className="px-3 py-1 text-gray-500 text-xs font-bold rounded-full hover:bg-white/5 cursor-not-allowed">1W</span>
                  <span className="px-3 py-1 text-gray-500 text-xs font-bold rounded-full hover:bg-white/5 cursor-not-allowed">1M</span>
                </div>
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      stroke="#4b5563" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      dy={10}
                    />
                    <YAxis 
                      stroke="#4b5563" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#3b82f6" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorValue)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Holdings Table */}
            <div className="bg-[#18181b] border border-white/5 rounded-3xl overflow-hidden">
              <div className="p-6 border-bottom border-white/5 flex items-center justify-between">
                <h2 className="text-xl font-bold">Current Holdings</h2>
                <span className="text-xs text-gray-500 font-mono">{portfolio.holdings.length}/10 slots filled</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-white/5">
                      <th className="px-6 py-4 font-semibold">Asset</th>
                      <th className="px-6 py-4 font-semibold">Shares</th>
                      <th className="px-6 py-4 font-semibold">Avg Price</th>
                      <th className="px-6 py-4 font-semibold">Current</th>
                      <th className="px-6 py-4 font-semibold">Value</th>
                      <th className="px-6 py-4 font-semibold text-right">P/L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {portfolio.holdings.map((h) => {
                      const value = h.shares * h.currentPrice;
                      const profit = (h.currentPrice - h.averagePrice) * h.shares;
                      const profitPct = ((h.currentPrice - h.averagePrice) / h.averagePrice) * 100;
                      return (
                        <tr key={h.symbol} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center font-bold text-xs">
                                {h.symbol[0]}
                              </div>
                              <div>
                                <div className="font-bold">{h.symbol}</div>
                                <div className="text-[10px] text-gray-500 uppercase">Equity</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono text-sm">{formatNumber(h.shares)}</td>
                          <td className="px-6 py-4 font-mono text-sm">{formatCurrency(h.averagePrice)}</td>
                          <td className="px-6 py-4 font-mono text-sm">{formatCurrency(h.currentPrice)}</td>
                          <td className="px-6 py-4 font-mono text-sm">{formatCurrency(value)}</td>
                          <td className={cn(
                            "px-6 py-4 text-right font-mono text-sm",
                            profit >= 0 ? "text-emerald-400" : "text-rose-400"
                          )}>
                            {profit >= 0 ? '+' : ''}{profit.toFixed(2)} ({formatPercent(profitPct)})
                          </td>
                        </tr>
                      );
                    })}
                    {portfolio.holdings.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500 italic">
                          No active holdings. Trigger AI analysis to start trading.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'agents' && (
          <div className="max-w-4xl mx-auto h-[calc(100vh-200px)] flex flex-col">
            <div className="flex-1 overflow-y-auto space-y-6 pr-4 custom-scrollbar">
              <AnimatePresence initial={false}>
                {messages.length === 0 && !isAnalyzing && (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center">
                      <MessageSquare className="text-gray-600" size={32} />
                    </div>
                    <p className="text-gray-500 max-w-sm">
                      The AI Investment Committee is waiting for your signal. Trigger analysis to start the debate.
                    </p>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-4"
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs border",
                      AGENT_COLORS[msg.agentName] || 'bg-white/5 border-white/10'
                    )}>
                      {msg.agentName[0]}
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{msg.agentName}</span>
                        <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">{msg.role}</span>
                      </div>
                      <div className="bg-[#18181b] border border-white/5 p-4 rounded-2xl rounded-tl-none text-gray-300 leading-relaxed text-sm shadow-xl">
                        {msg.content}
                      </div>
                    </div>
                  </motion.div>
                ))}
                {isAnalyzing && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex gap-4 animate-pulse"
                  >
                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 shrink-0" />
                    <div className="space-y-2 w-full">
                      <div className="h-4 bg-white/5 rounded w-24" />
                      <div className="h-20 bg-white/5 rounded-2xl w-full" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={chatEndRef} />
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-[#18181b] border border-white/5 rounded-3xl overflow-hidden">
            <div className="p-6 border-b border-white/5">
              <h2 className="text-xl font-bold">Transaction History</h2>
            </div>
            <div className="divide-y divide-white/5">
              {portfolio.history.map((t) => (
                <div key={t.id} className="p-6 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center",
                      t.type === 'BUY' ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                    )}>
                      {t.type === 'BUY' ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{t.type} {t.symbol}</span>
                        <span className="text-xs text-gray-500 font-mono">{new Date(t.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1 max-w-md italic">"{t.reason}"</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{formatNumber(t.shares)} Shares @ {formatCurrency(t.price)}</div>
                    <div className="text-xs text-gray-500">Total: {formatCurrency(t.shares * t.price)}</div>
                  </div>
                </div>
              ))}
              {portfolio.history.length === 0 && (
                <div className="p-12 text-center text-gray-500 italic">
                  No transactions yet.
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <AnimatePresence>
        {showNewPortfolioModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowNewPortfolioModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-[#18181b] border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl"
            >
              <h2 className="text-2xl font-bold mb-6">Create New Portfolio</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Portfolio Name</label>
                  <input 
                    type="text" 
                    value={newPortfolioData.name}
                    onChange={e => setNewPortfolioData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., My Retirement"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Investment Goal</label>
                  <select 
                    value={newPortfolioData.goal}
                    onChange={e => setNewPortfolioData(prev => ({ ...prev, goal: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value="Retirement Fund">Retirement Fund</option>
                    <option value="Down Payment">Down Payment</option>
                    <option value="Wealth Accumulation">Wealth Accumulation</option>
                    <option value="Education Fund">Education Fund</option>
                    <option value="Emergency Fund">Emergency Fund</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Risk Profile</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['Conservative', 'Balanced', 'Aggressive'].map(r => (
                      <button 
                        key={r}
                        onClick={() => setNewPortfolioData(prev => ({ ...prev, riskProfile: r as any }))}
                        className={cn(
                          "py-2 rounded-lg text-xs font-bold border transition-all",
                          newPortfolioData.riskProfile === r 
                            ? "bg-blue-600 border-blue-500 text-white" 
                            : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Initial Balance ($)</label>
                  <input 
                    type="number" 
                    value={newPortfolioData.initialBalance}
                    onChange={e => setNewPortfolioData(prev => ({ ...prev, initialBalance: Number(e.target.value) }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <button 
                  onClick={createPortfolio}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-95 mt-4"
                >
                  Create Portfolio
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showAddFundsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowAddFundsModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-[#18181b] border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl"
            >
              <h2 className="text-2xl font-bold mb-6">Add Funds</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Amount to Add ($)</label>
                  <input 
                    type="number" 
                    value={addFundsAmount}
                    onChange={e => setAddFundsAmount(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[1000, 5000, 10000, 50000].map(amt => (
                    <button 
                      key={amt}
                      onClick={() => setAddFundsAmount(amt)}
                      className="py-2 bg-white/5 border border-white/10 rounded-lg text-xs hover:bg-white/10 transition-colors"
                    >
                      +${amt/1000}k
                    </button>
                  ))}
                </div>
                <button 
                  onClick={addFunds}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-600/20 transition-all active:scale-95 mt-4"
                >
                  Confirm Deposit
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
        active 
          ? "bg-blue-600/10 text-blue-400 border border-blue-600/20" 
          : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
      )}
    >
      <span className={cn("transition-transform duration-200", active ? "scale-110" : "group-hover:scale-110")}>
        {icon}
      </span>
      <span className="font-semibold text-sm">{label}</span>
      {active && <ChevronRight size={14} className="ml-auto opacity-50" />}
    </button>
  );
}

function StatCard({ label, value, subValue, trend, icon }: { label: string, value: string, subValue: string, trend?: 'up' | 'down', icon: React.ReactNode }) {
  return (
    <div className="bg-[#18181b] border border-white/5 p-6 rounded-3xl hover:border-white/10 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-gray-500 uppercase tracking-wider font-bold">{label}</span>
        <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center">
          {icon}
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        <div className={cn(
          "text-xs font-semibold",
          trend === 'up' ? "text-emerald-500" : trend === 'down' ? "text-rose-500" : "text-gray-500"
        )}>
          {subValue}
        </div>
      </div>
    </div>
  );
}
