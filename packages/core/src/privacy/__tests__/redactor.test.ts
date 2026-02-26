// packages/core/src/privacy/__tests__/redactor.test.ts
import { describe, it, expect } from 'vitest';
import { Redactor } from '../redactor';

describe('Redactor', () => {
  const redactor = new Redactor();

  describe('API keys', () => {
    it('should redact sk-* API keys', () => {
      const input = `const API_KEY = "sk-abc123xyz456def789ghi012jkl345";`;
      const { redacted, redactions } = redactor.redact(input);
      expect(redacted).toContain('[REDACTED_API_KEY]');
      expect(redacted).not.toContain('sk-abc123xyz');
      expect(redactions).toContain('api_key');
    });

    it('should redact key-* API keys', () => {
      const input = `const myKey = "key-abc123xyz456def789ghi012jkl345";`;
      const { redacted, redactions } = redactor.redact(input);
      expect(redacted).toContain('[REDACTED_API_KEY]');
      expect(redacted).not.toContain('key-abc123xyz');
      expect(redactions).toContain('api_key');
    });

    it('should redact generic api_key assignments', () => {
      const input = `api_key: "someVeryLongSecretValue123456"`;
      const { redacted, redactions } = redactor.redact(input);
      expect(redacted).toContain('[REDACTED]');
      expect(redacted).not.toContain('someVeryLongSecretValue');
      expect(redactions).toContain('generic_key');
    });

    it('should redact auth_token assignments', () => {
      const input = `auth_token = "abcdefghij1234567890"`;
      const { redacted, redactions } = redactor.redact(input);
      expect(redacted).toContain('[REDACTED]');
      expect(redactions).toContain('generic_key');
    });
  });

  describe('AWS keys', () => {
    it('should redact AWS access keys', () => {
      const input = `aws_key = "AKIAIOSFODNN7EXAMPLE"`;
      const { redacted, redactions } = redactor.redact(input);
      expect(redacted).toContain('[REDACTED_AWS_KEY]');
      expect(redacted).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(redactions).toContain('aws_key');
    });

    it('should redact AWS keys in JSON', () => {
      const input = `{ "accessKeyId": "AKIAIOSFODNN7EXAMPLE" }`;
      const { redacted } = redactor.redact(input);
      expect(redacted).toContain('[REDACTED_AWS_KEY]');
    });
  });

  describe('Connection strings', () => {
    it('should redact PostgreSQL connection strings', () => {
      const input = `DATABASE_URL=postgres://user:pass@localhost:5432/db`;
      const { redacted, redactions } = redactor.redact(input);
      expect(redacted).toContain('[REDACTED_CONNECTION_STRING]');
      expect(redacted).not.toContain('user:pass');
      expect(redactions).toContain('connection_string');
    });

    it('should redact MySQL connection strings', () => {
      const input = `const url = "mysql://root:password@db.example.com:3306/mydb"`;
      const { redacted } = redactor.redact(input);
      expect(redacted).toContain('[REDACTED_CONNECTION_STRING]');
      expect(redacted).not.toContain('root:password');
    });

    it('should redact MongoDB connection strings', () => {
      const input = `MONGO_URI=mongodb://user:secret@cluster.mongodb.net/database`;
      const { redacted } = redactor.redact(input);
      expect(redacted).toContain('[REDACTED_CONNECTION_STRING]');
    });

    it('should redact Redis connection strings', () => {
      const input = `REDIS_URL=redis://default:authToken@redis-12345.cache.amazonaws.com:6379`;
      const { redacted } = redactor.redact(input);
      expect(redacted).toContain('[REDACTED_CONNECTION_STRING]');
    });
  });

  describe('Environment variables', () => {
    it('should redact DATABASE_URL assignments', () => {
      const input = `DATABASE_URL = "some-secret-value"`;
      const { redacted, redactions } = redactor.redact(input);
      expect(redacted).toContain('[REDACTED]');
      expect(redactions).toContain('env_var');
    });

    it('should redact SECRET_KEY assignments', () => {
      const input = `SECRET_KEY=myverysecretkey123`;
      const { redacted } = redactor.redact(input);
      expect(redacted).toContain('[REDACTED]');
      expect(redacted).not.toContain('myverysecretkey123');
    });

    it('should redact JWT_SECRET assignments', () => {
      const input = `JWT_SECRET="supersecret"`;
      const { redacted } = redactor.redact(input);
      expect(redacted).toBe(`JWT_SECRET=[REDACTED]`);
    });
  });

  describe('JWT tokens', () => {
    it('should redact JWT tokens', () => {
      const input = `token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"`;
      const { redacted, redactions } = redactor.redact(input);
      expect(redacted).toContain('[REDACTED_JWT]');
      expect(redacted).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(redactions).toContain('jwt');
    });

    it('should redact JWT tokens in headers', () => {
      const input = `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjM0NSJ9.abcdefghijk`;
      const { redacted } = redactor.redact(input);
      expect(redacted).toContain('[REDACTED');
    });
  });

  describe('Private keys', () => {
    it('should redact RSA private keys', () => {
      const input = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy
base64encodedkeydata
-----END RSA PRIVATE KEY-----`;
      const { redacted, redactions } = redactor.redact(input);
      expect(redacted).toContain('[REDACTED_PRIVATE_KEY]');
      expect(redacted).not.toContain('MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn');
      expect(redactions).toContain('private_key');
    });

    it('should redact generic private keys', () => {
      const input = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAAOCAQ8A
-----END PRIVATE KEY-----`;
      const { redacted } = redactor.redact(input);
      expect(redacted).toContain('[REDACTED_PRIVATE_KEY]');
    });

    it('should redact EC private keys', () => {
      const input = `-----BEGIN EC PRIVATE KEY-----
MHQCAQEEIDm1LM2M87hPg+bsyLp8y
-----END EC PRIVATE KEY-----`;
      const { redacted } = redactor.redact(input);
      expect(redacted).toContain('[REDACTED_PRIVATE_KEY]');
    });
  });

  describe('Bearer tokens', () => {
    it('should redact Bearer tokens', () => {
      const input = `headers: { Authorization: "Bearer ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }`;
      const { redacted, redactions } = redactor.redact(input);
      expect(redacted).toContain('[REDACTED_TOKEN]');
      expect(redacted).not.toContain('ghp_');
      expect(redactions).toContain('bearer_token');
    });
  });

  describe('Normal code preservation', () => {
    it('should not redact normal code', () => {
      const input = `function hello() { return "world"; }`;
      const { redacted, redactions } = redactor.redact(input);
      expect(redacted).toBe(input);
      expect(redactions).toHaveLength(0);
    });

    it('should not redact short strings', () => {
      const input = `const name = "John";`;
      const { redacted, redactions } = redactor.redact(input);
      expect(redacted).toBe(input);
      expect(redactions).toHaveLength(0);
    });

    it('should preserve code structure while redacting secrets', () => {
      const input = `const config = {
  apiKey: "sk-1234567890abcdefghijklmnop",
  name: "myapp"
};`;
      const { redacted } = redactor.redact(input);
      expect(redacted).toContain('const config');
      expect(redacted).toContain('name: "myapp"');
      expect(redacted).not.toContain('sk-1234567890');
    });
  });

  describe('Multiple secrets', () => {
    it('should redact multiple different secret types', () => {
      const input = `
const config = {
  awsKey: "AKIAIOSFODNN7EXAMPLE",
  dbUrl: "postgres://user:pass@localhost/db",
  jwt: "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MX0.abc123"
};`;
      const { redacted, redactions } = redactor.redact(input);
      expect(redacted).toContain('[REDACTED_AWS_KEY]');
      expect(redacted).toContain('[REDACTED_CONNECTION_STRING]');
      expect(redacted).toContain('[REDACTED_JWT]');
      expect(redactions.length).toBeGreaterThanOrEqual(3);
    });

    it('should track unique redaction types only', () => {
      const input = `
API_KEY = "sk-first1234567890abcdefghij"
OTHER_KEY = "sk-second1234567890abcdefgh"
`;
      const { redactions } = redactor.redact(input);
      // Should only have one 'api_key' entry even with two matches
      const apiKeyCount = redactions.filter(r => r === 'api_key').length;
      expect(apiKeyCount).toBe(1);
    });
  });
});
