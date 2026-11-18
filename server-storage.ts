import fs from 'fs';
import { Pool } from 'pg';

let pool: Pool | undefined;
const writeQueues = new Map<string, Promise<void>>();
const stateFiles = new Map<string, string>();

export async function initializePersistence(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_URL must be set in production to use PostgreSQL.');
    }
    return;
  }

  pool = new Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bright_mind_state (
      state_key TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function loadPersistedState<T>(
  key: string,
  legacyFilePath: string,
  fallback: T
): Promise<T> {
  stateFiles.set(key, legacyFilePath);
  if (!pool) {
    return fs.existsSync(legacyFilePath)
      ? JSON.parse(fs.readFileSync(legacyFilePath, 'utf-8')) as T
      : fallback;
  }

  const existing = await pool.query<{ payload: T }>(
    'SELECT payload FROM bright_mind_state WHERE state_key = $1',
    [key]
  );
  if (existing.rowCount) return existing.rows[0].payload;

  const initial = fs.existsSync(legacyFilePath)
    ? JSON.parse(fs.readFileSync(legacyFilePath, 'utf-8')) as T
    : fallback;

  await pool.query(
    `INSERT INTO bright_mind_state (state_key, payload)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (state_key) DO NOTHING`,
    [key, JSON.stringify(initial)]
  );

  const loaded = await pool.query<{ payload: T }>(
    'SELECT payload FROM bright_mind_state WHERE state_key = $1',
    [key]
  );
  if (!loaded.rowCount) throw new Error(`Failed to initialize database state "${key}".`);
  return loaded.rows[0].payload;
}

export async function savePersistedState(key: string, value: unknown): Promise<void> {
  if (!pool) {
    const filePath = stateFiles.get(key);
    if (!filePath) throw new Error(`Persistence path for "${key}" is not initialized.`);
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8');
    return;
  }

  const previous = writeQueues.get(key) || Promise.resolve();
  const current = previous.catch(() => undefined).then(async () => {
    await pool!.query(
      `INSERT INTO bright_mind_state (state_key, payload, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (state_key)
       DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [key, JSON.stringify(value)]
    );
  });
  writeQueues.set(key, current);

  try {
    await current;
  } finally {
    if (writeQueues.get(key) === current) writeQueues.delete(key);
  }
}
