import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { getDatabase } from '../config/database.js';
import { glob } from 'glob';

// ============ 类型定义 ============

export type SymbolType = 'function' | 'class' | 'interface' | 'type' | 'enum' | 'variable' | 'import' | 'export' | 'method' | 'property' | 'comment' | 'docstring';

export interface CodeSymbol {
  id: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  name: string;
  symbolType: SymbolType;
  signature?: string;
  documentation?: string;
  container?: string;
  language: string;
}

export interface SearchResult {
  symbol: CodeSymbol;
  score: number;
  matchedTerms: string[];
  contextLines: string[];
}

export interface IndexStats {
  totalFiles: number;
  totalSymbols: number;
  languages: Record<string, number>;
  lastIndexedAt?: string;
}

// ============ 代码解析器 ============

interface ParsedSymbol {
  name: string;
  symbolType: SymbolType;
  lineStart: number;
  lineEnd: number;
  signature?: string;
  documentation?: string;
  container?: string;
}

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.java': 'java',
  '.go': 'go',
  '.rs': 'rust',
};

const SUPPORTED_EXTS = Object.keys(LANGUAGE_MAP);

function getLanguage(filePath: string): string {
  return LANGUAGE_MAP[extname(filePath).toLowerCase()] || 'unknown';
}

function isSupportedFile(filePath: string): boolean {
  return SUPPORTED_EXTS.includes(extname(filePath).toLowerCase());
}

// 代码解析：提取符号
function parseCode(content: string, language: string): ParsedSymbol[] {
  const lines = content.split('\n');
  const symbols: ParsedSymbol[] = [];
  const commentBlocks: Array<{ start: number; end: number; text: string }> = [];

  // 先提取注释块
  extractComments(lines, language, commentBlocks);

  // 根据语言选择解析器
  switch (language) {
    case 'typescript':
    case 'javascript':
      parseTypeScriptLike(lines, symbols, commentBlocks);
      break;
    case 'python':
      parsePython(lines, symbols, commentBlocks);
      break;
    case 'java':
      parseJava(lines, symbols, commentBlocks);
      break;
    case 'go':
      parseGo(lines, symbols, commentBlocks);
      break;
    case 'rust':
      parseRust(lines, symbols, commentBlocks);
      break;
  }

  // 添加注释作为符号
  for (const cb of commentBlocks) {
    const preview = cb.text.slice(0, 80).replace(/\s+/g, ' ').trim();
    if (preview.length > 10) {
      symbols.push({
        name: preview,
        symbolType: cb.text.includes('@param') || cb.text.includes('@return') || cb.text.includes('@example') ? 'docstring' : 'comment',
        lineStart: cb.start + 1,
        lineEnd: cb.end + 1,
        documentation: cb.text,
      });
    }
  }

  // 合并相邻的同名符号，计算行范围
  return mergeSymbolRanges(symbols, lines);
}

