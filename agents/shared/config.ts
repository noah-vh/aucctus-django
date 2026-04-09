import { getModel } from "@mariozechner/pi-ai";

// Research agents
// Using minimax-m2.7 for cost efficiency.
// Switch to "anthropic/claude-sonnet-4" for higher quality when credits allow.
export const RESEARCH_MODEL = getModel("openrouter", "minimax/minimax-m2.7");

// Lightweight monitors (daily pulse, news classification) - cheap and fast
export const MONITOR_MODEL = getModel("openrouter", "anthropic/claude-haiku-4.5");

// LLM-as-judge for evals - separate model to avoid self-evaluation bias
export const JUDGE_MODEL = getModel("openrouter", "openai/gpt-4-turbo");

// Convex deployment URL - set via environment
export const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "";

// API keys are read from environment by pi-ai automatically (OPENROUTER_API_KEY)
// Exa and Tavily keys for search tools
export const EXA_API_KEY = process.env.EXA_API_KEY || "";
export const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";
