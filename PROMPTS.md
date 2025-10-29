# PROMPTS.md – AI Prompts Used

This file documents prompts used during development of `cf_ai_code_reviewer`, per Cloudflare's assignment guidelines.

---

## How AI was used

- **Boilerplate generation:** TypeScript types, zod schemas
- **Debugging:** Streaming response parsing, type errors
- **Documentation:** README structure

Most architecture decisions, business logic, and integration work done manually.

---

## Prompts used during development

### 1) Workers AI streaming setup

**Model:** Claude 3.5 Sonnet

```
Show how to use streamText from 'ai' SDK with Workers AI Llama 3.3 model.
Return streaming response in format: 0:{"type":"text-delta","textDelta":"chunk"}
```

---

### 2) Type error fix

**Model:** Claude 3.5 Sonnet

```
Type error with CoreMessage vs ToolModelMessage in streamText.
Show how to execute tools server-side before calling the model.
```

---

### 3) Vectorize local dev issue

**Model:** Claude 3.5 Sonnet

```
Vectorize throws "needs to be run remotely" in local dev.
Add guard to return friendly message when binding unavailable.
```

---

### 4) React streaming parser

**Model:** Claude 3.5 Sonnet

```
Parse SSE stream format: 0:{"type":"text-delta","textDelta":"chunk"}
Update React state incrementally without duplicating messages.
```

---

### 5) GitHub webhook HMAC

**Model:** Claude 3.5 Sonnet

```
Verify X-Hub-Signature-256 for GitHub webhooks using Web Crypto API.
```

---

### 6) README structure

**Model:** Claude 3.5 Sonnet

```
Generate README sections: Quick Start, API endpoints, deployment steps.
Include wrangler.toml example and vectorize setup command.
```

---

## Models used

- **In product:** `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (Workers AI)
- **Embeddings:** `@cf/baai/bge-small-en-v1.5` (Workers AI)  
- **Dev assistance:** Claude 3.5 Sonnet (Anthropic)

---
