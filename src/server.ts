// ============================================================================
// File: src/server.ts
// WHY: Adds memory/state (DO + Vectorize), explicit workflow, GitHub PR webhook
// ============================================================================
import { streamText, type CoreMessage } from "ai";
import type { LanguageModel } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { tools as allTools, executions } from "./tools";

// Re-export DO so Cloudflare binds it
export { ReviewSessionDO } from "./review_session";

// Minimal local typing for Vectorize binding
type VectorizeIndex = {
  upsert: (items: Array<{ id: string; values: number[]; metadata?: Record<string, any> }>) => Promise<any>;
  query: (args: { vector: number[]; topK: number; filter?: Record<string, any> }) => Promise<any>;
};

export interface Env {
  AI: any;
  REVIEW_SESSIONS?: DurableObjectNamespace; // guarded: won't crash if missing in dev
  VECTORIZE?: VectorizeIndex;
  GITHUB_TOKEN?: string;
  GITHUB_WEBHOOK_SECRET?: string;
}

type AllowedRole = "system" | "user" | "assistant" | "tool";

function sanitizeMessages(input: any): CoreMessage[] {
  if (!Array.isArray(input)) return [];
  return input.map((m) => {
    const role: AllowedRole =
      m?.role === "system" || m?.role === "user" || m?.role === "assistant" || m?.role === "tool"
        ? m.role
        : "user";
    const content = typeof m?.content === "string" ? m.content : JSON.stringify(m?.content ?? "");
    return { role, content } as CoreMessage;
  });
}

// Prefer fenced code; else raw body
function extractCode(s: string): string {
  if (!s) return "";
  const fence = /```[a-zA-Z0-9_-]*\n([\s\S]*?)```/m.exec(s);
  if (fence?.[1]) return fence[1].trim();
  return s.trim();
}

// Session cookie (binds memory to stable id)
function getOrSetSessionId(request: Request): { sessionId: string; headers: HeadersInit } {
  const cookie = request.headers.get("Cookie") || "";
  const m = /sessionId=([A-Za-z0-9_-]+)/.exec(cookie);
  const sessionId = m?.[1] ?? crypto.randomUUID();
  const headers: HeadersInit = m ? {} : { "Set-Cookie": `sessionId=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000` };
  return { sessionId, headers };
}

// Workers AI embeddings → Vectorize
async function embedText(env: Env, text: string): Promise<number[]> {
  // IMPORTANT: embeddings in Workers AI are obtained via the AI binding:
  // await env.AI.run("<embedding-model>", { text: "<input>" })
  // Returns shape like: { data: [{ embedding: number[] }] }
  try {
    const res: any = await (env as any).AI.run("@cf/baai/bge-small-en-v1.5", { text });
    const vec =
      res?.data?.[0]?.embedding ??
      res?.embedding ??                 // fallback if CF changes shape
      (Array.isArray(res?.embeddings) ? res.embeddings[0] : undefined) ??
      [];
    if (!Array.isArray(vec) || vec.length === 0) {
      console.warn("Embeddings empty from Workers AI response:", res);
      return [];
    }
    return vec;
  } catch (err) {
    console.error("Embedding error:", err);
    return [];
  }
}

async function saveToDO(env: Env, sessionId: string, payload: { language: string; summary: string; snippet: string }) {
  if (!env.REVIEW_SESSIONS) {
    console.warn("REVIEW_SESSIONS binding missing. Skipping DO persistence.");
    return {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      language: payload.language,
      summary: payload.summary,
      snippet: payload.snippet.slice(0, 200),
    };
  }
  const id = env.REVIEW_SESSIONS.idFromName(sessionId);
  const stub = env.REVIEW_SESSIONS.get(id);
  const review = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    language: payload.language,
    summary: payload.summary,
    snippet: payload.snippet.slice(0, 200),
  };
  await stub.fetch("https://do/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(review),
  });
  return review;
}

async function upsertVector(env: Env, sessionId: string, reviewId: string, text: string) {
  if (!env.VECTORIZE) {
    console.warn("VECTORIZE binding missing. Skipping semantic upsert.");
    return;
  }
  const vector = await embedText(env, text);
  await env.VECTORIZE.upsert([{ id: `${sessionId}:${reviewId}`, values: vector, metadata: { sessionId, kind: "review" } }]);
}

function summarizeForMemory(bugs: any, sec: any, perf: any, style: any): { language: string; summary: string } {
  const language = bugs?.language || sec?.language || perf?.language || style?.language || "unknown";
  const summary = `Bugs:${bugs?.issuesFound ?? 0} Sec:${sec?.vulnerabilitiesFound ?? 0}(${sec?.severity}) Perf:${perf?.suggestionsCount ?? 0} Style:${style?.issuesFound ?? 0}`;
  return { language, summary };
}

