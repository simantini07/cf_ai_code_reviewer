// =========================================
// File: src/server.ts  (drop-in replacement)
// =========================================
import { streamText, type CoreMessage } from "ai";
import type { LanguageModel } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { tools as allTools, executions } from "./tools";

export interface Env {
  AI: any;
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

// naive extractor: prefer fenced code; else return whole message
function extractCode(s: string): string {
  if (!s) return "";
  const fence = /```[a-zA-Z0-9_-]*\n([\s\S]*?)```/m.exec(s);
  if (fence?.[1]) return fence[1].trim();
  return s.trim();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Optional: manual exec for confirm-required tools
    if (url.pathname === "/api/tool-exec" && request.method === "POST") {
      try {
        const body = (await request.json()) as { toolName?: string; toolArgs?: any };
        const exec = executions[body?.toolName as keyof typeof executions];
        if (!exec) {
          return Response.json(
            { error: `Unknown executable tool: ${body?.toolName}` },
            { status: 400, headers: corsHeaders }
          );
        }
        const result = await exec(body?.toolArgs ?? {});
        return Response.json({ result }, { headers: corsHeaders });
      } catch {
        return Response.json({ error: "Failed to execute tool" }, { status: 500, headers: corsHeaders });
      }
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const bodyUnknown = await request.json();
        const history: CoreMessage[] = sanitizeMessages((bodyUnknown as any)?.messages);
        const last = history[history.length - 1];
        const code = extractCode(typeof last?.content === "string" ? last.content : "");

        // 1) Run tools server-side (no model tool-calls)
        const { analyzeBugs, checkSecurity, suggestPerformance, checkStyle } =
          allTools as Record<string, any>;

        const [bugs, sec, perf, style] = await Promise.all([
          analyzeBugs.execute({ code }),
          checkSecurity.execute({ code }),
          suggestPerformance.execute({ code }),
          checkStyle.execute({ code }),
        ]);

        // 2) Ask model to write the final report from tool results
        const workersai = createWorkersAI({ binding: env.AI });
        const model = workersai(
          "@cf/meta/llama-3.3-70b-instruct-fp8-fast" as any
        ) as unknown as LanguageModel;

        const system = `You are an expert code review assistant. Format a clear human report from the provided tool results. 
Do NOT print any JSON or describe tool calls.`;

        const user = `Here are the tool results for the user's code.
- Bug Analysis: ${JSON.stringify(bugs)}
- Security Check: ${JSON.stringify(sec)}
- Performance Review: ${JSON.stringify(perf)}
- Style Check: ${JSON.stringify(style)}

Now produce exactly this structure:

## 🔍 Code Review Results

**Language Detected:** ${bugs.language || "unknown"}

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

        const result = streamText({
          model,
          messages: [
            { role: "system", content: system },
            ...history.slice(0, -1), // keep prior chat
            { role: "user", content: user },
          ],
          // ⛔ Do NOT pass tools: we already executed them server-side.
          toolChoice: "none",
          maxSteps: 1,
        });

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
