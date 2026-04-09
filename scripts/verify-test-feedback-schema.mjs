import "dotenv/config";
import { Pool } from "@neondatabase/serverless";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const tables = await pool.query(`
  SELECT table_schema, table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('test_feedback_access_requests','test_feedback_access_users')
  ORDER BY table_name;
`);

const columns = await pool.query(`
  SELECT table_name, column_name, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('test_feedback_access_requests','test_feedback_access_users')
  ORDER BY table_name, ordinal_position;
`);

const usernameCols = columns.rows.filter((row) => row.column_name === "username");

console.log("TABLES");
console.log(JSON.stringify(tables.rows, null, 2));
console.log("COLUMNS");
console.log(JSON.stringify(columns.rows, null, 2));
console.log("USERNAME_COLUMNS_FOUND", usernameCols.length);

await pool.end();

if (usernameCols.length > 0) {
  process.exit(2);
}
