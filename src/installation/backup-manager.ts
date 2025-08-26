import fs from 'fs-extra';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { createGzip, createGunzip } from 'zlib';
import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'crypto';
import { pipeline } from 'stream/promises';
import archiver from 'archiver';
import extract from 'extract-zip';
import { globby } from 'globby';
import { LogContext } from '../utils/logger';
import type { BackupConfig, BackupResult, BackupOptions, InstallationOptions } from './types';

/**
 * Backup Manager for ForgeFlow V2
 * Handles data safety, backup creation, restoration, and scheduling
 */
export class BackupManager {
  private logger = new LogContext('BackupManager');
  private config: BackupConfig;
  private backupPath: string;
  private scheduledBackups = new Map<string, NodeJS.Timeout>();
  private isRunning = false;

  constructor(backupPath?: string, config?: Partial<BackupConfig>) {
    this.backupPath = backupPath || path.join(process.cwd(), 'backups');
    this.config = this.mergeWithDefaults(config || {});
  }

  /**
   * Initialize the backup manager
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing Backup Manager...');

    try {
      // Ensure backup directory exists
      await fs.ensureDir(this.backupPath);

      // Setup scheduled backups if configured
      if (this.config.schedule.frequency !== 'manual') {
        await this.scheduleBackups();
      }

      // Clean up old backups based on retention policy
      await this.cleanupOldBackups();

      this.logger.info('Backup Manager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Backup Manager', error);
      throw error;
    }
  }

  /**
   * Create initial backup during installation
   */
  async createInitialBackup(projectPath: string): Promise<BackupResult> {
    this.logger.info('Creating initial backup...');

    const backupName = `initial-backup-${Date.now()}`;
    const backupOptions: LocalBackupOptions = {
      name: backupName,
      description: 'Initial backup created during ForgeFlow V2 installation',
      includeNodeModules: false,
      includeLogs: false,
      compress: this.config.storage.compress,
      encrypt: this.config.storage.encrypt,
    };

    return this.createBackup(projectPath, backupOptions);
  }

