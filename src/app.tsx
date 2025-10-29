import { useState } from "react";

// Small, self-contained App component to satisfy TSX/types while keeping
// behavior minimal. This preserves the UI snippets originally present and
// provides the missing state and handlers that were causing compile errors.
export default function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);

  // tools requiring confirmation are tracked on the client if needed

  const handleSubmit = async () => {
  if (!input.trim()) return;
  setIsLoading(true);

  const userMessage = { role: "user", content: input };
  setMessages((m) => [...m, userMessage]);
  setInput("");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [...messages, userMessage],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let assistantMessage = "";

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("0:")) {
            try {
              const json = JSON.parse(line.slice(2));
              if (json.type === "text-delta" && json.textDelta) {
                assistantMessage += json.textDelta;
                // Update the last message in real-time
                setMessages((m) => {
                  const updated = [...m];
                  const lastIndex = updated.length - 1;
                  if (updated[lastIndex]?.role === "assistant") {
                    updated[lastIndex] = { role: "assistant", content: assistantMessage };
                  } else {
                    updated.push({ role: "assistant", content: assistantMessage });
                  }
                  return updated;
                });
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    }

    // Final update
    if (assistantMessage) {
      setMessages((m) => {
        const updated = [...m];
        const lastIndex = updated.length - 1;
        if (updated[lastIndex]?.role === "assistant") {
          updated[lastIndex] = { role: "assistant", content: assistantMessage };
        } else {
          updated.push({ role: "assistant", content: assistantMessage });
        }
        return updated;
      });
    }
  } catch (error) {
    console.error("Error:", error);
    setMessages((m) => [...m, { 
      role: "assistant", 
      content: "Sorry, there was an error processing your request. Please try again." 
    }]);
  } finally {
    setIsLoading(false);
  }
};

  return (
    <div className="app-root" style={{ padding: 16 }}>
      <div className="header">
        <h1>🔍 AI Code Review Assistant</h1>
        <p style={{ fontSize: "14px", opacity: 0.8 }}>Paste your code below for instant analysis</p>
        <button onClick={() => setMessages([])}>Clear Chat</button>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <strong>Conversation</strong>
          <div style={{ border: "1px solid #eee", padding: 8, borderRadius: 6, marginTop: 8 }}>
            {messages.length === 0 ? (
              <div style={{ opacity: 0.6 }}>No messages yet — paste code and click "Review Code".</div>
            ) : (
              messages.map((m, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: "#666" }}>{m.role}</div>
                  <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{m.content}</pre>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="input-container">
          <button
            onClick={() => {
              setInput("Please review this code:\n```javascript\n// Paste your code here\n```");
            }}
            style={{ padding: "8px 16px", marginBottom: 8, background: "#4CAF50", border: "none", borderRadius: 4, color: "white", cursor: "pointer" }}
          >
            📝 Code Template
          </button>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste your code here or describe what you need reviewed..."
            rows={6}
            style={{ width: "100%", padding: 8, borderRadius: 6 }}
          />

          <div style={{ marginTop: 8 }}>
            <button onClick={handleSubmit} disabled={isLoading || !input.trim()}>
              {isLoading ? "Reviewing..." : "Review Code"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}