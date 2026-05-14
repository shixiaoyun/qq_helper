import { getDatabase } from '../config/database.js';

export interface CrawlTaskRecord {
  id: string;
  user_id: number | null;
  url: string;
  keyword: string | null;
  platform: string | null;
  pages: number;
  status: 'pending' | 'running' | 'completed' | 'error';
  results: string;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export function createCrawlTaskRecord(data: {
  id: string;
  userId?: number;
  url: string;
  keyword?: string;
  platform?: string;
  pages?: number;
}): CrawlTaskRecord {
  const db = getDatabase();
  db.prepare(
    'INSERT INTO crawl_tasks (id, user_id, url, keyword, platform, pages, status, results) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    data.id,
    data.userId || null,
    data.url,
    data.keyword || null,
    data.platform || null,
    data.pages || 1,
    'pending',
    '[]'
  );
  return getCrawlTaskById(data.id)!;
}

export function getCrawlTaskById(id: string): CrawlTaskRecord | null {
  const db = getDatabase();
  return db.prepare('SELECT * FROM crawl_tasks WHERE id = ?').get(id) as CrawlTaskRecord | null;
}

export function getAllCrawlTasks(userId?: number): CrawlTaskRecord[] {
  const db = getDatabase();
  if (userId) {
    return db.prepare('SELECT * FROM crawl_tasks WHERE user_id = ? ORDER BY created_at DESC').all(userId) as CrawlTaskRecord[];
  }
  return db.prepare('SELECT * FROM crawl_tasks ORDER BY created_at DESC').all() as CrawlTaskRecord[];
}

export function updateCrawlTaskStatus(
  id: string,
  status: 'pending' | 'running' | 'completed' | 'error',
  results?: unknown[],
  error?: string
): boolean {
  const db = getDatabase();
  const fields: string[] = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
  const values: unknown[] = [status];

  if (results !== undefined) {
    fields.push('results = ?');
    values.push(JSON.stringify(results));
  }
  if (error !== undefined) {
    fields.push('error = ?');
    values.push(error);
  }

  values.push(id);
  const result = db.prepare(`UPDATE crawl_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return result.changes > 0;
}

export function deleteCrawlTask(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM crawl_tasks WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getCrawlTaskResults(id: string): unknown[] {
  const db = getDatabase();
  const row = db.prepare('SELECT results FROM crawl_tasks WHERE id = ?').get(id) as { results: string } | undefined;
  if (!row) return [];
  try {
    return JSON.parse(row.results);
  } catch {
    return [];
  }
}
