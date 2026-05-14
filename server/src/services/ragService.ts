import { prismaService } from './prismaService.js';

export interface DocumentChunk {
  id: number;
  content: string;
  embedding?: number[];
  metadata?: Record<string, any>;
}

export interface SearchResult {
  chunk: DocumentChunk;
  score: number;
}

// Simple text chunking strategy
export function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    let chunk = text.slice(start, end);

    // Try to break at sentence or paragraph boundary
    if (end < text.length) {
      const lastPeriod = chunk.lastIndexOf('。');
      const lastNewline = chunk.lastIndexOf('\n');
      const breakPoint = Math.max(lastPeriod, lastNewline);
      if (breakPoint > chunkSize * 0.5) {
        chunk = chunk.slice(0, breakPoint + 1);
      }
    }

    chunks.push(chunk.trim());
    start = start + chunk.length - overlap;
    if (start < 0) start = 0;
  }

  return chunks.filter(c => c.length > 10);
}

// 使用配置的LLM Provider生成embedding
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    // 尝试使用Ollama的embedding接口
    const provider = await prismaService.aiProvider.findDefault();
    if (!provider) {
      console.warn('[RAG] 没有可用的AI Provider，使用fallback embedding');
      return fallbackEmbedding(text);
    }

    // 如果是Ollama，使用其embedding接口
    if (provider.provider === 'ollama') {
      const resp = await fetch(`${provider.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: provider.model || 'nomic-embed-text',
          prompt: text,
        }),
      });

      if (resp.ok) {
        const data = await resp.json() as { embedding?: number[] };
        if (data.embedding && Array.isArray(data.embedding)) {
          return data.embedding;
        }
      }
    }

    // 对于OpenAI兼容的API，尝试使用embedding接口
    if (provider.provider === 'openai' || provider.provider === 'dashscope' || provider.provider === 'custom') {
      const embeddingModel = provider.model.includes('embed')
        ? provider.model
        : 'text-embedding-v3';

      const resp = await fetch(`${provider.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: embeddingModel,
          input: text,
        }),
      });

      if (resp.ok) {
        const data = await resp.json() as { data?: Array<{ embedding?: number[] }> };
        if (data.data?.[0]?.embedding) {
          return data.data[0].embedding;
        }
      }
    }

    console.warn('[RAG] Embedding API调用失败，使用fallback');
    return fallbackEmbedding(text);
  } catch (err: any) {
    console.warn('[RAG] Embedding生成失败:', err.message);
    return fallbackEmbedding(text);
  }
}

// Fallback embedding using TF-IDF-like approach
function fallbackEmbedding(text: string): number[] {
  const vectorSize = 384;
  const vector = new Array(vectorSize).fill(0);

  // 使用字符n-gram特征
  const normalized = text.toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]/g, '');
  for (let i = 0; i < normalized.length - 1; i++) {
    const bigram = normalized.slice(i, i + 2);
    let hash = 0;
    for (let j = 0; j < bigram.length; j++) {
      hash = ((hash << 5) - hash) + bigram.charCodeAt(j);
      hash = hash & hash;
    }
    const idx = Math.abs(hash) % vectorSize;
    vector[idx] += 1;
  }

  // 归一化
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vector;
  return vector.map(v => v / magnitude);
}

// Cosine similarity between two vectors
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    // 如果维度不同，截断或填充到相同长度
    const maxLen = Math.max(a.length, b.length);
    const aPadded = [...a, ...new Array(maxLen - a.length).fill(0)];
    const bPadded = [...b, ...new Array(maxLen - b.length).fill(0)];
    a = aPadded;
    b = bPadded;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA && normB ? dotProduct / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

