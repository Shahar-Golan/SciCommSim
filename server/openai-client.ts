import https from "https";
import OpenAI from "openai";

const httpsAgent = new https.Agent({ keepAlive: true });
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 10000);
const OPENAI_MAX_RETRIES = Number(process.env.OPENAI_MAX_RETRIES || 1);

const openaiClientOptions: any = {
  apiKey: process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || "default_key",
  httpAgent: httpsAgent,
  timeout: Number.isFinite(OPENAI_TIMEOUT_MS) ? OPENAI_TIMEOUT_MS : 10000,
  maxRetries: Number.isFinite(OPENAI_MAX_RETRIES) ? OPENAI_MAX_RETRIES : 1,
};

export const openai = new OpenAI(openaiClientOptions);
