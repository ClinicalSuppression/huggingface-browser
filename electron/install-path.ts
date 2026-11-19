import os from 'os';
import path from 'path';

export function validateInstallPath(storagePath: unknown, userProfile = os.homedir()): string {
  if (typeof storagePath !== 'string' || !storagePath.trim() || storagePath.includes('..')) {
    throw new Error('Invalid model storage path');
  }
  const expandedPath = storagePath.replace(/^%USERPROFILE%(?=\\|\/|$)/i, userProfile);
  if (!path.isAbsolute(expandedPath)) {
    throw new Error('Model storage path must be absolute or use %USERPROFILE%');
  }
  return path.resolve(expandedPath);
}