// Deterministic multi-step workflow
async function runPipeline(code: string, tools: Record<string, any>) {
  const { analyzeBugs, checkSecurity, suggestPerformance, checkStyle } = tools;
  const [bugs, sec, perf, style] = await Promise.all([
    analyzeBugs.execute({ code }),
    checkSecurity.execute({ code }),
    suggestPerformance.execute({ code }),
    checkStyle.execute({ code }),
  ]);
  return { bugs, sec, perf, style };
}

// LLM formatting messages
function buildFormatMessages(history: CoreMessage[], language: string, results: { bugs: any; sec: any; perf: any; style: any }): CoreMessage[] {
  const system =
    `You are an expert code review assistant. Format a clear human report from provided tool results.\n` +
    `Do NOT show JSON or describe tool calls. Keep the exact section titles and order.`;
  const user =
`Here are the tool results for the user's code.
- Bug Analysis: ${JSON.stringify(results.bugs)}
- Security Check: ${JSON.stringify(results.sec)}
- Performance Review: ${JSON.stringify(results.perf)}
- Style Check: ${JSON.stringify(results.style)}

Now produce exactly this structure:

## 🔍 Code Review Results

**Language Detected:** ${language}

### 🐛 Bug Analysis
- List issues from "issues" (or a positive message).

### 🔒 Security Check
- List items from "vulnerabilities" and state overall severity.

### ⚡ Performance Review
- List "suggestions".

### 📝 Style & Best Practices
- List "issues".

### 📊 Summary
- Prioritized, actionable next steps across bugs, security, performance, style.`;
  return [{ role: "system", content: system }, ...history.slice(0, -1), { role: "user", content: user }];
}

// GitHub webhook HMAC verify (sha256)
async function verifyGithubSignature(request: Request, secret: string): Promise<boolean> {
  const sig = request.headers.get("X-Hub-Signature-256") || "";
  const body = await request.clone().arrayBuffer();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, body);
  const macHex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const expected = `sha256=${macHex}`;
  if (sig.length !== expected.length) return false;
  let valid = 0;
  for (let i = 0; i < sig.length; i++) valid |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return valid === 0;
}

// Fetch PR changed files (diffs preferred)
async function fetchPrCode(env: Env, fullName: string, prNumber: number): Promise<string> {
  const filesResp = await fetch(`https://api.github.com/repos/${fullName}/pulls/${prNumber}/files`, {
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "cf-ai-code-reviewer" },
  });
  if (!filesResp.ok) throw new Error(`GitHub files API failed: ${filesResp.status}`);
  const files = (await filesResp.json()) as Array<{ filename: string; patch?: string; raw_url?: string }>;
  let combined = "";
  for (const f of files) {
    combined += `\n// ===== File: ${f.filename} =====\n`;
    if (f.patch) {
      combined += f.patch;
    } else if (f.raw_url) {
      const raw = await fetch(f.raw_url, { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, "User-Agent": "cf-ai-code-reviewer" } });
      if (raw.ok && Number(raw.headers.get("content-length") || "0") < 100_000) combined += await raw.text();
      else combined += `// (file omitted)`;
    }
    combined += "\n";
  }
  return combined.trim();
}

