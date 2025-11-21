/**
 * Credential manager with fallback support
 *
 * Tries keytar (OS keychain) first, falls back to file-based storage
 * if keytar is not available (e.g., missing libsecret on Linux)
 */

import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

const SERVICE_NAME = "cc-sync";
const ACCOUNT_NAME = "api_key";
const CREDENTIALS_DIR = path.join(os.homedir(), ".cc-sync");
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, "credentials.json");

// Try to load keytar, but don't fail if it's not available
let keytar: typeof import("keytar") | null = null;
let keytarError: string | null = null;

try {
  keytar = require("keytar");
} catch (error) {
  keytarError = error instanceof Error ? error.message : String(error);
}

/**
 * Check if we're using the secure keychain or file fallback
 */
export function isUsingSecureStorage(): boolean {
  return keytar !== null;
}

/**
 * Get the reason why secure storage isn't available
 */
export function getStorageWarning(): string | null {
  if (keytar !== null) return null;

  if (keytarError?.includes("libsecret")) {
    return "Using file-based credential storage (install libsecret for keychain support)";
  }
  return "Using file-based credential storage";
}

/**
 * Ensure credentials directory exists with proper permissions
 */
function ensureCredentialsDir(): void {
  if (!fs.existsSync(CREDENTIALS_DIR)) {
    fs.mkdirSync(CREDENTIALS_DIR, { mode: 0o700, recursive: true });
  }
}

/**
 * Simple obfuscation for file-based storage
 * Note: This is NOT cryptographically secure, just basic obfuscation
 * For real security, use the OS keychain (keytar)
 */
function obfuscate(data: string): string {
  const key = crypto.createHash("sha256").update(os.hostname() + os.userInfo().username).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(data, "utf8", "base64");
  encrypted += cipher.final("base64");
  return iv.toString("base64") + ":" + encrypted;
}

function deobfuscate(data: string): string {
  const [ivBase64, encrypted] = data.split(":");
  if (!ivBase64 || !encrypted) return "";
  const key = crypto.createHash("sha256").update(os.hostname() + os.userInfo().username).digest();
  const iv = Buffer.from(ivBase64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Get credential from storage
 */
export async function getCredential(): Promise<string | null> {
  // Try keytar first
  if (keytar) {
    try {
      const password = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
      if (password) return password;
    } catch (error) {
      // Keytar failed, fall through to file-based
    }
  }

  // Fall back to file-based storage
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      const content = fs.readFileSync(CREDENTIALS_FILE, "utf8");
      const data = JSON.parse(content);
      if (data.apiKey) {
        return deobfuscate(data.apiKey);
      }
    }
  } catch (error) {
    // File read failed
  }

  return null;
}

/**
 * Set credential in storage
 */
export async function setCredential(value: string): Promise<void> {
  // Try keytar first
  if (keytar) {
    try {
      await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, value);
      return;
    } catch (error) {
      // Keytar failed, fall through to file-based
    }
  }

  // Fall back to file-based storage
  ensureCredentialsDir();
  const data = { apiKey: obfuscate(value), updatedAt: new Date().toISOString() };
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

/**
 * Delete credential from storage
 */
export async function deleteCredential(): Promise<void> {
  // Try keytar first
  if (keytar) {
    try {
      await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
    } catch (error) {
      // Ignore errors
    }
  }

  // Also delete file-based storage
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      fs.unlinkSync(CREDENTIALS_FILE);
    }
  } catch (error) {
    // Ignore errors
  }
}
