// packages/core/src/privacy/redactor.ts

/**
 * Result of redacting content
 */
export interface RedactionResult {
  /** The content with secrets replaced by redaction placeholders */
  redacted: string;
  /** List of redaction type names that were applied */
  redactions: string[];
}

/**
 * Pattern definition for detecting and redacting secrets
 */
interface RedactionPattern {
  /** Identifier for this pattern type */
  name: string;
  /** Regular expression to match secrets */
  pattern: RegExp;
  /** Replacement string (can use capture groups like $1) */
  replacement: string;
}

/**
 * Patterns for detecting various types of secrets.
 * Order matters - more specific patterns should come before generic ones.
 */
const PATTERNS: RedactionPattern[] = [
  // Private Keys (must come early to match multi-line content)
  {
    name: 'private_key',
    pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY]',
  },

  // JWT Tokens (three base64url-encoded segments separated by dots)
  {
    name: 'jwt',
    pattern: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
    replacement: '[REDACTED_JWT]',
  },

  // AWS Access Keys (always start with AKIA)
  {
    name: 'aws_key',
    pattern: /AKIA[A-Z0-9]{16}/g,
    replacement: '[REDACTED_AWS_KEY]',
  },

  // Connection Strings (database URLs)
  {
    name: 'connection_string',
    pattern: /(postgres|postgresql|mysql|mongodb|mongodb\+srv|redis|amqp|amqps):\/\/[^\s'"]+/gi,
    replacement: '[REDACTED_CONNECTION_STRING]',
  },

  // API Keys with common prefixes
  {
    name: 'api_key',
    pattern: /(['"]?)(sk-[a-zA-Z0-9]{20,})(['"]?)/g,
    replacement: '$1[REDACTED_API_KEY]$3',
  },
  {
    name: 'api_key',
    pattern: /(['"]?)(key-[a-zA-Z0-9]{20,})(['"]?)/g,
    replacement: '$1[REDACTED_API_KEY]$3',
  },

  // Environment variable assignments for sensitive keys
  // Uses negative lookahead to avoid matching connection strings (already handled above)
  {
    name: 'env_var',
    pattern: /(DATABASE_URL|DB_PASSWORD|SECRET_KEY|PRIVATE_KEY|AUTH_SECRET|JWT_SECRET|SESSION_SECRET)\s*=\s*['"]?(?!\[REDACTED)([^\s'"]+)['"]?/gi,
    replacement: '$1=[REDACTED]',
  },

  // Generic key/token assignments (api_key, secret_key, auth_token, etc.)
  {
    name: 'generic_key',
    pattern: /(api[_-]?key|apikey|secret[_-]?key|auth[_-]?token)\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{16,})['"]?/gi,
    replacement: '$1=[REDACTED]',
  },

  // Bearer Tokens in authorization headers
  {
    name: 'bearer_token',
    pattern: /(Bearer\s+)[a-zA-Z0-9_\-.]+/gi,
    replacement: '$1[REDACTED_TOKEN]',
  },
];

/**
 * Redactor class for detecting and removing secrets from content.
 *
 * Privacy is non-negotiable - redaction is always active and cannot be disabled.
 * This class detects various types of secrets including:
 * - API keys (sk-*, key-*, generic patterns)
 * - AWS access keys
 * - Database connection strings
 * - JWT tokens
 * - Private keys (RSA, EC, DSA, OpenSSH)
 * - Bearer tokens
 * - Environment variable assignments
 */
export class Redactor {
  /**
   * Redact secrets from the given content.
   *
   * @param content - The content to scan and redact
   * @returns Object containing the redacted content and list of redaction types applied
   */
  redact(content: string): RedactionResult {
    let redacted = content;
    const redactionSet = new Set<string>();

    for (const { name, pattern, replacement } of PATTERNS) {
      // Reset regex lastIndex for global patterns
      pattern.lastIndex = 0;

      // Check if pattern matches before replacing
      if (pattern.test(redacted)) {
        redactionSet.add(name);
        // Reset lastIndex again after test()
        pattern.lastIndex = 0;
        redacted = redacted.replace(pattern, replacement);
      }
    }

    return {
      redacted,
      redactions: Array.from(redactionSet),
    };
  }

  /**
   * Check if content contains potential secrets without modifying it.
   *
   * @param content - The content to scan
   * @returns True if any secret patterns are detected
   */
  containsSecrets(content: string): boolean {
    for (const { pattern } of PATTERNS) {
      // Reset regex lastIndex for global patterns
      pattern.lastIndex = 0;

      if (pattern.test(content)) {
        return true;
      }
    }
    return false;
  }
}