// Post PR comment
async function postPrComment(env: Env, fullName: string, prNumber: number, body: string) {
  const url = `https://api.github.com/repos/${fullName}/issues/${prNumber}/comments`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "cf-ai-code-reviewer",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body }),
  });
  if (!resp.ok) throw new Error(`Failed to post PR comment: ${resp.status}`);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { sessionId, headers: sidHeaders } = getOrSetSessionId(request);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Hub-Signature-256, X-GitHub-Event",
      ...sidHeaders,
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    // ---- Manual exec for confirm-required tools (unchanged) ----
    if (url.pathname === "/api/tool-exec" && request.method === "POST") {
      try {
        const body = (await request.json()) as { toolName?: string; toolArgs?: any };
        const exec = executions[body?.toolName as keyof typeof executions];
        if (!exec) return Response.json({ error: `Unknown executable tool: ${body?.toolName}` }, { status: 400, headers: corsHeaders });
        const result = await exec(body?.toolArgs ?? {});
        return Response.json({ result }, { headers: corsHeaders });
      } catch {
        return Response.json({ error: "Failed to execute tool" }, { status: 500, headers: corsHeaders });
      }
    }

    // ---- Session history (DO) ----
    if (url.pathname === "/api/history" && request.method === "GET") {
      if (!env.REVIEW_SESSIONS) return Response.json({ items: [], note: "REVIEW_SESSIONS not bound" }, { headers: corsHeaders });
      const id = env.REVIEW_SESSIONS.idFromName(sessionId);
      const stub = env.REVIEW_SESSIONS.get(id);
      const r = await stub.fetch("https://do/list");
      return new Response(r.body, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- Semantic search (Vectorize) ----
    if (url.pathname === "/api/search" && request.method === "GET") {
      if (!env.VECTORIZE) return Response.json({ results: [], note: "VECTORIZE not bound" }, { headers: corsHeaders });
      const q = url.searchParams.get("q") || "";
      const vector = await embedText(env, q);
      const results = await env.VECTORIZE.query({ vector, topK: 5, filter: { sessionId } });
      return Response.json({ results }, { headers: corsHeaders });
    }

    // ---- GitHub webhook (PR review) ----
    if (url.pathname === "/api/webhook/github" && request.method === "POST") {
      try {
        if (!env.GITHUB_WEBHOOK_SECRET) return new Response("Webhook secret not configured", { status: 500, headers: corsHeaders });
        if (!(await verifyGithubSignature(request, env.GITHUB_WEBHOOK_SECRET))) return new Response("Invalid signature", { status: 401, headers: corsHeaders });

        const event = request.headers.get("X-GitHub-Event") || "";
        const payload = (await request.json()) as any;
        if (event !== "pull_request") return Response.json({ ignored: true, reason: "not a pull_request event" }, { headers: corsHeaders });
        const action = payload?.action;
        if (!["opened", "synchronize", "reopened"].includes(action)) return Response.json({ ignored: true, reason: `action=${action}` }, { headers: corsHeaders });

        const fullName = payload?.repository?.full_name as string;
        const prNumber = Number(payload?.number);
        if (!fullName || !prNumber) return Response.json({ error: "Invalid payload" }, { status: 400, headers: corsHeaders });

        const prSessionId = `${fullName}#${prNumber}`;
        const code = await fetchPrCode(env, fullName, prNumber);
        if (!code) {
          await postPrComment(env, fullName, prNumber, "No diff content detected to review.");
          return Response.json({ ok: true, comment: "No diff" }, { headers: corsHeaders });
        }

        const results = await runPipeline(code, allTools as Record<string, any>);
        const { language, summary } = summarizeForMemory(results.bugs, results.sec, results.perf, results.style);
        const saved = await saveToDO(env, prSessionId, { language, summary, snippet: code.slice(0, 400) });
        await upsertVector(env, prSessionId, saved.id, code.slice(0, 512));

        const wai = createWorkersAI({ binding: env.AI });
        const model = wai("@cf/meta/llama-3.3-70b-instruct-fp8-fast" as any) as unknown as LanguageModel;
        const messages = buildFormatMessages([], language, results);

        // Build full comment text (non-stream for GitHub API)
        let fullText = "";
        for await (const chunk of streamText({ model, messages, toolChoice: "none", maxSteps: 1 }).textStream) {
          fullText += chunk;
        }
        await postPrComment(env, fullName, prNumber, fullText);
        return Response.json({ ok: true, commented: true, reviewId: saved.id }, { headers: corsHeaders });
      } catch (err) {
        console.error("Webhook error:", err);
        return Response.json({ error: "webhook failed" }, { status: 500, headers: corsHeaders });
      }
    }

    // ---- Chat endpoint (with memory/state) ----
    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const bodyUnknown = await request.json();
        const history: CoreMessage[] = sanitizeMessages((bodyUnknown as any)?.messages);
        const last = history[history.length - 1];
        const code = extractCode(typeof last?.content === "string" ? last.content : "");

        // Workflow/coordination: run tools → persist → format
        const results = await runPipeline(code, allTools as Record<string, any>);
        const { language, summary } = summarizeForMemory(results.bugs, results.sec, results.perf, results.style);

        const saved = await saveToDO(env, sessionId, { language, summary, snippet: code.slice(0, 400) });
        await upsertVector(env, sessionId, saved.id, code.slice(0, 512));

        const wai = createWorkersAI({ binding: env.AI });
        const model = wai("@cf/meta/llama-3.3-70b-instruct-fp8-fast" as any) as unknown as LanguageModel;
        const messages = buildFormatMessages(history, language, results);

        const result = streamText({ model, messages, toolChoice: "none", maxSteps: 1 });

        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();

        (async () => {
          try {
            for await (const chunk of result.textStream) {
              const line = `0:${JSON.stringify({ type: "text-delta", textDelta: chunk })}\n`;
              await writer.write(encoder.encode(line));
            }
            await writer.close();
          } catch (err) {
            console.error("Stream piping error:", err);
            await writer.abort(err as any);
          }
        })();

        return new Response(readable, {
          headers: {
            ...corsHeaders,
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      } catch (error) {
        console.error("Error in /api/chat:", error);
        return Response.json({ error: "Failed to process request" }, { status: 500, headers: corsHeaders });
      }
    }

    return new Response("AI Code Review Assistant API", { headers: corsHeaders });
  },
};
