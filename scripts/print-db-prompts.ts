import { config } from 'dotenv';
// Load environment variables from .env file
config();

import { db, pool } from '../server/db';
import { aiPrompts } from '../shared/schema';

async function main() {
  try {
    console.log("Connecting to the database using process.env.DATABASE_URL...");
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set in the environment.");
    }
    
    const prompts = await db.select().from(aiPrompts);
    console.log(`Successfully connected! Found ${prompts.length} prompts in the database:\n`);
    
    for (const prompt of prompts) {
      console.log(`=================================`);
      console.log(`Prompt Name: ${prompt.name}`);
      console.log(`Description: ${prompt.description}`);
      console.log(`=================================`);
      console.log(`${prompt.prompt}\n\n`);
    }
  } catch (error) {
    console.error("Error fetching prompts from database:", error);
  } finally {
    // Close the connection pool so the script can exit cleanly
    await pool.end();
  }
}

main();
