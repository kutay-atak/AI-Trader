import { GoogleGenAI } from "@google/genai";
import { AgentMessage, Portfolio, Stock } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function getMarketInsights(stocks: string[]) {
  const model = "gemini-3-flash-preview";
  const prompt = `Analyze the current market status for these US stocks: ${stocks.join(", ")}. 
  Provide a brief summary of the overall market sentiment and specific insights for 3-5 of these stocks.
  Format the response as a JSON object with a 'marketSummary' string and an 'insights' array of objects { symbol, sentiment, reason }.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json"
      }
    });
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
    The goal is to maximize returns while staying within the 10-stock limit.
    
    Return a JSON object with:
    - 'messages': Array of { agentId, agentName, role, content }
    - 'action': Optional object { type: 'BUY'|'SELL', symbol, shares, reason }
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: "Start the investment committee meeting.",
      config: {
        systemInstruction,
        responseMimeType: "application/json"
      }
    });
    
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
  const model = "gemini-3-flash-preview";
  const prompt = `Get the current real-time stock prices for: ${symbols.join(", ")}. 
  Return a JSON object where keys are symbols and values are numbers (current price).`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json"
      }
    });
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Error fetching live prices:", error);
    // Fallback mock prices if search fails
    return symbols.reduce((acc, s) => ({ ...acc, [s]: 150 + Math.random() * 50 }), {});
  }
}