  /**
   * Create a backup with specified options
   */
  async createBackup(sourcePath: string, options?: LocalBackupOptions): Promise<BackupResult> {
    const startTime = Date.now();

    if (this.isRunning) {
      throw new Error('Another backup operation is already in progress');
    }

    this.isRunning = true;
    this.logger.info(`Creating backup from: ${sourcePath}`);

    try {
      // Generate backup metadata
      const backupId = options?.name || `backup-${Date.now()}`;
      const timestamp = new Date();
      const backupFileName = `${backupId}.zip`;
      const backupFilePath = path.join(this.backupPath, backupFileName);

      // Collect files to backup
      const filesToBackup = await this.collectFilesToBackup(sourcePath, options);
      this.logger.info(`Found ${filesToBackup.length} files to backup`);

      // Create backup archive
      const archiveSize = await this.createArchive(
        sourcePath,
        backupFilePath,
        filesToBackup,
        options,
      );

      // Apply compression if requested
      let finalPath = backupFilePath;
      let finalSize = archiveSize;

      if (options?.compress || this.config.storage.compress) {
        finalPath = await this.compressBackup(backupFilePath);
        finalSize = (await fs.stat(finalPath)).size;
        await fs.remove(backupFilePath); // Remove uncompressed version
      }

      // Apply encryption if requested
      if (options?.encrypt || this.config.storage.encrypt) {
        finalPath = await this.encryptBackup(finalPath, this.config.storage.encryptionKey);
        finalSize = (await fs.stat(finalPath)).size;
      }

      // Create backup metadata
      const metadata = {
        id: backupId,
        timestamp: timestamp.toISOString(),
        sourcePath,
        fileCount: filesToBackup.length,
        originalSize: archiveSize,
        compressedSize: finalSize,
        compressionRatio: archiveSize > 0 ? (archiveSize - finalSize) / archiveSize : 0,
        compressed: options?.compress || this.config.storage.compress || false,
        encrypted: options?.encrypt || this.config.storage.encrypt || false,
        description: options?.description,
        strategy: this.config.strategy,
        version: '1.0.0',
      };

      // Save metadata
      const metadataPath = finalPath.replace(path.extname(finalPath), '.json');
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

      const duration = Date.now() - startTime;

      const result: BackupResult = {
        success: true,
        timestamp,
        filePath: finalPath,
        size: finalSize,
        duration,
        fileCount: filesToBackup.length,
        compressionRatio: metadata.compressionRatio,
      };

      this.logger.info(`Backup created successfully: ${finalPath} (${this.formatSize(finalSize)})`);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      const result: BackupResult = {
        success: false,
        timestamp: new Date(),
        filePath: '',
        size: 0,
        duration,
        fileCount: 0,
        errors: [error.message],
      };

      this.logger.error('Backup creation failed', error);
      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Restore from backup
   */
  async restoreBackup(
    backupPath: string,
    targetPath: string,
    options?: {
      overwrite?: boolean;
      excludePatterns?: string[];
      dryRun?: boolean;
    },
  ): Promise<BackupResult> {
    const startTime = Date.now();
    this.logger.info(`Restoring backup from: ${backupPath} to: ${targetPath}`);

    try {
      // Validate backup file exists
      if (!(await fs.pathExists(backupPath))) {
        throw new Error(`Backup file not found: ${backupPath}`);
      }

      // Load backup metadata
      const metadataPath = backupPath.replace(path.extname(backupPath), '.json');
      let metadata: any = {};

      if (await fs.pathExists(metadataPath)) {
        metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
        this.logger.info(`Restoring backup: ${metadata.id} from ${metadata.timestamp}`);
      }

      // Create target directory
      await fs.ensureDir(targetPath);

      let workingPath = backupPath;

      // Decrypt if needed
      if (metadata.encrypted) {
        this.logger.info('Decrypting backup...');
        workingPath = await this.decryptBackup(workingPath, this.config.storage.encryptionKey);
      }

      // Decompress if needed
      if (metadata.compressed || path.extname(workingPath) === '.gz') {
        this.logger.info('Decompressing backup...');
        workingPath = await this.decompressBackup(workingPath);
      }

      // Extract archive
      if (options?.dryRun) {
        this.logger.info('Dry run mode - would extract to:', targetPath);
      } else {
        await this.extractArchive(workingPath, targetPath, options);
      }

      // Clean up temporary files if created during decryption/decompression
      if (workingPath !== backupPath) {
        await fs.remove(workingPath);
      }

      const duration = Date.now() - startTime;
      const result: BackupResult = {
        success: true,
        timestamp: new Date(),
        filePath: targetPath,
        size: metadata.originalSize || 0,
        duration,
        fileCount: metadata.fileCount || 0,
      };

      this.logger.info(`Backup restored successfully in ${duration}ms`);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result: BackupResult = {
        success: false,
        timestamp: new Date(),
        filePath: targetPath,
        size: 0,
        duration,
        fileCount: 0,
        errors: [error.message],
      };

      this.logger.error('Backup restoration failed', error);
      return result;
    }
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<
    Array<{
      id: string;
      path: string;
      metadata: any;
      size: number;
      timestamp: Date;
    }>
  > {
    const backups = [];
    const files = await fs.readdir(this.backupPath);

    for (const file of files) {
      if (path.extname(file) === '.json') {
        try {
          const metadataPath = path.join(this.backupPath, file);
          const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));

          const backupFileName = file.replace('.json', '.zip');
          const backupFilePath = path.join(this.backupPath, backupFileName);

          if (await fs.pathExists(backupFilePath)) {
            const stats = await fs.stat(backupFilePath);

            backups.push({
              id: metadata.id,
              path: backupFilePath,
              metadata,
              size: stats.size,
              timestamp: new Date(metadata.timestamp),
            });
          }
        } catch (error) {
          this.logger.warn(`Failed to read backup metadata: ${file}`, error);
        }
      }
    }

    return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Delete a backup
   */
  async deleteBackup(backupId: string): Promise<void> {
    this.logger.info(`Deleting backup: ${backupId}`);

    const backups = await this.listBackups();
    const backup = backups.find((b) => b.id === backupId);

    if (!backup) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    // Delete backup file and metadata
    await fs.remove(backup.path);

    const metadataPath = backup.path.replace(path.extname(backup.path), '.json');
    if (await fs.pathExists(metadataPath)) {
      await fs.remove(metadataPath);
    }

    this.logger.info(`Backup deleted: ${backupId}`);
  }

  /**
   * Schedule automatic backups
   */
  async scheduleBackups(): Promise<void> {
    if (this.config.schedule.frequency === 'manual') {
      return;
    }

    const intervalMs = this.getScheduleInterval();
    const timerId = setInterval(async () => {
      try {
        this.logger.info('Running scheduled backup...');
        await this.createBackup(process.cwd(), {
          name: `scheduled-${Date.now()}`,
          description: `Scheduled backup (${this.config.schedule.frequency})`,
        });
      } catch (error) {
        this.logger.error('Scheduled backup failed', error);
      }
    }, intervalMs);

    this.scheduledBackups.set('default', timerId);
    this.logger.info(`Scheduled backups every ${this.config.schedule.frequency}`);
  }

  /**
   * Stop scheduled backups
   */
  stopScheduledBackups(): void {
    for (const [name, timerId] of this.scheduledBackups) {
      clearInterval(timerId);
      this.logger.info(`Stopped scheduled backup: ${name}`);
    }
    this.scheduledBackups.clear();
  }

  /**
   * Clean up old backups based on retention policy
   */
  async cleanupOldBackups(): Promise<void> {
    this.logger.info('Cleaning up old backups...');

    const backups = await this.listBackups();
    const now = new Date();

    // Group backups by type (daily, weekly, monthly)
    const daily = backups.filter((b) => this.isWithinDays(b.timestamp, now, 1));
    const weekly = backups.filter(
      (b) => this.isWithinDays(b.timestamp, now, 7) && !daily.includes(b),
    );
    const monthly = backups.filter(
      (b) => this.isWithinDays(b.timestamp, now, 30) && !daily.includes(b) && !weekly.includes(b),
    );
    const older = backups.filter(
      (b) => !daily.includes(b) && !weekly.includes(b) && !monthly.includes(b),
    );

    // Apply retention policy
    const toDelete = [
      ...daily.slice(this.config.retention.daily),
      ...weekly.slice(this.config.retention.weekly),
      ...monthly.slice(this.config.retention.monthly),
      ...older,
    ];

    for (const backup of toDelete) {
      try {
        await this.deleteBackup(backup.id);
      } catch (error) {
        this.logger.warn(`Failed to delete old backup: ${backup.id}`, error);
      }
    }

    if (toDelete.length > 0) {
      this.logger.info(`Cleaned up ${toDelete.length} old backups`);
    }
  }

  /**
   * Get backup statistics
   */
  async getBackupStats(): Promise<{
    totalBackups: number;
    totalSize: number;
    oldestBackup: Date | null;
    newestBackup: Date | null;
    averageSize: number;
    compressionStats: {
      compressed: number;
      uncompressed: number;
      averageRatio: number;
    };
  }> {
    const backups = await this.listBackups();

    if (backups.length === 0) {
      return {
        totalBackups: 0,
        totalSize: 0,
        oldestBackup: null,
        newestBackup: null,
        averageSize: 0,
        compressionStats: {
          compressed: 0,
          uncompressed: 0,
          averageRatio: 0,
        },
      };
    }

    const totalSize = backups.reduce((sum, b) => sum + b.size, 0);
    const compressedBackups = backups.filter((b) => b.metadata.compressed);
    const avgCompressionRatio =
      compressedBackups.length > 0
        ? compressedBackups.reduce((sum, b) => sum + (b.metadata.compressionRatio || 0), 0) /
          compressedBackups.length
        : 0;

    return {
      totalBackups: backups.length,
      totalSize,
      oldestBackup: backups[backups.length - 1].timestamp,
      newestBackup: backups[0].timestamp,
      averageSize: totalSize / backups.length,
      compressionStats: {
        compressed: compressedBackups.length,
        uncompressed: backups.length - compressedBackups.length,
        averageRatio: avgCompressionRatio,
      },
    };
  }

  /**
   * Private helper methods
   */
  private async collectFilesToBackup(
    sourcePath: string,
    options?: LocalBackupOptions,
  ): Promise<string[]> {
    const includePatterns = this.config.include.concat(options?.includePatterns || []);
    const excludePatterns = this.config.exclude.concat(options?.excludePatterns || []);

    // Add common exclusions
    if (!options?.includeNodeModules) {
      excludePatterns.push('**/node_modules/**');
    }
    if (!options?.includeLogs) {
      excludePatterns.push('**/logs/**', '**/*.log');
    }

    const files = await globby(includePatterns, {
      cwd: sourcePath,
      ignore: excludePatterns,
      dot: true,
      absolute: false,
    });

    return files;
  }

  private async createArchive(
    sourcePath: string,
    outputPath: string,
    files: string[],
    options?: LocalBackupOptions,
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 6 } });

