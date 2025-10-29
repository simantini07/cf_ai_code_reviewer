import { streamText } from "ai";
import type { LanguageModel } from "ai";
const { generateText } = await import('ai');
import { createWorkersAI } from 'workers-ai-provider';
import { tools, executions } from "./tools";

export interface Env {
  AI: any;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Chat endpoint
    // Chat endpoint
if (url.pathname === "/api/chat" && request.method === "POST") {
  try {
    const body = (await request.json()) as {
      messages?: Array<{ role: string; content: string }>;
      toolCallId?: string;
      toolName?: string;
      toolArgs?: any;
    };
    const { messages, toolCallId, toolName, toolArgs } = body;

    // Create Workers AI instance
    const workersai = createWorkersAI({ binding: env.AI });
    const model = workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast" as any) as unknown as LanguageModel;

    // Handle tool execution confirmation
    if (toolCallId && toolName && toolArgs) {
      const execution = executions[toolName as keyof typeof executions];
      if (execution) {
        const result = await execution(toolArgs);
        return Response.json({ result }, { headers: corsHeaders });
      }
    }

    // System prompt for code review
    const systemPrompt = `You are an expert code review assistant specialized in finding bugs, security issues, and performance problems.

IMPORTANT: When a user provides code, you MUST:

1. **ALWAYS use these tools in order:**
   - First call analyzeBugs to check for bugs and logic errors
   - Then call checkSecurity to scan for vulnerabilities
   - Then call suggestPerformance to find optimizations
   - Finally call checkStyle to check coding standards

2. **After running all tools**, provide a comprehensive summary including:
   - Severity of issues found (Critical/High/Medium/Low)
   - Detailed explanation of each issue
   - Code examples showing the fix
   - Best practice recommendations

3. **Format your response like this:**
   
   ## 🔍 Code Review Results
   
   **Language Detected:** [language]
   
   ### 🐛 Bug Analysis
   [Results from analyzeBugs tool]
   
   ### 🔒 Security Check
   [Results from checkSecurity tool]
   
   ### ⚡ Performance Review
   [Results from suggestPerformance tool]
   
   ### 📝 Style & Best Practices
   [Results from checkStyle tool]
   
   ### 📊 Summary
   [Overall assessment and priority recommendations]

CRITICAL: You MUST call all 4 tools before providing your response. Don't just describe what you would do - actually use the tools!`;

    // Stream the response
    const result = streamText({
      model: model as LanguageModel,
      messages: [
  { role: "system", content: systemPrompt },
  // Add explicit instruction with the user's last message
  ...((messages as any[]) || []).slice(0, -1),
  {
    role: "user",
    content: `Please analyze this code using ALL your available tools (analyzeBugs, checkSecurity, suggestPerformance, checkStyle):

${messages?.[messages.length - 1]?.content || ""}`
  }
],
      tools,
    });

    // Create a TransformStream to convert the AI response to our format
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Process the stream in the background
    (async () => {
      try {
        for await (const chunk of result.textStream) {
          const data = `0:${JSON.stringify({ type: "text-delta", textDelta: chunk })}\n`;
          await writer.write(encoder.encode(data));
        }
        await writer.close();
      } catch (error) {
        console.error("Stream error:", error);
        await writer.abort(error);
      }
    })();

    // Return the readable stream
    return new Response(readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error in /api/chat:", error);
    return Response.json(
      { error: "Failed to process request" },
      { status: 500, headers: corsHeaders }
    );
  }
}

    return new Response("AI Code Review Assistant API", {
      headers: corsHeaders,
    });
  },
};