// RAG Pipeline
export const ragService = {
  // Create knowledge base
  async createKnowledgeBase(userId: number, name: string, description?: string) {
    return prismaService.knowledgeBase.create({
      userId,
      name,
      description: description || null,
      status: 'active',
    });
  },

  // Upload and process document
  async uploadDocument(knowledgeBaseId: number, userId: number, fileInfo: {
    fileName: string;
    originalName: string;
    fileType: string;
    fileSize: number;
    filePath: string;
    content: string;
  }) {
    // Create document record
    const document = await prismaService.document.create({
      knowledgeBaseId,
      userId,
      fileName: fileInfo.fileName,
      originalName: fileInfo.originalName,
      fileType: fileInfo.fileType,
      fileSize: fileInfo.fileSize,
      filePath: fileInfo.filePath,
      content: fileInfo.content,
      status: 'processing',
    });

    // Chunk the document
    const chunks = chunkText(fileInfo.content);

    // Generate embeddings and store chunks
    for (let i = 0; i < chunks.length; i++) {
      try {
        const embedding = await generateEmbedding(chunks[i]);
        await prismaService.documentChunk.create({
          documentId: document.id,
          knowledgeBaseId,
          content: chunks[i],
          embedding: JSON.stringify(embedding),
          chunkIndex: i,
          metadata: JSON.stringify({ source: fileInfo.originalName, index: i }),
        });
      } catch (err: any) {
        console.warn(`[RAG] Chunk ${i} embedding failed:`, err.message);
        // 即使embedding失败也存储chunk
        await prismaService.documentChunk.create({
          documentId: document.id,
          knowledgeBaseId,
          content: chunks[i],
          embedding: JSON.stringify(fallbackEmbedding(chunks[i])),
          chunkIndex: i,
          metadata: JSON.stringify({ source: fileInfo.originalName, index: i, fallback: true }),
        });
      }
    }

    // Update document and knowledge base counts
    await prismaService.document.update(document.id, {
      status: 'completed',
      chunkCount: chunks.length,
    });

    const kb = await prismaService.knowledgeBase.findById(knowledgeBaseId);
    if (kb) {
      await prismaService.knowledgeBase.update(knowledgeBaseId, {
        documentCount: kb.documentCount + 1,
        chunkCount: kb.chunkCount + chunks.length,
      });
    }

    return { document, chunks: chunks.length };
  },

  // Search knowledge base
  async search(knowledgeBaseId: number, query: string, topK = 5): Promise<SearchResult[]> {
    const queryEmbedding = await generateEmbedding(query);
    const chunks = await prismaService.documentChunk.findByKnowledgeBase(knowledgeBaseId);

    const results: SearchResult[] = [];
    for (const chunk of chunks) {
      if (chunk.embedding) {
        try {
          const chunkEmbedding = JSON.parse(chunk.embedding) as number[];
          const score = cosineSimilarity(queryEmbedding, chunkEmbedding);
          if (score > 0.1) { // 过滤低相关度结果
            results.push({
              chunk: {
                id: chunk.id,
                content: chunk.content,
                embedding: chunkEmbedding,
                metadata: chunk.metadata ? JSON.parse(chunk.metadata) : {},
              },
              score,
            });
          }
        } catch {
          // 忽略解析错误的embedding
        }
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  },

  // Multi-knowledge base search
  async searchMultiple(knowledgeBaseIds: number[], query: string, topK = 5): Promise<SearchResult[]> {
    const allResults: SearchResult[] = [];
    for (const kbId of knowledgeBaseIds) {
      const results = await this.search(kbId, query, topK);
      allResults.push(...results);
    }
    return allResults.sort((a, b) => b.score - a.score).slice(0, topK);
  },

  // Delete document and its chunks
  async deleteDocument(documentId: number) {
    const document = await prismaService.document.findById(documentId);
    if (!document) return;

    await prismaService.documentChunk.deleteByDocument(documentId);
    await prismaService.document.delete(documentId);

    // Update knowledge base counts
    const kb = await prismaService.knowledgeBase.findById(document.knowledgeBaseId);
    if (kb) {
      await prismaService.knowledgeBase.update(kb.id, {
        documentCount: Math.max(0, kb.documentCount - 1),
        chunkCount: Math.max(0, kb.chunkCount - document.chunkCount),
      });
    }
  },

  // Format search results for LLM context
  formatContext(results: SearchResult[]): string {
    if (results.length === 0) return '';

    const contexts = results.map((r, i) =>
      `[${i + 1}] ${r.chunk.content} (相关度: ${(r.score * 100).toFixed(1)}%)`
    );

    return `【知识库检索结果】\n\n${contexts.join('\n\n')}\n\n请基于以上知识库内容回答用户问题。`;
  },

  // 增强对话：将RAG结果注入到对话中
  async enhanceConversation(
    _conversationId: number,
    knowledgeBaseIds: number[],
    query: string
  ): Promise<string> {
    if (!knowledgeBaseIds || knowledgeBaseIds.length === 0) return '';

    const results = await this.searchMultiple(knowledgeBaseIds, query, 5);
    return this.formatContext(results);
  },
};