      let totalSize = 0;

      output.on('close', () => {
        resolve(totalSize);
      });

      archive.on('error', reject);
      archive.on('progress', (progress) => {
        totalSize = progress.entries.processed;
      });

      archive.pipe(output);

      // Add files to archive
      for (const file of files) {
        const fullPath = path.join(sourcePath, file);
        archive.file(fullPath, { name: file });
      }

      archive.finalize();
    });
  }

  private async compressBackup(filePath: string): Promise<string> {
    const compressedPath = filePath + '.gz';
    const input = createReadStream(filePath);
    const output = createWriteStream(compressedPath);
    const gzip = createGzip();

    await pipeline(input, gzip, output);
    return compressedPath;
  }

  private async decompressBackup(filePath: string): Promise<string> {
    const decompressedPath = filePath.replace('.gz', '');
    const input = createReadStream(filePath);
    const output = createWriteStream(decompressedPath);
    const gunzip = createGunzip();

    await pipeline(input, gunzip, output);
    return decompressedPath;
  }

  private async encryptBackup(filePath: string, encryptionKey?: string): Promise<string> {
    if (!encryptionKey) {
      throw new Error('Encryption key is required for encrypted backups');
    }

    const encryptedPath = filePath + '.enc';
    const key = pbkdf2Sync(encryptionKey, 'salt', 100000, 32, 'sha512');
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', key, iv);

    const input = createReadStream(filePath);
    const output = createWriteStream(encryptedPath);

    // Write IV at the beginning of the encrypted file
    output.write(iv);

    await pipeline(input, cipher, output);
    return encryptedPath;
  }

  private async decryptBackup(filePath: string, encryptionKey?: string): Promise<string> {
    if (!encryptionKey) {
      throw new Error('Encryption key is required for encrypted backups');
    }

    const decryptedPath = filePath.replace('.enc', '');
    const key = pbkdf2Sync(encryptionKey, 'salt', 100000, 32, 'sha512');

    const input = createReadStream(filePath);
    const output = createWriteStream(decryptedPath);

    // Read IV from the beginning of the encrypted file
    const ivBuffer = Buffer.alloc(16);
    const fileHandle = await fsPromises.open(filePath, 'r');
    await fileHandle.read(ivBuffer, 0, 16, 0);
    await fileHandle.close();

    const cipher = createDecipheriv('aes-256-cbc', key, ivBuffer);

    // Skip the IV bytes when reading
    const encryptedStream = createReadStream(filePath, { start: 16 });

    await pipeline(encryptedStream, cipher, output);
    return decryptedPath;
  }

  private async extractArchive(
    archivePath: string,
    targetPath: string,
    options?: { overwrite?: boolean; excludePatterns?: string[] },
  ): Promise<void> {
    // Check if target exists and handle overwrite
    if ((await fs.pathExists(targetPath)) && !options?.overwrite) {
      const files = await fs.readdir(targetPath);
      if (files.length > 0) {
        throw new Error('Target directory is not empty. Use overwrite option to proceed.');
      }
    }

    await extract(archivePath, { dir: path.resolve(targetPath) });
  }

  private getScheduleInterval(): number {
    switch (this.config.schedule.frequency) {
      case 'hourly':
        return 60 * 60 * 1000; // 1 hour
      case 'daily':
        return 24 * 60 * 60 * 1000; // 1 day
      case 'weekly':
        return 7 * 24 * 60 * 60 * 1000; // 1 week
      default:
        return 24 * 60 * 60 * 1000; // Default to daily
    }
  }

  private isWithinDays(date: Date, referenceDate: Date, days: number): boolean {
    const diffTime = referenceDate.getTime() - date.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= days;
  }

  private formatSize(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  }

  private mergeWithDefaults(config: Partial<BackupConfig>): BackupConfig {
    return {
      strategy: config.strategy || 'incremental',
      schedule: {
        frequency: config.schedule?.frequency || 'daily',
        time: config.schedule?.time,
      },
      retention: {
        daily: config.retention?.daily || 7,
        weekly: config.retention?.weekly || 4,
        monthly: config.retention?.monthly || 12,
      },
      storage: {
        path: config.storage?.path || './backups',
        compress: config.storage?.compress !== false,
        encrypt: config.storage?.encrypt || false,
        encryptionKey: config.storage?.encryptionKey,
      },
      include: config.include || ['**/*'],
      exclude: config.exclude || [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/*.log',
        '**/logs/**',
        '**/.git/**',
        '**/coverage/**',
        '**/.nyc_output/**',
      ],
    };
  }

  /**
   * Cleanup and shutdown
   */
  async destroy(): Promise<void> {
    this.stopScheduledBackups();
    this.logger.info('Backup Manager destroyed');
  }
}

/**
 * Backup options interface (extending the base types)
 */
interface LocalBackupOptions {
  name?: string;
  description?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  includeNodeModules?: boolean;
  includeLogs?: boolean;
  compress?: boolean;
  encrypt?: boolean;
}
