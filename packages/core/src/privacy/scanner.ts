// packages/core/src/privacy/scanner.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { Redactor } from './redactor';

/**
 * Result of scanning a file for secrets
 */
export interface ScanResult {
  /** Path to the scanned file */
  file: string;
  /** Whether any secrets were detected */
  hasSecrets: boolean;
  /** Types of redactions that would be applied */
  redactionTypes: string[];
}

/**
 * Scanner class for detecting secrets in files and directories.
 *
 * Uses the Redactor class to detect potential secrets and report
 * which files contain sensitive information that would be redacted.
 */
export class Scanner {
  private redactor: Redactor;

  constructor() {
    this.redactor = new Redactor();
  }

  /**
   * Scan a single file for secrets.
   *
   * @param filePath - Path to the file to scan
   * @returns Scan result indicating if secrets were found and their types
   */
  async scanFile(filePath: string): Promise<ScanResult> {
    const content = await fs.readFile(filePath, 'utf-8');
    const { redactions } = this.redactor.redact(content);

    return {
      file: filePath,
      hasSecrets: redactions.length > 0,
      redactionTypes: redactions,
    };
  }

  /**
   * Scan a directory recursively for files containing secrets.
   *
   * @param dirPath - Path to the directory to scan
   * @param extensions - File extensions to scan (default: .ts, .js, .env, .json)
   * @returns Array of scan results for files that contain secrets
   */
  async scanDirectory(
    dirPath: string,
    extensions: string[] = ['.ts', '.js', '.env', '.json']
  ): Promise<ScanResult[]> {
    const results: ScanResult[] = [];

    await this.scanDirectoryRecursive(dirPath, extensions, results);

    return results;
  }

  /**
   * Internal recursive directory scanner.
   */
  private async scanDirectoryRecursive(
    dirPath: string,
    extensions: string[],
    results: ScanResult[]
  ): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      // Directory not readable, skip
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // Skip hidden directories and node_modules
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await this.scanDirectoryRecursive(fullPath, extensions, results);
        }
      } else if (entry.isFile()) {
        // Check if file matches any of the extensions
        const matchesExtension = extensions.some((ext) => entry.name.endsWith(ext));
        if (matchesExtension) {
          try {
            const result = await this.scanFile(fullPath);
            if (result.hasSecrets) {
              results.push(result);
            }
          } catch {
            // File not readable, skip
          }
        }
      }
    }
  }
}
