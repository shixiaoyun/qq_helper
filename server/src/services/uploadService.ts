import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';

const UPLOAD_DIR = path.resolve(process.cwd(), env.UPLOAD_DIR);

export function ensureUploadDir(): void {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

export function getUploadDir(): string {
  ensureUploadDir();
  return UPLOAD_DIR;
}

export function saveUploadedFile(buffer: Buffer, originalName: string, userId: number): { fileName: string; filePath: string; url: string } {
  ensureUploadDir();

  const ext = path.extname(originalName);
  const timestamp = Date.now();
  const fileName = `${userId}_${timestamp}${ext}`;
  const filePath = path.join(UPLOAD_DIR, fileName);

  fs.writeFileSync(filePath, buffer);

  return {
    fileName,
    filePath,
    url: `/uploads/${fileName}`,
  };
}

export function deleteUploadedFile(fileName: string): boolean {
  const filePath = path.join(UPLOAD_DIR, fileName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

export function getUploadedFilePath(fileName: string): string | null {
  const filePath = path.join(UPLOAD_DIR, fileName);
  return fs.existsSync(filePath) ? filePath : null;
}
