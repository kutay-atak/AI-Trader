import { GoogleGenAI } from "@google/genai";
import { AgentMessage, Portfolio, Stock } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Cache for stock prices to reduce API calls
const priceCache: Record<string, { price: number, timestamp: number }> = {};
const CACHE_DURATION = 300000; // 5 minutes

async function callWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isRateLimit = error?.message?.includes("429") || error?.status === "RESOURCE_EXHAUSTED";
    if (isRateLimit && retries > 0) {
      console.warn(`Rate limit hit. Retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return callWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export async function getMarketInsights(stocks: string[]) {
  const model = "gemini-3-flash-preview";
  const prompt = `Analyze the current market status for these US stocks: ${stocks.join(", ")}. 
  Provide a brief summary of the overall market sentiment and specific insights for 3-5 of these stocks.
  Format the response as a JSON object with a 'marketSummary' string and an 'insights' array of objects { symbol, sentiment, reason }.`;

  try {
    const response = await callWithRetry(() => ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json"
      }
    }));
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Error fetching market insights:", error);
    return null;
  }
}

export async function runAgentDebate(
  portfolio: Portfolio,
  marketData: any,
  agentMessages: AgentMessage[]
): Promise<{ messages: AgentMessage[], decision?: any }> {
  const model = "gemini-3-flash-preview";
  
  const systemInstruction = `
    You are a team of 5 AI Investment Agents managing a virtual portfolio.
    Portfolio Name: ${portfolio.name}
    Investment Goal: ${portfolio.goal}
    Risk Profile: ${portfolio.riskProfile}
    
    Agents:
    1. MacroMax (Macro Economist): Focuses on interest rates, inflation, and sectors.
    2. ChartChi (Technical Analyst): Focuses on price action and trends.
    3. ValueVal (Fundamental Analyst): Focuses on earnings and valuation.
    4. BuzzBot (Sentiment Analyst): Focuses on news and social buzz.
    5. RiskRick (Risk Manager): Final decider, ensures max 10 stocks and balanced risk.

    CRITICAL: You MUST tailor your strategy to the Risk Profile (${portfolio.riskProfile}) and Goal (${portfolio.goal}).
    - Conservative: Focus on low volatility, dividends, and blue-chip stocks.
    - Balanced: Mix of growth and stability.
    - Aggressive: Focus on high-growth tech, volatile stocks, and market outperformance.

    Current Portfolio: ${JSON.stringify(portfolio)}
    Market Data: ${JSON.stringify(marketData)}

    Simulate a short debate between these agents. Each agent should provide one concise message.
    RiskRick must conclude the debate with a decision to BUY, SELL, or HOLD specific stocks.
    The goal is to maximize returns while maintaining a full portfolio of EXACTLY 10 stocks whenever possible. If you have fewer than 10 stocks, prioritize finding high-quality BUY opportunities to reach the 10-stock limit.
    
    Return a JSON object with:
    - 'messages': Array of { agentId, agentName, role, content }
    - 'action': Optional object { type: 'BUY'|'SELL', symbol, shares, reason }
  `;

  try {
    const response = await callWithRetry(() => ai.models.generateContent({
      model,
      contents: "Start the investment committee meeting.",
      config: {
        systemInstruction,
        responseMimeType: "application/json"
      }
    }));
    
    const result = JSON.parse(response.text);
    return {
      messages: result.messages.map((m: any) => ({ ...m, timestamp: Date.now() })),
      decision: result.action
    };
  } catch (error) {
    console.error("Error running agent debate:", error);
    return { messages: [] };
  }
}

export async function getLivePrices(symbols: string[]): Promise<Record<string, number>> {
  const now = Date.now();
  const results: Record<string, number> = {};
  const symbolsToFetch: string[] = [];

  // Use cache if available and fresh
  symbols.forEach(s => {
    if (priceCache[s] && (now - priceCache[s].timestamp < CACHE_DURATION)) {
      results[s] = priceCache[s].price;
    } else {
      symbolsToFetch.push(s);
    }
  });

  if (symbolsToFetch.length === 0) return results;

  const model = "gemini-3-flash-preview";
  const prompt = `Search for the current real-time stock prices of these US stocks: ${symbolsToFetch.join(", ")}. 
  Return the results as a JSON object where keys are the stock symbols and values are their current prices as numbers. 
  Do not include any other text, only the JSON object.`;

  try {
    const response = await callWithRetry(() => ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json"
      }
    }));
    
    console.log("Live prices response:", response.text);
    
    let fetchedPrices: any = {};
    try {
      fetchedPrices = JSON.parse(response.text);
    } catch (e) {
      console.error("Failed to parse stock prices JSON:", response.text);
      // Try to extract JSON if it's wrapped in markdown
      const match = response.text.match(/\{[\s\S]*\}/);
      if (match) {
        fetchedPrices = JSON.parse(match[0]);
      }
    }

    if (fetchedPrices && typeof fetchedPrices === 'object') {
      // Handle potential nested structure like { "prices": { "AAPL": 150 } } or { "AAPL": { "price": 150 } }
      const flatPrices = fetchedPrices.prices || fetchedPrices;
      
      Object.entries(flatPrices).forEach(([s, p]: [string, any]) => {
        const symbol = s.toUpperCase();
        let price = 0;
        if (typeof p === 'number') price = p;
        else if (typeof p === 'string') price = parseFloat(p);
        else if (p && typeof p === 'object' && p.price) price = Number(p.price);
        
        if (!isNaN(price) && price > 0) {
          priceCache[symbol] = { price, timestamp: now };
          results[symbol] = price;
        }
      });
    }
    
    // Ensure all requested symbols have a price (use fallback if missing from API response)
    symbolsToFetch.forEach(s => {
      if (!results[s]) {
        results[s] = 150 + Math.random() * 50;
      }
    });

    return results;
  } catch (error) {
    console.error("Error fetching live prices:", error);
    // Fallback mock prices if search fails, but don't cache them
    return symbolsToFetch.reduce((acc, s) => ({ ...acc, [s]: results[s] || 150 + Math.random() * 50 }), results);
  }
}
