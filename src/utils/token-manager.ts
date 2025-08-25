import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { logger } from './logger';

export class TokenManager {
  private static instance: TokenManager;
  private tokenCache: Map<string, string> = new Map();
  private readonly encryptionKey: string;
  private readonly configDir: string;

  private constructor() {
    this.encryptionKey = process.env.ENCRYPTION_KEY || this.generateKey();
    this.configDir = path.join(process.env.APPDATA || process.env.HOME || '.', '.forgeflow');
    this.ensureConfigDir();
  }

  public static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  private generateKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private ensureConfigDir(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(this.encryptionKey.slice(0, 32)),
      iv,
    );
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }

  private decrypt(text: string): string {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(this.encryptionKey.slice(0, 32)),
      iv,
    );
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  }

  public saveToken(token: string, owner: string): void {
    try {
      const encryptedToken = this.encrypt(token);
      const tokenFile = path.join(this.configDir, 'token.enc');

      const tokenData = {
        token: encryptedToken,
        owner,
        timestamp: new Date().toISOString(),
        expires: this.calculateExpiry(token),
      };

      fs.writeFileSync(tokenFile, JSON.stringify(tokenData, null, 2));
      this.tokenCache.set(owner, token);

      logger.info('[TokenManager] Token securely stored');
    } catch (error) {
      logger.error('[TokenManager] Failed to save token:', error);
      throw error;
    }
  }

  public getToken(owner?: string): string | null {
    try {
      // Check cache first
      if (owner && this.tokenCache.has(owner)) {
        return this.tokenCache.get(owner);
      }

      // Check environment variable
      if (process.env.GITHUB_TOKEN) {
        return process.env.GITHUB_TOKEN;
      }

      // Check encrypted storage
      const tokenFile = path.join(this.configDir, 'token.enc');
      if (fs.existsSync(tokenFile)) {
        const tokenData = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
        const decryptedToken = this.decrypt(tokenData.token);

        if (owner) {
          this.tokenCache.set(owner, decryptedToken);
        }

        return decryptedToken;
      }

      return null;
    } catch (error) {
      logger.error('[TokenManager] Failed to retrieve token:', error);
      return null;
    }
  }

  public validateToken(token: string): Promise<boolean> {
    return fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })
      .then((response) => response.ok)
      .catch(() => false);
  }

  private calculateExpiry(token: string): string {
    // GitHub tokens don't have built-in expiry, but we can set a recommended refresh date
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + 6); // Recommend refresh every 6 months
    return expiryDate.toISOString();
  }

  public clearToken(): void {
    const tokenFile = path.join(this.configDir, 'token.enc');
    if (fs.existsSync(tokenFile)) {
      fs.unlinkSync(tokenFile);
    }
    this.tokenCache.clear();
    logger.info('[TokenManager] Token cleared');
  }

  public rotateToken(oldToken: string, newToken: string, owner: string): boolean {
    try {
      // Validate old token
      if (this.getToken(owner) !== oldToken) {
        logger.error('[TokenManager] Old token does not match');
        return false;
      }

      // Save new token
      this.saveToken(newToken, owner);
      logger.info('[TokenManager] Token rotated successfully');
      return true;
    } catch (error) {
      logger.error('[TokenManager] Token rotation failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const tokenManager = TokenManager.getInstance();
