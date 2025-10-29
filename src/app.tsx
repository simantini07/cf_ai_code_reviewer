import { useState, useEffect, useRef } from "react";

interface Message {
  role: string;
  content: string;
  timestamp?: number;
}

export default function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState({ totalReviews: 0, issuesFound: 0, criticalIssues: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const exampleCode = `function processData(data) {
  var result = [];
  for (var i = 0; i < data.length; i++) {
    if (data[i] == null) {
      console.log("Found null");
      eval("result.push(" + data[i] + ")");
    }
  }
  document.getElementById("output").innerHTML = result;
  return result;
}`;

  const handleSubmit = async () => {
    if (!input.trim()) return;
    setIsLoading(true);

    const userMessage: Message = { role: "user", content: input, timestamp: Date.now() };
    setMessages((m) => [...m, userMessage]);
    setInput("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, userMessage] }),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

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
            if (!line) continue;
            if (line.startsWith("0:")) {
              try {
                const json = JSON.parse(line.slice(2));
                if (json.type === "text-delta" && json.textDelta) {
                  assistantMessage += json.textDelta;
                  setMessages((m) => {
                    const updated = [...m];
                    const lastIndex = updated.length - 1;
                    if (updated[lastIndex]?.role === "assistant") {
                      updated[lastIndex] = { 
                        role: "assistant", 
                        content: assistantMessage,
                        timestamp: Date.now()
                      };
                    } else {
                      updated.push({ 
                        role: "assistant", 
                        content: assistantMessage,
                        timestamp: Date.now()
                      });
                    }
                    return updated;
                  });
                }
              } catch {}
            }
          }
        }
      }

      // Update stats
      setStats(prev => ({
        totalReviews: prev.totalReviews + 1,
        issuesFound: prev.issuesFound + (assistantMessage.match(/⚠️|🐛/g) || []).length,
        criticalIssues: prev.criticalIssues + (assistantMessage.match(/🚨/g) || []).length
      }));

    } catch (error) {
      console.error("Error:", error);
      setMessages((m) => [
        ...m,
        { 
          role: "assistant", 
          content: "⚠️ Connection error. Please check your network and try again.",
          timestamp: Date.now()
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const formatContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, i) => {
      if (line.startsWith('## ')) {
        return <h2 key={i} style={{ fontSize: 20, fontWeight: 700, marginTop: 24, marginBottom: 12, color: '#1a1a1a' }}>{line.replace('## ', '')}</h2>;
      }
      if (line.startsWith('### ')) {
        return <h3 key={i} style={{ fontSize: 16, fontWeight: 600, marginTop: 16, marginBottom: 8, color: '#2c3e50' }}>{line.replace('### ', '')}</h3>;
      }
      if (line.startsWith('**') && line.endsWith('**')) {
        return <p key={i} style={{ fontWeight: 600, margin: '8px 0', color: '#34495e' }}>{line.replace(/\*\*/g, '')}</p>;
      }
      if (line.startsWith('- ')) {
        const emoji = line.match(/^- ([🐛⚠️🚨✅⚡📝ℹ️])/)?.[1];
        const text = line.replace(/^- [🐛⚠️🚨✅⚡📝ℹ️]?\s*/, '');
        const color = emoji === '🚨' ? '#e74c3c' : emoji === '⚠️' ? '#f39c12' : emoji === '✅' ? '#27ae60' : '#555';
        return (
          <div key={i} style={{ 
            display: 'flex', 
            gap: 8, 
            margin: '6px 0', 
            padding: '8px 12px',
            background: emoji === '🚨' ? '#ffebee' : emoji === '⚠️' ? '#fff3e0' : emoji === '✅' ? '#e8f5e9' : '#f8f9fa',
            borderRadius: 6,
            borderLeft: `3px solid ${color}`,
            fontSize: 14
          }}>
            {emoji && <span style={{ fontSize: 16 }}>{emoji}</span>}
            <span style={{ flex: 1, color }}>{text}</span>
          </div>
        );
      }
      return line ? <p key={i} style={{ margin: '8px 0', lineHeight: 1.6, color: '#555' }}>{line}</p> : <br key={i} />;
    });
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px'
    }}>
      <div style={{ 
        maxWidth: 1400, 
        margin: '0 auto',
        background: 'rgba(255, 255, 255, 0.98)',
        borderRadius: 20,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{ 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '32px 40px',
          color: 'white'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <h1 style={{ 
                fontSize: 32, 
                fontWeight: 700, 
                margin: 0,
                marginBottom: 8,
                textShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}>
                🔍 AI Code Review Assistant
              </h1>
              <p style={{ 
                fontSize: 14, 
                margin: 0,
                opacity: 0.95,
                fontWeight: 300
              }}>
                Powered by Cloudflare Workers AI • Real-time Analysis • Enterprise Security
              </p>
            </div>
            <div style={{ display: 'flex', gap: 20 }}>
              <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.15)', padding: '12px 20px', borderRadius: 12, backdropFilter: 'blur(10px)' }}>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.totalReviews}</div>
                <div style={{ fontSize: 12, opacity: 0.9 }}>Reviews</div>
              </div>
              <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.15)', padding: '12px 20px', borderRadius: 12, backdropFilter: 'blur(10px)' }}>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.issuesFound}</div>
                <div style={{ fontSize: 12, opacity: 0.9 }}>Issues Found</div>
              </div>
              {/* <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.15)', padding: '12px 20px', borderRadius: 12, backdropFilter: 'blur(10px)' }}> */}
                {/* <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.criticalIssues}</div> */}
                {/* <div style={{ fontSize: 12, opacity: 0.9 }}>Critical</div> */}
              {/* </div> */}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div style={{ display: 'flex', height: 'calc(100vh - 200px)', minHeight: 500 }}>
          {/* Left Panel - Code Input */}
          <div style={{ 
            flex: '0 0 45%', 
            padding: 32,
            borderRight: '1px solid #e0e0e0',
            display: 'flex',
            flexDirection: 'column',
            background: '#fafafa'
          }}>
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: '#2c3e50' }}>
                📝 Submit Code for Review
              </h2>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <button
                  onClick={() => setInput(exampleCode)}
                  style={{
                    flex: 1,
                    padding: '12px 20px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    border: 'none',
                    borderRadius: 10,
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 600,
                    transition: 'transform 0.2s',
                    boxShadow: '0 4px 12px rgba(102,126,234,0.4)'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  💡 Load Example (Buggy Code)
                </button>
                <button
                  onClick={() => {
                    setMessages([]);
                    setInput("");
                    setStats({ totalReviews: 0, issuesFound: 0, criticalIssues: 0 });
                  }}
                  style={{
                    padding: '12px 20px',
                    background: 'white',
                    border: '2px solid #e0e0e0',
                    borderRadius: 10,
                    color: '#555',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 600,
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.borderColor = '#ff6b6b';
                    e.currentTarget.style.color = '#ff6b6b';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.borderColor = '#e0e0e0';
                    e.currentTarget.style.color = '#555';
                  }}
                >
                  🗑️ Clear All
                </button>
              </div>
            </div>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="// Paste your JavaScript, Python, or Java code here&#10;// Example:&#10;function calculateTotal(items) {&#10;  var total = 0;&#10;  for (var i = 0; i < items.length; i++) {&#10;    total += items[i].price;&#10;  }&#10;  return total;&#10;}"
              style={{
                flex: 1,
                padding: 20,
                borderRadius: 12,
                border: '2px solid #e0e0e0',
                fontSize: 14,
                fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
                resize: 'none',
                background: 'white',
                lineHeight: 1.6,
                outline: 'none',
                transition: 'border-color 0.3s'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = '#667eea'}
              onBlur={(e) => e.currentTarget.style.borderColor = '#e0e0e0'}
            />

            <button
              onClick={handleSubmit}
              disabled={isLoading || !input.trim()}
              style={{
                marginTop: 16,
                padding: '16px 32px',
                background: isLoading || !input.trim() 
                  ? '#ccc' 
                  : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                borderRadius: 12,
                color: 'white',
                cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
                fontSize: 16,
                fontWeight: 700,
                transition: 'all 0.3s',
                boxShadow: isLoading || !input.trim() ? 'none' : '0 6px 20px rgba(102,126,234,0.4)',
                textTransform: 'uppercase',
                letterSpacing: 1
              }}
              onMouseOver={(e) => {
                if (!isLoading && input.trim()) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 25px rgba(102,126,234,0.5)';
                }
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = isLoading || !input.trim() ? 'none' : '0 6px 20px rgba(102,126,234,0.4)';
              }}
            >
              {isLoading ? '⏳ Analyzing Code...' : '🚀 Run Security Analysis'}
            </button>

            <div style={{ 
              marginTop: 16, 
              padding: 16, 
              background: 'linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%)',
              borderRadius: 12,
              fontSize: 13,
              color: '#555',
              lineHeight: 1.6
            }}>
              <strong style={{ color: '#667eea' }}>💡 Pro Tip:</strong> This assistant checks for:
              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <span>• Logic errors & bugs</span>
                <span>• Security vulnerabilities</span>
                <span>• Performance issues</span>
                <span>• Code style & best practices</span>
              </div>
            </div>
          </div>

          {/* Right Panel - Results */}
          <div style={{ 
            flex: 1, 
            display: 'flex',
            flexDirection: 'column',
            background: 'white'
          }}>
            <div style={{ 
              padding: '24px 32px',
              borderBottom: '2px solid #f0f0f0',
              background: 'linear-gradient(to right, #f8f9fa, #ffffff)'
            }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#2c3e50' }}>
                📊 Analysis Results
              </h2>
            </div>

            <div style={{ 
              flex: 1, 
              overflowY: 'auto',
              padding: 32
            }}>
              {messages.length === 0 ? (
                <div style={{ 
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  textAlign: 'center',
                  color: '#999'
                }}>
                  <div style={{ fontSize: 64, marginBottom: 20 }}>🔍</div>
                  <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12, color: '#555' }}>
                    Ready to Review Your Code
                  </h3>
                  <p style={{ fontSize: 15, lineHeight: 1.6, maxWidth: 400 }}>
                    Paste your code in the editor and click "Run Security Analysis" to get instant feedback on bugs, security issues, performance, and code quality.
                  </p>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      marginBottom: 24,
                      animation: 'fadeIn 0.5s ease-in'
                    }}
                  >
                    {msg.role === 'user' ? (
                      <div style={{
                        background: 'linear-gradient(135deg, #667eea15 0%, #764ba215 100%)',
                        padding: 20,
                        borderRadius: 12,
                        borderLeft: '4px solid #667eea'
                      }}>
                        <div style={{ 
                          fontSize: 12, 
                          fontWeight: 600,
                          color: '#667eea',
                          marginBottom: 12,
                          textTransform: 'uppercase',
                          letterSpacing: 1
                        }}>
                          👤 Your Code
                        </div>
                        <pre style={{
                          whiteSpace: 'pre-wrap',
                          margin: 0,
                          fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
                          fontSize: 13,
                          lineHeight: 1.6,
                          color: '#2c3e50',
                          background: 'white',
                          padding: 16,
                          borderRadius: 8,
                          overflow: 'auto'
                        }}>
                          {msg.content}
                        </pre>
                      </div>
                    ) : (
                      <div style={{
                        background: '#ffffff',
                        padding: 24,
                        borderRadius: 12,
                        border: '1px solid #e0e0e0',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                      }}>
                        <div style={{ 
                          fontSize: 12, 
                          fontWeight: 600,
                          color: '#27ae60',
                          marginBottom: 16,
                          textTransform: 'uppercase',
                          letterSpacing: 1
                        }}>
                          🤖 AI Analysis Report
                        </div>
                        <div>{formatContent(msg.content)}</div>
                      </div>
                    )}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        * {
          box-sizing: border-box;
        }
        
        ::-webkit-scrollbar {
          width: 8px;
        }
        
        ::-webkit-scrollbar-track {
          background: #f1f1f1;
        }
        
        ::-webkit-scrollbar-thumb {
          background: #667eea;
          border-radius: 4px;
        }
        
        ::-webkit-scrollbar-thumb:hover {
          background: #764ba2;
        }
      `}</style>
    </div>
  );
}