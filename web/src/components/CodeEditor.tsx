import { useState, useCallback } from 'react';
import {
  Folder, FolderOpen, File, ChevronRight, ChevronDown,
  RefreshCw, Search, FilePlus, Copy, Download, X, Code2,
} from 'lucide-react';
import axios from 'axios';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  extension?: string;
  modified?: string;
  children?: FileNode[];
}

interface CodeEditorProps {
  className?: string;
  initialContent?: string;
}

export default function CodeEditor({ className = '' }: CodeEditorProps) {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ file: string; line: number; content: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [rootPath] = useState('D:\\工作\\SOLO CN\\niuma-ai-platform-Q1.10');
  const [newFileName, setNewFileName] = useState('');
  const [showNewFile, setShowNewFile] = useState(false);

  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const resp = await axios.post('/api/mcp/execute', {
        tool: 'fs_list',
        args: { path, recursive: false },
      });
      const data = resp.data.data;

      if (data.success) {
        const nodes: FileNode[] = data.items
          .filter((item: any) => item.type !== 'unknown')
          .map((item: any) => ({
            name: item.name,
            path: item.path,
            type: item.type,
            size: item.size,
            extension: item.extension,
            modified: item.modified,
          }))
          .sort((a: FileNode, b: FileNode) => {
            if (a.type === 'directory' && b.type !== 'directory') return -1;
            if (a.type !== 'directory' && b.type === 'directory') return 1;
            return a.name.localeCompare(b.name);
          });
        return nodes;
      }
      return [];
    } catch {
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFile = useCallback(async (path: string) => {
    setLoading(true);
    setSelectedFile(path);
    try {
      const resp = await axios.post('/api/mcp/execute', {
        tool: 'fs_read',
        args: { path, encoding: 'utf-8' },
      });
      const data = resp.data.data;
      if (data.success) {
        setFileContent(data.content);
      } else {
        setFileContent(`// 读取失败: ${data.error}`);
      }
    } catch {
      setFileContent('// 加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const saveFile = useCallback(async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      const resp = await axios.post('/api/mcp/execute', {
        tool: 'fs_write',
        args: { path: selectedFile, content: fileContent },
      });
      const data = resp.data.data;
      if (data.success) {
        // 保存成功
      }
    } finally {
      setSaving(false);
    }
  }, [selectedFile, fileContent]);

  const toggleDir = useCallback(async (path: string) => {
    const newExpanded = new Set(expandedDirs);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
      setExpandedDirs(newExpanded);
    } else {
      newExpanded.add(path);
      setExpandedDirs(newExpanded);
      // 加载子目录
      const children = await loadDirectory(path);
      setFiles(prev => updateChildren(prev, path, children));
    }
  }, [expandedDirs, loadDirectory]);

  const updateChildren = (nodes: FileNode[], parentPath: string, children: FileNode[]): FileNode[] => {
    return nodes.map(node => {
      if (node.path === parentPath) {
        return { ...node, children };
      }
      if (node.children) {
        return { ...node, children: updateChildren(node.children, parentPath, children) };
      }
      return node;
    });
  };

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const resp = await axios.post('/api/mcp/execute', {
        tool: 'code_search',
        args: {
          pattern: searchQuery,
          path: rootPath,
          filePattern: '*.{ts,tsx,js,jsx,py,go,json,md}',
          maxResults: 100,
        },
      });
      const data = resp.data.data;
      if (data.success) {
        setSearchResults(data.results);
      }
    } finally {
      setLoading(false);
    }
  }, [searchQuery, rootPath]);

  const getFileIcon = (ext?: string) => {
    if (!ext) return <File className="w-4 h-4" />;
    const iconMap: Record<string, React.ReactElement> = {
      '.ts': <Code2 className="w-4 h-4 text-blue-500" />,
      '.tsx': <Code2 className="w-4 h-4 text-blue-500" />,
      '.js': <Code2 className="w-4 h-4 text-yellow-500" />,
      '.jsx': <Code2 className="w-4 h-4 text-yellow-500" />,
      '.py': <Code2 className="w-4 h-4 text-green-500" />,
      '.go': <Code2 className="w-4 h-4 text-cyan-500" />,
      '.json': <File className="w-4 h-4 text-orange-500" />,
      '.md': <File className="w-4 h-4 text-gray-400" />,
    };
    return iconMap[ext] || <File className="w-4 h-4" />;
  };

  const renderFileTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map(node => (
      <div key={node.path}>
        <button
          onClick={() => {
            if (node.type === 'directory') {
              toggleDir(node.path);
            } else {
              loadFile(node.path);
            }
          }}
          className={`w-full flex items-center gap-1.5 px-2 py-1 hover:bg-secondary/50 rounded text-sm transition-colors ${
            selectedFile === node.path ? 'bg-primary/10 text-primary' : 'text-foreground'
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {node.type === 'directory' ? (
            <>
              {expandedDirs.has(node.path) ? (
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              )}
              {expandedDirs.has(node.path) ? (
                <FolderOpen className="w-4 h-4 text-yellow-500" />
              ) : (
                <Folder className="w-4 h-4 text-yellow-500" />
              )}
            </>
          ) : (
            <>
              <span className="w-3" />
              {getFileIcon(node.extension)}
            </>
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {node.type === 'directory' && expandedDirs.has(node.path) && node.children && (
          <div>{renderFileTree(node.children, depth + 1)}</div>
        )}
      </div>
    ));
  };

  const initFileTree = useCallback(async () => {
    setLoading(true);
    const nodes = await loadDirectory(rootPath);
    setFiles(nodes);
    setLoading(false);
  }, [rootPath, loadDirectory]);

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* 工具栏 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card">
        <button
          onClick={initFileTree}
          disabled={loading}
          className="p-1.5 rounded hover:bg-secondary transition-colors"
          title="刷新"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={() => setShowNewFile(true)}
          className="p-1.5 rounded hover:bg-secondary transition-colors"
          title="新建文件"
        >
          <FilePlus className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowSearch(!showSearch)}
          className={`p-1.5 rounded hover:bg-secondary transition-colors ${showSearch ? 'bg-secondary' : ''}`}
          title="搜索"
        >
          <Search className="w-4 h-4" />
        </button>
        {selectedFile && (
          <>
            <button
              onClick={saveFile}
              disabled={saving}
              className="p-1.5 rounded hover:bg-secondary transition-colors ml-auto"
              title="保存"
            >
              <Download className={`w-4 h-4 ${saving ? 'animate-pulse' : ''}`} />
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(fileContent)}
              className="p-1.5 rounded hover:bg-secondary transition-colors"
              title="复制内容"
            >
              <Copy className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* 搜索面板 */}
      {showSearch && (
        <div className="p-2 border-b border-border bg-card">
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="搜索代码内容..."
              className="flex-1 h-8 px-3 bg-background border border-input rounded text-sm"
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-3 h-8 bg-primary text-primary-foreground rounded text-sm"
            >
              搜索
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="max-h-40 overflow-y-auto text-xs space-y-1">
              {searchResults.map((result, i) => (
                <button
                  key={i}
                  onClick={() => loadFile(result.file)}
                  className="w-full text-left px-2 py-1 hover:bg-secondary rounded"
                >
                  <span className="text-primary">{result.file}</span>
                  <span className="text-muted-foreground ml-2">:{result.line}</span>
                  <span className="text-muted-foreground ml-2 truncate">{result.content}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* 文件树 */}
        <div className="w-48 border-r border-border overflow-y-auto bg-card/50">
          <div className="p-2 text-xs text-muted-foreground truncate" title={rootPath}>
            {rootPath}
          </div>
          {loading && files.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2" />
              加载中...
            </div>
          ) : (
            renderFileTree(files)
          )}
        </div>

        {/* 编辑器区域 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedFile ? (
            <>
              <div className="px-3 py-1.5 bg-secondary/30 border-b border-border text-xs text-muted-foreground truncate">
                {selectedFile}
              </div>
              <textarea
                value={fileContent}
                onChange={e => setFileContent(e.target.value)}
                className="flex-1 p-3 bg-[#1e1e1e] text-[#d4d4d4] font-mono text-sm resize-none focus:outline-none leading-relaxed"
                spellCheck={false}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Code2 className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm">选择文件进行编辑</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 新建文件弹窗 */}
      {showNewFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-4 w-96">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">新建文件</h3>
              <button onClick={() => setShowNewFile(false)} className="p-1 hover:bg-secondary rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={newFileName}
              onChange={e => setNewFileName(e.target.value)}
              placeholder="文件名（如：test.ts）"
              className="w-full h-10 px-3 border border-input rounded-lg mb-3"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowNewFile(false)} className="px-4 h-9 bg-secondary rounded-lg text-sm">
                取消
              </button>
              <button
                onClick={async () => {
                  if (!newFileName.trim()) return;
                  const path = `${rootPath}/${newFileName}`;
                  await axios.post('/api/mcp/execute', {
                    tool: 'fs_write',
                    args: { path, content: '' },
                  });
                  setNewFileName('');
                  setShowNewFile(false);
                  initFileTree();
                }}
                className="px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
