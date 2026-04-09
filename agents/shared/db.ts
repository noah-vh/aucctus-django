/**
 * Postgres client for agent tools.
 * Replaces the Convex HTTP API calls in the original brain.ts.
 * Agents read/write directly to the Django Postgres database.
 */
import pg from "pg";

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || "postgresql://localhost:5432/aucctus",
});

export async function query(sql: string, params: any[] = []): Promise<any[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

export async function queryOne(
  sql: string,
  params: any[] = []
): Promise<any | null> {
  const rows = await query(sql, params);
  return rows[0] || null;
}

export async function execute(
  sql: string,
  params: any[] = []
): Promise<{ rowCount: number; rows: any[] }> {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return { rowCount: result.rowCount || 0, rows: result.rows };
  } finally {
    client.release();
  }
}

export { pool };