function extractComments(lines: string[], language: string, out: Array<{ start: number; end: number; text: string }>) {
  let inBlockComment = false;
  let blockStart = 0;
  let blockText = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (language === 'python') {
      // Python docstring / 多行字符串
      const tripleMatch = line.match(/("""|''')/);
      if (tripleMatch) {
        if (!inBlockComment) {
          inBlockComment = true;
          blockStart = i;
          blockText = line;
          if ((line.match(/("""|''')/g) || []).length >= 2) {
            inBlockComment = false;
            out.push({ start: blockStart, end: i, text: blockText });
            blockText = '';
          }
        } else {
          blockText += '\n' + line;
          out.push({ start: blockStart, end: i, text: blockText });
          inBlockComment = false;
          blockText = '';
        }
        continue;
      }
      if (inBlockComment) {
        blockText += '\n' + line;
        continue;
      }
      // 单行注释
      if (line.trim().startsWith('#')) {
        out.push({ start: i, end: i, text: line.trim() });
      }
    } else {
      // C-style 注释
      if (!inBlockComment && (line.includes('/*') || line.startsWith(' *'))) {
        const idx = line.indexOf('/*');
        if (idx >= 0) {
          inBlockComment = true;
          blockStart = i;
          blockText = line.slice(idx);
          if (line.includes('*/')) {
            inBlockComment = false;
            out.push({ start: blockStart, end: i, text: blockText });
            blockText = '';
          }
        }
      } else if (inBlockComment) {
        blockText += '\n' + line;
        if (line.includes('*/')) {
          inBlockComment = false;
          out.push({ start: blockStart, end: i, text: blockText });
          blockText = '';
        }
      } else if (line.trim().startsWith('//')) {
        out.push({ start: i, end: i, text: line.trim() });
      }
    }
  }
}

function parseTypeScriptLike(lines: string[], symbols: ParsedSymbol[], _commentBlocks: Array<{ start: number; end: number; text: string }>) {
  const content = lines.join('\n');
  const patterns: Array<{ regex: RegExp; type: SymbolType; nameGroup: number }> = [
    { regex: /^(export\s+)?(async\s+)?function\s+(\w+)\s*\(/gm, type: 'function', nameGroup: 3 },
    { regex: /^(export\s+)?const\s+(\w+)\s*=\s*(async\s+)?\([^)]*\)\s*=>/gm, type: 'function', nameGroup: 2 },
    { regex: /^(export\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?/gm, type: 'class', nameGroup: 2 },
    { regex: /^(export\s+)?interface\s+(\w+)/gm, type: 'interface', nameGroup: 2 },
    { regex: /^(export\s+)?type\s+(\w+)\s*=/gm, type: 'type', nameGroup: 2 },
    { regex: /^(export\s+)?enum\s+(\w+)/gm, type: 'enum', nameGroup: 2 },
    { regex: /^(export\s+)?const\s+(\w+)\s*[:=]/gm, type: 'variable', nameGroup: 2 },
    { regex: /^(export\s+)?let\s+(\w+)\s*[:=]/gm, type: 'variable', nameGroup: 2 },
    { regex: /^(export\s+)?var\s+(\w+)\s*[:=]/gm, type: 'variable', nameGroup: 2 },
    { regex: /^import\s+.*?\s+from\s+['"]([^'"]+)['"]/gm, type: 'import', nameGroup: 1 },
    { regex: /^export\s+(?:\{[^}]+\}|\*\s+from)\s+['"]([^'"]+)['"]/gm, type: 'export', nameGroup: 1 },
    { regex: /^(?:async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/gm, type: 'method', nameGroup: 1 },
  ];

  for (const p of patterns) {
    let match: RegExpExecArray | null;
    while ((match = p.regex.exec(content)) !== null) {
      const lineNum = content.slice(0, match.index).split('\n').length;
      const name = match[p.nameGroup] || '';
      if (!name || name.length > 100) continue;

      const lineText = lines[lineNum - 1] || '';
      const sig = lineText.trim().slice(0, 200);

      symbols.push({
        name,
        symbolType: p.type,
        lineStart: lineNum,
        lineEnd: lineNum,
        signature: sig,
      });
    }
  }

  // 类内方法检测（简化版）
  let currentClass = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const classMatch = line.match(/class\s+(\w+)/);
    if (classMatch) {
      currentClass = classMatch[1];
    }
    if (currentClass && line.trim() === '}') {
      currentClass = '';
    }
    const methodMatch = line.match(/^(\s+)(?:async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/);
    if (methodMatch && currentClass) {
      symbols.push({
        name: methodMatch[2],
        symbolType: 'method',
        lineStart: i + 1,
        lineEnd: i + 1,
        container: currentClass,
        signature: line.trim().slice(0, 200),
      });
    }
  }
}

function parsePython(lines: string[], symbols: ParsedSymbol[], _commentBlocks: Array<{ start: number; end: number; text: string }>) {
  let currentClass = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const defMatch = line.match(/^(async\s+)?def\s+(\w+)\s*\(/);
    if (defMatch) {
      symbols.push({
        name: defMatch[2],
        symbolType: currentClass ? 'method' : 'function',
        lineStart: i + 1,
        lineEnd: i + 1,
        container: currentClass || undefined,
        signature: line.trim().slice(0, 200),
      });
      continue;
    }
    const classMatch = line.match(/^class\s+(\w+)/);
    if (classMatch) {
      currentClass = classMatch[1];
      symbols.push({
        name: classMatch[1],
        symbolType: 'class',
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: line.trim().slice(0, 200),
      });
      continue;
    }
    if (line.trim() && !line.startsWith(' ') && !line.startsWith('\t') && currentClass) {
      currentClass = '';
    }
    const importMatch = line.match(/^(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/);
    if (importMatch) {
      symbols.push({
        name: importMatch[1] || importMatch[2],
        symbolType: 'import',
        lineStart: i + 1,
        lineEnd: i + 1,
      });
    }
    const varMatch = line.match(/^(\w+)\s*=/);
    if (varMatch && !line.startsWith(' ') && !line.startsWith('\t')) {
      symbols.push({
        name: varMatch[1],
        symbolType: 'variable',
        lineStart: i + 1,
        lineEnd: i + 1,
      });
    }
  }
}

function parseJava(lines: string[], symbols: ParsedSymbol[], _commentBlocks: Array<{ start: number; end: number; text: string }>) {
  const content = lines.join('\n');
  const patterns: Array<{ regex: RegExp; type: SymbolType; nameGroup: number }> = [
    { regex: /^(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?[\w<>\[\]]+\s+(\w+)\s*\(/gm, type: 'function', nameGroup: 1 },
    { regex: /^(?:public|private|protected)?\s*(?:static\s+)?(?:abstract\s+)?class\s+(\w+)/gm, type: 'class', nameGroup: 1 },
    { regex: /^(?:public|private|protected)?\s*interface\s+(\w+)/gm, type: 'interface', nameGroup: 1 },
    { regex: /^(?:public|private|protected)?\s*enum\s+(\w+)/gm, type: 'enum', nameGroup: 1 },
    { regex: /^import\s+([\w.]+)/gm, type: 'import', nameGroup: 1 },
  ];

  for (const p of patterns) {
    let match: RegExpExecArray | null;
    while ((match = p.regex.exec(content)) !== null) {
      const lineNum = content.slice(0, match.index).split('\n').length;
      symbols.push({
        name: match[p.nameGroup],
        symbolType: p.type,
        lineStart: lineNum,
        lineEnd: lineNum,
        signature: lines[lineNum - 1]?.trim().slice(0, 200),
      });
    }
  }
}

function parseGo(lines: string[], symbols: ParsedSymbol[], _commentBlocks: Array<{ start: number; end: number; text: string }>) {
  const content = lines.join('\n');
  const patterns: Array<{ regex: RegExp; type: SymbolType; nameGroup: number }> = [
    { regex: /^func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(/gm, type: 'function', nameGroup: 1 },
    { regex: /^type\s+(\w+)\s+struct/gm, type: 'class', nameGroup: 1 },
    { regex: /^type\s+(\w+)\s+interface/gm, type: 'interface', nameGroup: 1 },
    { regex: /^var\s+(\w+)/gm, type: 'variable', nameGroup: 1 },
    { regex: /^const\s+(\w+)/gm, type: 'variable', nameGroup: 1 },
    { regex: /^import\s+\(\s*["']([^"']+)["']/gm, type: 'import', nameGroup: 1 },
  ];

  for (const p of patterns) {
    let match: RegExpExecArray | null;
    while ((match = p.regex.exec(content)) !== null) {
      const lineNum = content.slice(0, match.index).split('\n').length;
      symbols.push({
        name: match[p.nameGroup],
        symbolType: p.type,
        lineStart: lineNum,
        lineEnd: lineNum,
        signature: lines[lineNum - 1]?.trim().slice(0, 200),
      });
    }
  }
}

function parseRust(lines: string[], symbols: ParsedSymbol[], _commentBlocks: Array<{ start: number; end: number; text: string }>) {
  const content = lines.join('\n');
  const patterns: Array<{ regex: RegExp; type: SymbolType; nameGroup: number }> = [
    { regex: /^fn\s+(\w+)\s*\(/gm, type: 'function', nameGroup: 1 },
    { regex: /^struct\s+(\w+)/gm, type: 'class', nameGroup: 1 },
    { regex: /^enum\s+(\w+)/gm, type: 'enum', nameGroup: 1 },
    { regex: /^trait\s+(\w+)/gm, type: 'interface', nameGroup: 1 },
    { regex: /^impl\s+(?:<[^>]+>\s+)?(\w+)/gm, type: 'class', nameGroup: 1 },
    { regex: /^use\s+([\w:]+)/gm, type: 'import', nameGroup: 1 },
    { regex: /^let\s+(?:mut\s+)?(\w+)/gm, type: 'variable', nameGroup: 1 },
    { regex: /^const\s+(\w+)/gm, type: 'variable', nameGroup: 1 },
  ];

  for (const p of patterns) {
    let match: RegExpExecArray | null;
    while ((match = p.regex.exec(content)) !== null) {
      const lineNum = content.slice(0, match.index).split('\n').length;
      symbols.push({
        name: match[p.nameGroup],
        symbolType: p.type,
        lineStart: lineNum,
        lineEnd: lineNum,
        signature: lines[lineNum - 1]?.trim().slice(0, 200),
      });
    }
  }
}

function mergeSymbolRanges(symbols: ParsedSymbol[], lines: string[]): ParsedSymbol[] {
  // 估算每个符号的结束行（查找下一个同层级定义或空行）
  const result: ParsedSymbol[] = [];
  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    const nextSym = symbols[i + 1];
    let lineEnd = sym.lineEnd;

    if (nextSym) {
      lineEnd = Math.min(sym.lineStart + 50, nextSym.lineStart - 1);
    } else {
      lineEnd = Math.min(sym.lineStart + 50, lines.length);
    }

    // 对于函数/类，尝试找到闭合
    if (['function', 'class', 'method', 'interface'].includes(sym.symbolType)) {
      let braceCount = 0;
      let foundOpen = false;
      for (let l = sym.lineStart - 1; l < lines.length && l < sym.lineStart + 200; l++) {
        for (const ch of lines[l]) {
          if (ch === '{' || ch === '(') {
            braceCount++;
            foundOpen = true;
          } else if ((ch === '}' || ch === ')') && foundOpen) {
            braceCount--;
            if (braceCount === 0) {
              lineEnd = l + 1;
              break;
            }
          }
        }
        if (braceCount === 0 && foundOpen) break;
      }
    }

    result.push({ ...sym, lineEnd: Math.max(lineEnd, sym.lineStart) });
  }
  return result;
}

// ============ 分词与索引 ============

function tokenize(text: string): string[] {
  // 分词：提取单词、驼峰命名、下划线命名
  const tokens: string[] = [];

  // 简单单词
  const words = text.toLowerCase()
    .replace(/[^a-z0-9_\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && w.length <= 50);
  tokens.push(...words);

  // 驼峰分词
  const camelWords = text.match(/[a-z]+|[A-Z][a-z]+|[A-Z]+/g) || [];
  for (const cw of camelWords) {
    const lower = cw.toLowerCase();
    if (lower.length >= 2 && !tokens.includes(lower)) {
      tokens.push(lower);
    }
  }

  // 下划线分词
  const snakeWords = text.split(/[_\s]+/).filter(w => w.length >= 2);
  for (const sw of snakeWords) {
    const lower = sw.toLowerCase();
    if (!tokens.includes(lower)) {
      tokens.push(lower);
    }
  }

  return [...new Set(tokens)];
}

interface InvertedIndexEntry {
  symbolId: string;
  termFrequency: number;
  field: 'name' | 'signature' | 'documentation' | 'content';
  lineStart: number;
}

class InvertedIndex {
  private index = new Map<string, InvertedIndexEntry[]>();
  private documentFreq = new Map<string, number>();
  private totalDocuments = 0;

  addTerm(term: string, entry: InvertedIndexEntry) {
    const list = this.index.get(term) || [];
    list.push(entry);
    this.index.set(term, list);
  }

  incrementDocFreq(term: string) {
    this.documentFreq.set(term, (this.documentFreq.get(term) || 0) + 1);
  }

  setTotalDocuments(n: number) {
    this.totalDocuments = n;
  }

  getTotalDocuments(): number {
    return this.totalDocuments;
  }

  search(queryTerms: string[]): Map<string, number> {
    const scores = new Map<string, number>();

    for (const term of queryTerms) {
      const entries = this.index.get(term) || [];
      const df = this.documentFreq.get(term) || 1;
      const idf = Math.log((this.totalDocuments + 1) / (df + 1)) + 1;

      for (const entry of entries) {
        // TF-IDF 评分，不同字段有不同权重
        const fieldWeight: Record<string, number> = {
          name: 5.0,
          signature: 2.0,
          documentation: 1.5,
          content: 1.0,
        };
        const weight = fieldWeight[entry.field] || 1.0;
        const tf = 1 + Math.log(entry.termFrequency);
        const score = tf * idf * weight;

        scores.set(entry.symbolId, (scores.get(entry.symbolId) || 0) + score);
      }
    }

    return scores;
  }

  clear() {
    this.index.clear();
    this.documentFreq.clear();
    this.totalDocuments = 0;
  }

  serialize(): string {
    return JSON.stringify({
      index: Array.from(this.index.entries()),
      documentFreq: Array.from(this.documentFreq.entries()),
      totalDocuments: this.totalDocuments,
    });
  }

  deserialize(data: string) {
    const parsed = JSON.parse(data);
    this.index = new Map(parsed.index);
    this.documentFreq = new Map(parsed.documentFreq);
    this.totalDocuments = parsed.totalDocuments;
  }
}

// ============ SQLite 持久化 ============

function getSearchDB() {
  return getDatabase();
}

function initSearchDatabase(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS code_symbols (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      line_start INTEGER NOT NULL,
      line_end INTEGER NOT NULL,
      name TEXT NOT NULL,
      symbol_type TEXT NOT NULL,
      signature TEXT,
      documentation TEXT,
      container TEXT,
      language TEXT NOT NULL,
      content TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS search_index (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      index_data LONGTEXT NOT NULL,
      stats LONGTEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 已有旧表(VARCHAR/TEXT)迁移到 LONGTEXT — 倒排索引序列化后可达数MB
  try { db.exec(`ALTER TABLE search_index MODIFY index_data LONGTEXT NOT NULL`); } catch { /* ignore */ }
  try { db.exec(`ALTER TABLE search_index MODIFY stats LONGTEXT`); } catch { /* ignore */ }

  db.exec(`CREATE INDEX IF NOT EXISTS idx_symbols_file ON code_symbols(file_path)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_symbols_name ON code_symbols(name)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_symbols_type ON code_symbols(symbol_type)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_symbols_language ON code_symbols(language)`);
}

// ============ 核心搜索服务 ============

class CodeSemanticSearchService {
  private symbols = new Map<string, CodeSymbol>();
  private invertedIndex = new InvertedIndex();
  private db: any | null = null;
  private stats: IndexStats = { totalFiles: 0, totalSymbols: 0, languages: {} };
  private indexing = false;

  constructor() {
    this.initDatabase();
  }

  private initDatabase() {
    try {
      this.db = getSearchDB();
      initSearchDatabase(this.db);
      this.loadFromDatabase();
    } catch (err: any) {
      console.error('[CodeSearch] 数据库初始化失败:', err.message);
    }
  }

  private loadFromDatabase() {
    if (!this.db) return;
    try {
      const rows = this.db.prepare('SELECT * FROM code_symbols').all() as any[];
      for (const row of rows) {
        const sym: CodeSymbol = {
          id: row.id,
          filePath: row.file_path,
          lineStart: row.line_start,
          lineEnd: row.line_end,
          name: row.name,
          symbolType: row.symbol_type as SymbolType,
          signature: row.signature || undefined,
          documentation: row.documentation || undefined,
          container: row.container || undefined,
          language: row.language,
        };
        this.symbols.set(sym.id, sym);
      }

      const indexRow = this.db.prepare('SELECT * FROM search_index ORDER BY id DESC LIMIT 1').get() as any;
      if (indexRow) {
        this.invertedIndex.deserialize(indexRow.index_data);
        this.stats = JSON.parse(indexRow.stats || '{}');
      }

      console.log(`[CodeSearch] 从数据库加载了 ${this.symbols.size} 个符号`);
    } catch (err: any) {
      console.error('[CodeSearch] 加载数据库失败:', err.message);
    }
  }

  private saveToDatabase() {
    if (!this.db) return;
    try {
      const insert = this.db.prepare(`
        INSERT OR REPLACE INTO code_symbols
        (id, file_path, line_start, line_end, name, symbol_type, signature, documentation, container, language, content)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      this.db.prepare('DELETE FROM code_symbols').run();

      for (const sym of this.symbols.values()) {
        insert.run(
          sym.id,
          sym.filePath,
          sym.lineStart,
          sym.lineEnd,
          sym.name,
          sym.symbolType,
          sym.signature || null,
          sym.documentation || null,
          sym.container || null,
          sym.language,
          null
        );
      }

      this.db.prepare('INSERT INTO search_index (index_data, stats) VALUES (?, ?)').run(
        this.invertedIndex.serialize(),
        JSON.stringify(this.stats)
      );

      console.log(`[CodeSearch] 已保存 ${this.symbols.size} 个符号到数据库`);
    } catch (err: any) {
      console.error('[CodeSearch] 保存数据库失败:', err.message);
    }
  }

  async indexFile(filePath: string): Promise<number> {
    if (!isSupportedFile(filePath)) return 0;

    try {
      const content = await readFile(filePath, 'utf-8');
      const language = getLanguage(filePath);
      const parsedSymbols = parseCode(content, language);

      // 移除该文件的旧符号
      for (const [id, sym] of this.symbols.entries()) {
        if (sym.filePath === filePath) {
          this.symbols.delete(id);
        }
      }

      const lines = content.split('\n');
      for (const ps of parsedSymbols) {
        const id = `${filePath}#${ps.name}@${ps.lineStart}`;
        const sym: CodeSymbol = {
          id,
          filePath,
          lineStart: ps.lineStart,
          lineEnd: ps.lineEnd,
          name: ps.name,
          symbolType: ps.symbolType,
          signature: ps.signature,
          documentation: ps.documentation,
          container: ps.container,
          language,
        };
        this.symbols.set(id, sym);

        // 索引名称
        const nameTokens = tokenize(ps.name);
        for (const token of nameTokens) {
          this.invertedIndex.addTerm(token, {
            symbolId: id,
            termFrequency: 1,
            field: 'name',
            lineStart: ps.lineStart,
          });
        }

        // 索引签名
        if (ps.signature) {
          const sigTokens = tokenize(ps.signature);
          for (const token of sigTokens) {
            this.invertedIndex.addTerm(token, {
              symbolId: id,
              termFrequency: 1,
              field: 'signature',
              lineStart: ps.lineStart,
            });
          }
        }

        // 索引文档注释
        if (ps.documentation) {
          const docTokens = tokenize(ps.documentation);
          for (const token of docTokens) {
            this.invertedIndex.addTerm(token, {
              symbolId: id,
              termFrequency: 1,
              field: 'documentation',
              lineStart: ps.lineStart,
            });
          }
        }

        // 索引内容上下文
        const contextStart = Math.max(0, ps.lineStart - 2);
        const contextEnd = Math.min(lines.length, ps.lineEnd + 2);
        const contextText = lines.slice(contextStart - 1, contextEnd).join(' ');
        const contentTokens = tokenize(contextText);
        for (const token of contentTokens) {
          this.invertedIndex.addTerm(token, {
            symbolId: id,
            termFrequency: 1,
            field: 'content',
            lineStart: ps.lineStart,
          });
        }
      }

      // 更新文档频率
      const allTokens = new Set<string>();
      for (const ps of parsedSymbols) {
        tokenize(ps.name).forEach(t => allTokens.add(t));
        if (ps.signature) tokenize(ps.signature).forEach(t => allTokens.add(t));
        if (ps.documentation) tokenize(ps.documentation).forEach(t => allTokens.add(t));
      }
      for (const token of allTokens) {
        this.invertedIndex.incrementDocFreq(token);
      }

      this.stats.totalFiles++;
      this.stats.languages[language] = (this.stats.languages[language] || 0) + 1;

      return parsedSymbols.length;
    } catch (err: any) {
      console.error(`[CodeSearch] 索引文件失败 ${filePath}:`, err.message);
      return 0;
    }
  }

  async indexDirectory(dirPath: string, options: { ignore?: string[] } = {}): Promise<IndexStats> {
    if (this.indexing) {
      throw new Error('索引正在进行中，请稍后再试');
    }

    this.indexing = true;
    const startTime = Date.now();

    try {
      const ignoreList = options.ignore || ['node_modules', 'dist', '.git', 'coverage', '__tests__', '*.test.*', '*.spec.*'];
      const pattern = join(dirPath, '**/*');

      const files: string[] = await new Promise((resolve, reject) => {
        glob(pattern, {
          ignore: ignoreList.map(i => join(dirPath, '**', i)),
          nodir: true,
          absolute: true,
        }, (err: any, matches: string[]) => {
          if (err) reject(err);
          else resolve(matches);
        });
      });

      const supportedFiles = files.filter(isSupportedFile);
      let totalSymbols = 0;

      // 清空旧索引
      this.symbols.clear();
      this.invertedIndex.clear();
      this.stats = { totalFiles: 0, totalSymbols: 0, languages: {} };

      for (const file of supportedFiles) {
        const count = await this.indexFile(file);
        totalSymbols += count;
      }

      this.invertedIndex.setTotalDocuments(this.symbols.size);
      this.stats.totalSymbols = totalSymbols;
      this.stats.lastIndexedAt = new Date().toISOString();

      // 保存到数据库
      this.saveToDatabase();

      const duration = Date.now() - startTime;
      console.log(`[CodeSearch] 索引完成: ${supportedFiles.length} 个文件, ${totalSymbols} 个符号, 耗时 ${duration}ms`);

      return this.stats;
    } finally {
      this.indexing = false;
    }
  }

  search(query: string, options: {
    maxResults?: number;
    symbolType?: SymbolType;
    language?: string;
    filePattern?: string;
  } = {}): SearchResult[] {
    const { maxResults = 20, symbolType, language, filePattern } = options;
    const queryTerms = tokenize(query);

    if (queryTerms.length === 0) return [];

    const scores = this.invertedIndex.search(queryTerms);
    const results: SearchResult[] = [];

    for (const [symbolId, score] of scores.entries()) {
      const sym = this.symbols.get(symbolId);
      if (!sym) continue;

      if (symbolType && sym.symbolType !== symbolType) continue;
      if (language && sym.language !== language) continue;
      if (filePattern && !sym.filePath.includes(filePattern)) continue;

      results.push({
        symbol: sym,
        score,
        matchedTerms: queryTerms,
        contextLines: [],
      });
    }

    // 按分数排序
    results.sort((a, b) => b.score - a.score);

    // 获取上下文
    const topResults = results.slice(0, maxResults);
    for (const result of topResults) {
      result.contextLines = this.getContextLines(result.symbol);
    }

    return topResults;
  }

  private getContextLines(_symbol: CodeSymbol): string[] {
    return [];
  }

  async getContextLinesAsync(symbol: CodeSymbol, contextSize: number = 5): Promise<string[]> {
    try {
      const content = await readFile(symbol.filePath, 'utf-8');
      const lines = content.split('\n');
      const start = Math.max(0, symbol.lineStart - contextSize - 1);
      const end = Math.min(lines.length, symbol.lineEnd + contextSize);
      return lines.slice(start, end).map((line, i) => `${start + i + 1}: ${line}`);
    } catch {
      return [];
    }
  }

  findSymbol(name: string, options: {
    filePath?: string;
    symbolType?: SymbolType;
    exact?: boolean;
  } = {}): CodeSymbol[] {
    const { filePath, symbolType, exact = false } = options;
    const results: CodeSymbol[] = [];
    const lowerName = name.toLowerCase();

    for (const sym of this.symbols.values()) {
      const nameMatch = exact
        ? sym.name === name
        : sym.name.toLowerCase().includes(lowerName);

      if (!nameMatch) continue;
      if (filePath && !sym.filePath.includes(filePath)) continue;
      if (symbolType && sym.symbolType !== symbolType) continue;

      results.push(sym);
    }

    return results.sort((a, b) => a.filePath.localeCompare(b.filePath));
  }

  getSymbolsByFile(filePath: string): CodeSymbol[] {
    return Array.from(this.symbols.values())
      .filter(s => s.filePath === filePath)
      .sort((a, b) => a.lineStart - b.lineStart);
  }

  getStats(): IndexStats {
    return { ...this.stats };
  }

  isIndexing(): boolean {
    return this.indexing;
  }

  async getFileContext(filePath: string, line: number, contextSize: number = 5): Promise<string[]> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const start = Math.max(0, line - contextSize - 1);
      const end = Math.min(lines.length, line + contextSize);
      return lines.slice(start, end).map((l, i) => `${start + i + 1}: ${l}`);
    } catch (err: any) {
      throw new Error(`无法读取文件: ${err.message}`);
    }
  }
}

// 单例实例
let serviceInstance: CodeSemanticSearchService | null = null;

export function getCodeSemanticSearchService(): CodeSemanticSearchService {
  if (!serviceInstance) {
    serviceInstance = new CodeSemanticSearchService();
  }
  return serviceInstance;
}

// ============ MCP 工具注册 ============

import { MCPTool } from './mcpTools.js';

export function registerCodeSemanticSearchTools(toolsRegistry: Map<string, MCPTool>) {
  const service = getCodeSemanticSearchService();

  toolsRegistry.set('code_search', {
    name: 'code_search',
    description: '语义搜索代码库。支持自然语言查询，按函数名、类名、签名、注释等匹配并返回排序结果。支持模糊搜索和上下文展示。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索查询（自然语言或关键词）' },
        max_results: { type: 'number', description: '最大返回结果数（默认20）' },
        symbol_type: { type: 'string', description: '符号类型过滤', enum: ['function', 'class', 'interface', 'type', 'enum', 'variable', 'import', 'export', 'method', 'property', 'comment', 'docstring'] },
        language: { type: 'string', description: '语言过滤', enum: ['typescript', 'javascript', 'python', 'java', 'go', 'rust'] },
        file_pattern: { type: 'string', description: '文件路径匹配过滤（如 ".ts", "src/services"）' },
      },
      required: ['query'],
    },
    execute: async ({ query, max_results = 20, symbol_type, language, file_pattern }) => {
      try {
        const results = service.search(query, {
          maxResults: max_results,
          symbolType: symbol_type as SymbolType,
          language,
          filePattern: file_pattern,
        });

        const enriched = await Promise.all(
          results.map(async (r) => ({
            file: r.symbol.filePath,
            name: r.symbol.name,
            type: r.symbol.symbolType,
            language: r.symbol.language,
            line: r.symbol.lineStart,
            line_end: r.symbol.lineEnd,
            signature: r.symbol.signature,
            container: r.symbol.container,
            score: Math.round(r.score * 100) / 100,
            context: await service.getContextLinesAsync(r.symbol, 3),
          }))
        );

        return {
          success: true,
          query,
          total: enriched.length,
          results: enriched,
          message: `找到 ${enriched.length} 个匹配结果`,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('code_index', {
    name: 'code_index',
    description: '索引指定目录或文件，构建代码语义搜索索引。支持增量索引和全量重建。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '要索引的目录或文件路径' },
        ignore: { type: 'string', description: '忽略模式，逗号分隔（默认: node_modules,dist,.git）' },
      },
      required: ['path'],
    },
    execute: async ({ path, ignore = 'node_modules,dist,.git,coverage,__tests__' }) => {
      try {
        const ignoreList = ignore.split(',').map((s: string) => s.trim()).filter(Boolean);
        const stats = await service.indexDirectory(path, { ignore: ignoreList });
        return {
          success: true,
          path,
          stats,
          message: `索引完成: ${stats.totalFiles} 个文件, ${stats.totalSymbols} 个符号`,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('code_symbol', {
    name: 'code_symbol',
    description: '查找符号定义。通过符号名称精确或模糊查找函数、类、变量等定义位置。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '符号名称' },
        exact: { type: 'boolean', description: '是否精确匹配（默认false）' },
        symbol_type: { type: 'string', description: '符号类型过滤', enum: ['function', 'class', 'interface', 'type', 'enum', 'variable', 'import', 'export', 'method', 'property', 'comment', 'docstring'] },
        file_path: { type: 'string', description: '文件路径过滤（可选）' },
      },
      required: ['name'],
    },
    execute: async ({ name, exact = false, symbol_type, file_path }) => {
      try {
        const symbols = service.findSymbol(name, {
          exact,
          symbolType: symbol_type as SymbolType,
          filePath: file_path,
        });

        const enriched = await Promise.all(
          symbols.slice(0, 50).map(async (sym) => ({
            file: sym.filePath,
            name: sym.name,
            type: sym.symbolType,
            language: sym.language,
            line: sym.lineStart,
            line_end: sym.lineEnd,
            signature: sym.signature,
            container: sym.container,
            context: await service.getContextLinesAsync(sym, 3),
          }))
        );

        return {
          success: true,
          name,
          total: symbols.length,
          symbols: enriched,
          message: `找到 ${symbols.length} 个符号定义`,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('code_context', {
    name: 'code_context',
    description: '获取指定文件和行号周围的代码上下文。用于查看搜索结果或符号定义的完整代码片段。',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '文件绝对路径' },
        line: { type: 'number', description: '行号（从1开始）' },
        context_size: { type: 'number', description: '上下文行数（默认5）' },
      },
      required: ['file_path', 'line'],
    },
    execute: async ({ file_path, line, context_size = 5 }) => {
      try {
        const context = await service.getFileContext(file_path, line, context_size);
        return {
          success: true,
          file: file_path,
          line,
          context_size,
          context,
          message: `获取到 ${context.length} 行上下文`,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  toolsRegistry.set('code_stats', {
    name: 'code_stats',
    description: '获取代码索引的统计信息，包括已索引文件数、符号数、语言分布等。',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      const stats = service.getStats();
      return {
        success: true,
        stats,
        message: `索引状态: ${stats.totalFiles} 个文件, ${stats.totalSymbols} 个符号`,
      };
    },
  });
}

// ============ 后台索引器 ============

export async function startBackgroundIndexer(projectPath?: string): Promise<void> {
  const service = getCodeSemanticSearchService();
  const targetPath = projectPath || process.cwd();

  // 延迟启动，避免阻塞服务器启动
  setTimeout(async () => {
    try {
      console.log('[CodeSearch] 启动后台索引...');
      const stats = await service.indexDirectory(targetPath);
      console.log(`[CodeSearch] 后台索引完成: ${stats.totalFiles} 文件, ${stats.totalSymbols} 符号`);
    } catch (err: any) {
      console.error('[CodeSearch] 后台索引失败:', err.message);
    }
  }, 5000);
}
