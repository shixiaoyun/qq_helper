import { getDatabase } from '../config/database.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface FilterResult {
  filtered: string;
  hasSensitive: boolean;
  matchedWords: Array<{ word: string; category: string }>;
  replacementMode: ReplacementMode;
}

export type ReplacementMode = 'block' | 'replace' | 'warn';

interface SensitiveWordEntry {
  word: string;
  category: string;
}

interface TrieNode {
  children: Map<string, TrieNode>;
  isEnd: boolean;
  word: string | null;
  category: string | null;
}

class Trie {
  root: TrieNode;

  constructor() {
    this.root = {
      children: new Map(),
      isEnd: false,
      word: null,
      category: null,
    };
  }

  insert(word: string, category: string): void {
    let node = this.root;
    for (const char of word) {
      if (!node.children.has(char)) {
        node.children.set(char, {
          children: new Map(),
          isEnd: false,
          word: null,
          category: null,
        });
      }
      node = node.children.get(char)!;
    }
    node.isEnd = true;
    node.word = word;
    node.category = category;
  }

  search(text: string): Array<{ word: string; category: string; index: number }> {
    const results: Array<{ word: string; category: string; index: number }> = [];
    const matchedIndices = new Set<number>();

    for (let i = 0; i < text.length; i++) {
      if (matchedIndices.has(i)) continue;

      let node = this.root;
      let j = i;
      let lastMatch: { word: string; category: string; endIndex: number } | null = null;

      while (j < text.length && node.children.has(text[j])) {
        node = node.children.get(text[j])!;
        j++;

        if (node.isEnd && node.word) {
          lastMatch = {
            word: node.word,
            category: node.category || 'general',
            endIndex: j,
          };
        }
      }

      if (lastMatch) {
        results.push({
          word: lastMatch.word,
          category: lastMatch.category,
          index: i,
        });
        for (let k = i; k < lastMatch.endIndex; k++) {
          matchedIndices.add(k);
        }
      }
    }

    return results;
  }

  clear(): void {
    this.root.children.clear();
    this.root.isEnd = false;
    this.root.word = null;
    this.root.category = null;
  }
}

class SensitiveWordFilter {
  private db: any;
  private trie: Trie;
  private wordMap: Map<string, string>;
  private defaultWords: SensitiveWordEntry[];
  private externalFilePath: string;
  private lastReloadTime: number;
  private reloadIntervalMs: number;

  constructor() {
    this.db = getDatabase();
    this.trie = new Trie();
    this.wordMap = new Map();
    this.lastReloadTime = 0;
    this.reloadIntervalMs = 60000;
    this.externalFilePath = join(process.cwd(), 'config', 'sensitive_words.txt');

    this.defaultWords = [
      // 政治类
      { word: '法轮功', category: 'political' },
      { word: '台独', category: 'political' },
      { word: '疆独', category: 'political' },
      { word: '藏独', category: 'political' },
      { word: '港独', category: 'political' },
      { word: '反共', category: 'political' },
      { word: '反华', category: 'political' },
      { word: '颠覆国家', category: 'political' },
      { word: '颜色革命', category: 'political' },
      { word: '暴乱', category: 'political' },
      { word: '游行示威', category: 'political' },
      { word: '煽动', category: 'political' },
      { word: '分裂国家', category: 'political' },
      { word: '危害国家安全', category: 'political' },
      // 色情类
      { word: '色情', category: 'pornography' },
      { word: '淫秽', category: 'pornography' },
      { word: '卖淫', category: 'pornography' },
      { word: '嫖娼', category: 'pornography' },
      { word: '强奸', category: 'pornography' },
      { word: '乱伦', category: 'pornography' },
      { word: '性奴', category: 'pornography' },
      { word: '裸聊', category: 'pornography' },
      { word: 'AV', category: 'pornography' },
      { word: '三级片', category: 'pornography' },
      { word: '成人视频', category: 'pornography' },
      { word: '黄色', category: 'pornography' },
      { word: '性交易', category: 'pornography' },
      { word: '援交', category: 'pornography' },
      { word: '包养', category: 'pornography' },
      // 暴力类
      { word: '杀人', category: 'violence' },
      { word: '爆炸', category: 'violence' },
      { word: '恐怖袭击', category: 'violence' },
      { word: '炸弹', category: 'violence' },
      { word: '枪支', category: 'violence' },
      { word: '弹药', category: 'violence' },
      { word: '制造武器', category: 'violence' },
      { word: '暴力', category: 'violence' },
      { word: '斗殴', category: 'violence' },
      { word: '伤害', category: 'violence' },
      { word: '绑架', category: 'violence' },
      { word: '勒索', category: 'violence' },
      { word: '抢劫', category: 'violence' },
      { word: '放火', category: 'violence' },
      // 歧视类
      { word: '种族歧视', category: 'discrimination' },
      { word: '地域歧视', category: 'discrimination' },
      { word: '性别歧视', category: 'discrimination' },
      { word: '残疾人歧视', category: 'discrimination' },
      { word: '纳粹', category: 'discrimination' },
      { word: '法西斯', category: 'discrimination' },
      // 赌博类
      { word: '赌博', category: 'gambling' },
      { word: '博彩', category: 'gambling' },
      { word: '赌球', category: 'gambling' },
      { word: '赌马', category: 'gambling' },
      { word: '六合彩', category: 'gambling' },
      { word: '彩票预测', category: 'gambling' },
      { word: '赌资', category: 'gambling' },
      // 毒品类
      { word: '毒品', category: 'drugs' },
      { word: '冰毒', category: 'drugs' },
      { word: '海洛因', category: 'drugs' },
      { word: '大麻', category: 'drugs' },
      { word: '可卡因', category: 'drugs' },
      { word: '摇头丸', category: 'drugs' },
      { word: '制毒', category: 'drugs' },
      { word: '贩毒', category: 'drugs' },
      // 诈骗类
      { word: '诈骗', category: 'fraud' },
      { word: '传销', category: 'fraud' },
      { word: '非法集资', category: 'fraud' },
      { word: '洗钱', category: 'fraud' },
      { word: '套现', category: 'fraud' },
      { word: '黑客', category: 'fraud' },
      { word: '盗号', category: 'fraud' },
      { word: '钓鱼网站', category: 'fraud' },
    ];

    this.initTable();
    this.reload();
  }

