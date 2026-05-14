import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getDatabase } from '../config/database.js';

const execAsync = promisify(exec);

const PROJECT_ROOT = path.resolve(process.cwd());
const BACKUP_DIR = path.join(PROJECT_ROOT, 'backups');
const UPGRADE_DIR = path.join(PROJECT_ROOT, 'upgrades');
const TEMP_DIR = path.join(PROJECT_ROOT, 'temp-upgrade');

const VERSION = 'Q1.31';

const SOURCE_DIRS = [
  { src: 'src', label: '源代码' },
  { src: 'prisma', label: 'Prisma配置' },
];

const CONFIG_FILES = [
  'package.json',
  'tsconfig.json',
  '.env',
];

function getBackupDir(): string {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  return BACKUP_DIR;
}

function getUpgradeDir(): string {
  if (!fs.existsSync(UPGRADE_DIR)) {
    fs.mkdirSync(UPGRADE_DIR, { recursive: true });
  }
  return UPGRADE_DIR;
}

function cleanTempDir(): string {
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true });
  }
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  return TEMP_DIR;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function sanitizeFilename(name: string): string {
  return path.basename(name).replace(/[<>:"/\\|?*]/g, '_');
}

function addDirToZip(zip: AdmZip, dirPath: string, zipPath: string): void {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const zipEntry = path.join(zipPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
      addDirToZip(zip, fullPath, zipEntry);
    } else {
      zip.addLocalFile(fullPath, zipPath);
    }
  }
}

async function createBackup(name?: string, operatorId?: number): Promise<{
  filename: string;
  size: number;
  sizeFormatted: string;
  fileCount: number;
}> {
  const backupDir = getBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupName = name ? sanitizeFilename(name) : `backup-${VERSION}`;
  const filename = `${backupName}-${timestamp}.zip`;
  const filePath = path.join(backupDir, filename);

  const zip = new AdmZip();

  for (const dir of SOURCE_DIRS) {
    addDirToZip(zip, path.join(PROJECT_ROOT, dir.src), dir.src);
  }

  for (const file of CONFIG_FILES) {
    const fullPath = path.join(PROJECT_ROOT, file);
    if (fs.existsSync(fullPath)) {
      zip.addLocalFile(fullPath);
    }
  }

  // 备份数据库文件
  const dbPath = path.join(PROJECT_ROOT, 'data');
  if (fs.existsSync(dbPath)) {
    const dbEntries = fs.readdirSync(dbPath, { withFileTypes: true });
    for (const entry of dbEntries) {
      if (entry.isFile() && (entry.name.endsWith('.db') || entry.name.endsWith('.sqlite'))) {
        zip.addLocalFile(path.join(dbPath, entry.name), 'data');
      }
    }
  }

  zip.writeZip(filePath);

  const stats = fs.statSync(filePath);
  const fileCount = zip.getEntries().length;

  // 记录到升级历史
  if (operatorId) {
    try {
      const db = getDatabase();
      db.prepare(
        `INSERT INTO upgrade_history (action, version_from, filename, backup_file, status, message, operator_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run('backup', VERSION, filename, filename, 'success', `备份完成，包含${fileCount}个文件`, operatorId);
    } catch {}
  }

  return {
    filename,
    size: stats.size,
    sizeFormatted: formatFileSize(stats.size),
    fileCount,
  };
}

function listBackups(): Array<{
  filename: string;
  size: number;
  sizeFormatted: string;
  createdAt: string;
}> {
  const backupDir = getBackupDir();
  if (!fs.existsSync(backupDir)) return [];

  const files = fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.zip'))
    .map(f => {
      const filePath = path.join(backupDir, f);
      const stats = fs.statSync(filePath);
      return {
        filename: f,
        size: stats.size,
        sizeFormatted: formatFileSize(stats.size),
        createdAt: stats.birthtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return files;
}

function listUpgrades(): Array<{
  filename: string;
  size: number;
  sizeFormatted: string;
  createdAt: string;
}> {
  const upgradeDir = getUpgradeDir();
  if (!fs.existsSync(upgradeDir)) return [];

  const files = fs.readdirSync(upgradeDir)
    .filter(f => f.endsWith('.zip'))
    .map(f => {
      const filePath = path.join(upgradeDir, f);
      const stats = fs.statSync(filePath);
      return {
        filename: f,
        size: stats.size,
        sizeFormatted: formatFileSize(stats.size),
        createdAt: stats.birthtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return files;
}

function saveUploadedFile(fileBuffer: Buffer, originalName: string): string {
  const upgradeDir = getUpgradeDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `upgrade-${timestamp}-${sanitizeFilename(originalName)}`;
  const filePath = path.join(upgradeDir, filename);
  fs.writeFileSync(filePath, fileBuffer);
  return filename;
}

function deleteBackup(filename: string): boolean {
  const filePath = path.join(getBackupDir(), sanitizeFilename(filename));
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

function deleteUpgrade(filename: string): boolean {
  const filePath = path.join(getUpgradeDir(), sanitizeFilename(filename));
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

async function executeUpgrade(
  filename: string,
  targetVersion: string,
  operatorId?: number
): Promise<{ message: string; version: string }> {
  const filePath = path.join(getUpgradeDir(), sanitizeFilename(filename));

  if (!fs.existsSync(filePath)) {
    throw new Error('升级包文件不存在');
  }

  // 先自动创建备份
  let backupFile = '';
  try {
    const backup = await createBackup(`pre-upgrade-${targetVersion}`, operatorId);
    backupFile = backup.filename;
  } catch (e: any) {
    throw new Error(`升级前备份失败: ${e.message}`);
  }

  // 解压升级包
  const extractDir = cleanTempDir();
  const zip = new AdmZip(filePath);
  zip.extractAllTo(extractDir, true);

  // 合并 src 目录
  const extractSrc = path.join(extractDir, 'src');
  const currentSrc = path.join(PROJECT_ROOT, 'src');
  if (fs.existsSync(extractSrc)) {
    const oldBackup = path.join(PROJECT_ROOT, 'src-upgrade-old');
    if (fs.existsSync(oldBackup)) {
      fs.rmSync(oldBackup, { recursive: true });
    }
    if (fs.existsSync(currentSrc)) {
      fs.renameSync(currentSrc, oldBackup);
    }
    try {
      fs.cpSync(extractSrc, currentSrc, { recursive: true });
      if (fs.existsSync(oldBackup)) {
        fs.rmSync(oldBackup, { recursive: true });
      }
    } catch (cpErr: any) {
      if (fs.existsSync(oldBackup) && !fs.existsSync(currentSrc)) {
        fs.renameSync(oldBackup, currentSrc);
      }
      throw new Error(`源代码合并失败: ${cpErr.message}`);
    }
  }

  // 更新配置文件
  const configFiles = ['package.json', 'tsconfig.json'];
  for (const file of configFiles) {
    const newFile = path.join(extractDir, file);
    if (fs.existsSync(newFile)) {
      const currentFile = path.join(PROJECT_ROOT, file);
      const backup = currentFile + '.upgrade-old';
      if (fs.existsSync(currentFile)) {
        fs.copyFileSync(currentFile, backup);
      }
      try {
        fs.copyFileSync(newFile, currentFile);
        if (fs.existsSync(backup)) {
          fs.unlinkSync(backup);
        }
      } catch (e: any) {
        if (fs.existsSync(backup)) {
          fs.copyFileSync(backup, currentFile);
          fs.unlinkSync(backup);
        }
        throw new Error(`配置文件更新失败(${file}): ${e.message}`);
      }
    }
  }

  // 清理临时目录
  try { fs.rmSync(extractDir, { recursive: true }); } catch {}

  // 安装依赖
  try {
    await execAsync('npm install', { cwd: PROJECT_ROOT, timeout: 120000 });
  } catch (e: any) {
    console.warn('npm install 警告:', e.message);
  }

  // 记录升级历史
  if (operatorId) {
    try {
      const db = getDatabase();
      db.prepare(
        `INSERT INTO upgrade_history (action, version_from, version_to, filename, backup_file, status, message, operator_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('upgrade', VERSION, targetVersion, filename, backupFile, 'success', `升级到 ${targetVersion}`, operatorId);
    } catch {}
  }

  // 延迟重启
  setTimeout(() => {
    console.log('执行系统重启以应用升级...');
    process.exit(0);
  }, 3000);

  return {
    message: '升级成功，系统正在重启...',
    version: targetVersion,
  };
}

async function rollbackToBackup(
  filename: string,
  operatorId?: number
): Promise<{ message: string; backupFile: string }> {
  const filePath = path.join(getBackupDir(), sanitizeFilename(filename));

  if (!fs.existsSync(filePath)) {
    throw new Error('备份文件不存在');
  }

  const extractDir = cleanTempDir();
  const zip = new AdmZip(filePath);
  zip.extractAllTo(extractDir, true);

  // 恢复 src 目录
  const backupSrc = path.join(extractDir, 'src');
  const currentSrc = path.join(PROJECT_ROOT, 'src');
  if (fs.existsSync(backupSrc)) {
    const oldBackup = path.join(PROJECT_ROOT, 'src-rollback-old');
    if (fs.existsSync(oldBackup)) {
      fs.rmSync(oldBackup, { recursive: true });
    }
    if (fs.existsSync(currentSrc)) {
      fs.renameSync(currentSrc, oldBackup);
    }
    try {
      fs.cpSync(backupSrc, currentSrc, { recursive: true });
      if (fs.existsSync(oldBackup)) {
        fs.rmSync(oldBackup, { recursive: true });
      }
    } catch (cpErr: any) {
      if (fs.existsSync(oldBackup) && !fs.existsSync(currentSrc)) {
        fs.renameSync(oldBackup, currentSrc);
      }
      throw new Error(`源代码恢复失败: ${cpErr.message}`);
    }
  }

  // 恢复配置文件
  for (const file of CONFIG_FILES) {
    const backupFile = path.join(extractDir, file);
    const currentFile = path.join(PROJECT_ROOT, file);
    if (fs.existsSync(backupFile)) {
      const oldBackup = currentFile + '.rollback-old';
      if (fs.existsSync(currentFile)) {
        fs.copyFileSync(currentFile, oldBackup);
      }
      try {
        fs.copyFileSync(backupFile, currentFile);
        if (fs.existsSync(oldBackup)) {
          fs.unlinkSync(oldBackup);
        }
      } catch (cfErr: any) {
        if (fs.existsSync(oldBackup)) {
          fs.copyFileSync(oldBackup, currentFile);
          fs.unlinkSync(oldBackup);
        }
        throw new Error(`配置文件恢复失败(${file}): ${cfErr.message}`);
      }
    }
  }

  // 恢复数据库
  const backupDataDir = path.join(extractDir, 'data');
  const currentDataDir = path.join(PROJECT_ROOT, 'data');
  if (fs.existsSync(backupDataDir) && fs.existsSync(currentDataDir)) {
    fs.cpSync(backupDataDir, currentDataDir, { recursive: true });
  }

  // 清理
  try { fs.rmSync(extractDir, { recursive: true }); } catch {}

  // 安装依赖
  try {
    await execAsync('npm install', { cwd: PROJECT_ROOT, timeout: 120000 });
  } catch (e: any) {
    console.warn('npm install 警告:', e.message);
  }

  // 记录
  if (operatorId) {
    try {
      const db = getDatabase();
      db.prepare(
        `INSERT INTO upgrade_history (action, version_from, backup_file, status, message, operator_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run('rollback', VERSION, filename, 'success', `回滚到备份 ${filename}`, operatorId);
    } catch {}
  }

  // 延迟重启
  setTimeout(() => {
    console.log('执行系统重启以应用回滚...');
    process.exit(0);
  }, 3000);

  return {
    message: '回滚成功，系统正在重启...',
    backupFile: filename,
  };
}

function getUpgradeHistory(page = 1, pageSize = 20) {
  const db = getDatabase();
  const offset = (page - 1) * pageSize;
  const total = (db.prepare('SELECT COUNT(*) as count FROM upgrade_history').get() as any).count;
  const items = db.prepare(
    `SELECT h.*, u.username as operator_name
     FROM upgrade_history h
     LEFT JOIN users u ON h.operator_id = u.id
     ORDER BY h.created_at DESC
     LIMIT ? OFFSET ?`
  ).all(pageSize, offset);
  return { total, items, page, pageSize };
}

function getVersionInfo() {
  return {
    version: VERSION,
    name: 'OQ助手平台',
    nodeVersion: process.version,
    platform: process.platform,
    uptime: Math.floor(process.uptime()),
    startTime: new Date(Date.now() - process.uptime() * 1000).toISOString(),
  };
}

export const upgradeService = {
  createBackup,
  listBackups,
  listUpgrades,
  deleteBackup,
  deleteUpgrade,
  saveUploadedFile,
  executeUpgrade,
  rollbackToBackup,
  getUpgradeHistory,
  getVersionInfo,
  getBackupDir,
  getUpgradeDir,
};