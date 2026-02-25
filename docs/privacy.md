# Repo Tutor — Privacy & Security

## Principles

1. **Your code, your control**: You decide what leaves your machine
2. **Transparency**: See exactly what's sent before it's sent
3. **Defense in depth**: Multiple layers of protection
4. **No backend**: Data goes directly to your LLM provider

## What Gets Sent vs. Stays Local

| Data | Sent to LLM | Stays Local |
|------|-------------|-------------|
| Full repository | ❌ Never | ✅ Always |
| AST/parse results | ❌ Never | ✅ Always |
| Dependency graph | ❌ Never | ✅ Always |
| File list/structure | ✅ Summary only | ✅ Always |
| Code in EvidencePack | ✅ Curated subset | ✅ Always |
| User's API key | ✅ To your provider | ✅ Stored securely |
| User preferences | ✅ Language, skill | ✅ Always |
| Quiz answers | ✅ For evaluation | ✅ Always |
| Session progress | ❌ Never | ✅ Always |

## Upfront Security Configuration

When you first start learning a repository, you'll see a security wizard:

### Step 1: Review Detected Sensitive Content

Repo Tutor scans for potentially sensitive files:

- `.env`, `.env.*` — Environment files
- `secrets/`, `credentials/` — Secret directories
- `*.pem`, `*.key` — Private keys
- Config files that appear to contain secrets

You can add custom patterns to never send.

### Step 2: Choose a Security Preset

| Preset | Description |
|--------|-------------|
| **Standard** | Send code for learning, auto-redact secrets. Best learning experience. |
| **Cautious** | Confirm before each LLM request. Review what's sent every time. |
| **Strict** | Only send file/folder names, never code. Limited learning depth. |
| **Custom** | Configure all settings manually. |

### Step 3: Review and Confirm

See a summary of:
- Total files in repository
- Files that will be analyzed
- Files that will be skipped
- Files that will never be sent

## Automatic Secret Redaction

Even if a file is sent, secrets are automatically redacted:

### What Gets Redacted

| Pattern | Example | Redacted To |
|---------|---------|-------------|
| Environment variables | `API_KEY=sk-abc123` | `API_KEY=[REDACTED]` |
| API keys | `"sk-proj-abc..."` | `"[REDACTED_API_KEY]"` |
| AWS credentials | `AKIAIOSFODNN7EXAMPLE` | `[REDACTED_AWS_KEY]` |
| Private keys | `-----BEGIN PRIVATE KEY-----` | `[REDACTED_PRIVATE_KEY]` |
| JWT tokens | `eyJhbGciOiJIUzI1NiIs...` | `[REDACTED_JWT]` |
| Connection strings | `postgres://user:pass@...` | `postgres://[REDACTED_CONNECTION_STRING]` |

**This cannot be disabled.** Secret redaction is always active.

## Default Ignore Patterns

These are always skipped (not analyzed, never sent):

```
# Secrets
.env, .env.*, *.pem, *.key, *.p12, *.pfx
secrets/, credentials/, .secrets/

# Dependencies
node_modules/, vendor/, venv/, .venv/, __pycache__/

# Build outputs
dist/, build/, out/, .next/, .nuxt/

# Large files
*.min.js, *.min.css, *.bundle.js, *.map

# Lock files
package-lock.json, yarn.lock, pnpm-lock.yaml, poetry.lock

# IDE/system
.git/, .idea/, .vscode/, .DS_Store
```

## Custom Ignore Patterns

Add patterns to `.repo-tutor-ignore` (gitignore syntax):

```gitignore
# Company-specific
internal/
proprietary/

# Sensitive configs
config/production.json
```

Or configure via VS Code settings.

## Transparency Log

Every LLM request is logged to the "Repo Tutor" output channel:

```
[2024-01-15 10:23:45] Chapter Generation
Provider: anthropic (claude-sonnet-4-20250514)
Estimated tokens: ~8,500
Files included:
  - src/routes/auth.ts (142 lines)
  - src/middleware/auth.ts (67 lines)
  - src/services/UserService.ts (89 lines, truncated)
Redactions applied:
  - env-assignment: 2 occurrence(s)
  - jwt: 1 occurrence(s)
```

View via: **Command Palette → "Repo Tutor: Show Data Log"**

## Confirmation Mode

For maximum control, enable "Confirm before each LLM request":

```
┌─────────────────────────────────────────────────────────────┐
│  Repo Tutor: Confirm Data Send                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  About to send data to: anthropic (claude-sonnet-4-20250514)│
│                                                             │
│  Files included:                                            │
│  ├── src/routes/auth.ts (142 lines)                         │
│  ├── src/middleware/auth.ts (67 lines)                      │
│  └── src/services/UserService.ts (89 lines)                 │
│                                                             │
│  Estimated tokens: ~8,500                                   │
│  Redactions applied: 3                                      │
│                                                             │
│  [View Full Prompt]  [Always Allow]  [Cancel]  [Send]       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Strict Mode

For maximum privacy at the cost of learning depth:

- Only file and folder names are sent
- No actual code content
- LLM can only explain based on structure
- Useful for highly sensitive codebases

## Settings Reference

| Setting | Default | Description |
|---------|---------|-------------|
| `repo-tutor.privacy.showDataLog` | `true` | Show LLM requests in output panel |
| `repo-tutor.privacy.verboseLog` | `false` | Include full prompts in log |
| `repo-tutor.privacy.confirmBeforeSend` | `false` | Ask before each LLM request |
| `repo-tutor.privacy.maxCodeContext` | `25000` | Max characters of code per request |
| `repo-tutor.privacy.additionalIgnorePatterns` | `[]` | Additional patterns to never send |
| `repo-tutor.privacy.strictMode` | `false` | Only send structure, never code |

## Third-Party Providers

Repo Tutor sends data to your configured LLM provider:

- **OpenAI**: [Privacy Policy](https://openai.com/policies/privacy-policy)
- **Anthropic**: [Privacy Policy](https://www.anthropic.com/privacy)

We recommend reviewing your provider's data handling policies.

## Local Storage

Repo Tutor stores data locally:

| Data | Location | Encrypted |
|------|----------|-----------|
| API keys | VS Code SecretStorage | ✅ Yes |
| Security config | `.vscode/repo-tutor.json` | ❌ No (gitignored) |
| Session progress | VS Code globalState | ❌ No |
| Analysis cache | VS Code globalState | ❌ No |

## FAQ

**Q: Can I use Repo Tutor on proprietary code?**
A: Yes, with appropriate security settings. Use Cautious or Strict mode, review the transparency log, and add sensitive paths to ignore patterns.

**Q: Does Repo Tutor have a backend?**
A: No. All data goes directly from your VS Code to your LLM provider using your API key.

**Q: Can I see exactly what's being sent?**
A: Yes. Enable `verboseLog` in settings, or use Confirmation Mode to review each request.

**Q: What if I accidentally send a secret?**
A: Automatic redaction should catch most secrets. However, you should rotate any credentials you believe may have been exposed.

**Q: Can my employer use this safely?**
A: Consult your security team. We recommend Strict mode for highly sensitive codebases, and always review your LLM provider's enterprise data handling policies.