  private initTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sensitive_words (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word TEXT NOT NULL UNIQUE,
        category TEXT DEFAULT 'general',
        level INTEGER DEFAULT 1,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sensitive_words_word ON sensitive_words(word)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sensitive_words_category ON sensitive_words(category)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sensitive_words_enabled ON sensitive_words(enabled)
    `);

    // Insert default words if table is empty
    const count = this.db.prepare('SELECT COUNT(*) as count FROM sensitive_words').get() as { count: number };
    if (count.count === 0) {
      const stmt = this.db.prepare('INSERT OR IGNORE INTO sensitive_words (word, category, level, enabled) VALUES (?, ?, ?, ?)');
      for (const entry of this.defaultWords) {
        stmt.run(entry.word, entry.category, 2, 1);
      }
    }
  }

  reload(): void {
    this.trie.clear();
    this.wordMap.clear();

    // 1. Load from database
    try {
      const dbWords = this.db.prepare(
        'SELECT word, category FROM sensitive_words WHERE enabled = 1'
      ).all() as Array<{ word: string; category: string }>;

      for (const entry of dbWords) {
        this.trie.insert(entry.word, entry.category);
        this.wordMap.set(entry.word, entry.category);
      }
    } catch (err) {
      console.error('[SensitiveWordFilter] 从数据库加载敏感词失败:', err);
    }

    // 2. Load from external file
    try {
      if (existsSync(this.externalFilePath)) {
        const content = readFileSync(this.externalFilePath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;

          const parts = trimmed.split(',');
          const word = parts[0].trim();
          const category = parts[1]?.trim() || 'custom';

          if (word && !this.wordMap.has(word)) {
            this.trie.insert(word, category);
            this.wordMap.set(word, category);
          }
        }
      }
    } catch (err) {
      console.error('[SensitiveWordFilter] 从外部文件加载敏感词失败:', err);
    }

    // 3. Load built-in defaults (fallback)
    for (const entry of this.defaultWords) {
      if (!this.wordMap.has(entry.word)) {
        this.trie.insert(entry.word, entry.category);
        this.wordMap.set(entry.word, entry.category);
      }
    }

    this.lastReloadTime = Date.now();
    console.log(`[SensitiveWordFilter] 已加载 ${this.wordMap.size} 个敏感词`);
  }

  private checkReload(): void {
    if (Date.now() - this.lastReloadTime > this.reloadIntervalMs) {
      this.reload();
    }
  }

  filter(text: string, mode: ReplacementMode = 'replace'): FilterResult {
    this.checkReload();

    if (!text || typeof text !== 'string') {
      return { filtered: text || '', hasSensitive: false, matchedWords: [], replacementMode: mode };
    }

    const matches = this.trie.search(text);

    if (matches.length === 0) {
      return { filtered: text, hasSensitive: false, matchedWords: [], replacementMode: mode };
    }

    const matchedWords = matches.map(m => ({ word: m.word, category: m.category }));

    if (mode === 'warn') {
      return { filtered: text, hasSensitive: true, matchedWords, replacementMode: mode };
    }

    if (mode === 'block') {
      return { filtered: text, hasSensitive: true, matchedWords, replacementMode: mode };
    }

    // replace mode
    let filtered = text;
    const sortedMatches = [...matches].sort((a, b) => b.index - a.index);

    for (const match of sortedMatches) {
      const replacement = '*'.repeat(match.word.length);
      filtered = filtered.slice(0, match.index) + replacement + filtered.slice(match.index + match.word.length);
    }

    return { filtered, hasSensitive: true, matchedWords, replacementMode: mode };
  }

  check(text: string): { hasSensitive: boolean; matchedWords: Array<{ word: string; category: string }> } {
    this.checkReload();

    if (!text || typeof text !== 'string') {
      return { hasSensitive: false, matchedWords: [] };
    }

    const matches = this.trie.search(text);
    return {
      hasSensitive: matches.length > 0,
      matchedWords: matches.map(m => ({ word: m.word, category: m.category })),
    };
  }

  addWord(word: string, category: string = 'custom', level: number = 1): boolean {
    try {
      const stmt = this.db.prepare(
        'INSERT OR REPLACE INTO sensitive_words (word, category, level, enabled) VALUES (?, ?, ?, 1)'
      );
      stmt.run(word.trim(), category, level);
      this.reload();
      return true;
    } catch (err) {
      console.error('[SensitiveWordFilter] 添加敏感词失败:', err);
      return false;
    }
  }

  removeWord(word: string): boolean {
    try {
      const stmt = this.db.prepare('DELETE FROM sensitive_words WHERE word = ?');
      const result = stmt.run(word.trim());
      if (result.changes > 0) {
        this.reload();
        return true;
      }
      return false;
    } catch (err) {
      console.error('[SensitiveWordFilter] 删除敏感词失败:', err);
      return false;
    }
  }

  listWords(category?: string): Array<{ word: string; category: string; level: number; enabled: boolean }> {
    try {
      let query = 'SELECT word, category, level, enabled FROM sensitive_words';
      const params: string[] = [];

      if (category) {
        query += ' WHERE category = ?';
        params.push(category);
      }

      query += ' ORDER BY category, word';

      const rows = this.db.prepare(query).all(...params) as Array<{
        word: string;
        category: string;
        level: number;
        enabled: number;
      }>;

      return rows.map(r => ({
        word: r.word,
        category: r.category,
        level: r.level,
        enabled: r.enabled === 1,
      }));
    } catch (err) {
      console.error('[SensitiveWordFilter] 列出敏感词失败:', err);
      return [];
    }
  }

  getCategories(): string[] {
    try {
      const rows = this.db.prepare(
        'SELECT DISTINCT category FROM sensitive_words ORDER BY category'
      ).all() as Array<{ category: string }>;
      return rows.map(r => r.category);
    } catch (err) {
      console.error('[SensitiveWordFilter] 获取分类失败:', err);
      return [];
    }
  }

  setWordEnabled(word: string, enabled: boolean): boolean {
    try {
      const stmt = this.db.prepare('UPDATE sensitive_words SET enabled = ? WHERE word = ?');
      const result = stmt.run(enabled ? 1 : 0, word.trim());
      if (result.changes > 0) {
        this.reload();
        return true;
      }
      return false;
    } catch (err) {
      console.error('[SensitiveWordFilter] 更新敏感词状态失败:', err);
      return false;
    }
  }
}

let filterInstance: SensitiveWordFilter | null = null;

export function getSensitiveWordFilter(): SensitiveWordFilter {
  if (!filterInstance) {
    filterInstance = new SensitiveWordFilter();
  }
  return filterInstance;
}

export function filterSensitiveWords(text: string, mode: ReplacementMode = 'replace'): FilterResult {
  return getSensitiveWordFilter().filter(text, mode);
}

export function checkSensitiveWords(text: string): { hasSensitive: boolean; matchedWords: Array<{ word: string; category: string }> } {
  return getSensitiveWordFilter().check(text);
}

export function addSensitiveWord(word: string, category?: string, level?: number): boolean {
  return getSensitiveWordFilter().addWord(word, category, level);
}

export function removeSensitiveWord(word: string): boolean {
  return getSensitiveWordFilter().removeWord(word);
}

export function listSensitiveWords(category?: string): Array<{ word: string; category: string; level: number; enabled: boolean }> {
  return getSensitiveWordFilter().listWords(category);
}

export function reloadSensitiveWords(): void {
  getSensitiveWordFilter().reload();
}
