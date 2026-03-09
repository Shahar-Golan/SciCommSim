import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Optimize connection pool for faster responses
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 5, // Reduced max connections to minimize WebSocket issues
  idleTimeoutMillis: 20000, // Keep connections alive
  connectionTimeoutMillis: 10000, // Allow more time for connection
});
export const db = drizzle({ client: pool, schema });