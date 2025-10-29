cf_ai_code_reviewer
An AI-powered code review assistant built on Cloudflare's edge infrastructure, providing real-time analysis of code for bugs, security vulnerabilities, performance issues, and style improvements.
🚀 Features

Real-time Code Analysis: Instant feedback on code quality using Llama 3.3 70B
Multi-dimensional Review: Analyzes bugs, security, performance, and style
Persistent Memory: Session-based history using Durable Objects
Semantic Search: Vector-based code similarity search with Vectorize
GitHub Integration: Automated PR reviews via webhooks
Streaming Responses: Real-time UI updates as analysis progresses
Session Management: Cookie-based user sessions for personalized experience

🏗️ Architecture
Core Components

LLM: Llama 3.3 70B (via Cloudflare Workers AI)
Workflow: Multi-step deterministic pipeline with 4 analysis tools
User Input: React-based chat interface with code editor
Memory/State:

Durable Objects for session persistence
Vectorize for semantic code search
Session cookies for user identification



Tech Stack

Runtime: Cloudflare Workers
AI Model: @cf/meta/llama-3.3-70b-instruct-fp8-fast
Frontend: React + TypeScript
State Management: Durable Objects
Vector Database: Cloudflare Vectorize
Embeddings: @cf/baai/bge-small-en-v1.5

📋 Prerequisites

Node.js 18+ and npm
Cloudflare account (free tier works)
Wrangler CLI installed globally: npm install -g wrangler

🛠️ Local Development Setup
1. Clone the Repository
bashgit clone https://github.com/yourusername/cf_ai_code_reviewer.git
cd cf_ai_code_reviewer
2. Install Dependencies
bashnpm install
3. Configure Wrangler
Create wrangler.toml in the project root:
tomlname = "cf-ai-code-reviewer"
main = "src/server.ts"
compatibility_date = "2024-01-01"

[ai]
binding = "AI"

[[durable_objects.bindings]]
name = "REVIEW_SESSIONS"
class_name = "ReviewSessionDO"
script_name = "cf-ai-code-reviewer"

[[migrations]]
tag = "v1"
new_classes = ["ReviewSessionDO"]

[[vectorize]]
binding = "VECTORIZE"
index_name = "code-reviews"

[vars]
# Optional: for GitHub webhook integration
# GITHUB_WEBHOOK_SECRET = "your-webhook-secret"

[env.production]
name = "cf-ai-code-reviewer"
4. Create Vectorize Index
bashwrangler vectorize create code-reviews --dimensions=384 --metric=cosine
5. Run Development Server
bashnpm run dev
The app will be available at http://localhost:8787
🌐 Deployment
Option 1: Deploy to Cloudflare (Recommended)
Step 1: Login to Cloudflare
bashwrangler login
Step 2: Create Vectorize Index (if not done)
bashwrangler vectorize create code-reviews --dimensions=384 --metric=cosine
Step 3: Deploy
bashnpm run deploy
# or
wrangler deploy
Your app will be live at: https://cf-ai-code-reviewer.<your-subdomain>.workers.dev
Step 4: (Optional) Custom Domain
bashwrangler deploy --route "codereview.yourdomain.com/*"
Option 2: GitHub Integration (Optional)
To enable automated PR reviews:

Generate GitHub Token:

Go to GitHub Settings → Developer Settings → Personal Access Tokens
Create token with repo scope
Save the token securely


Add Secrets:

bashecho "your-github-token" | wrangler secret put GITHUB_TOKEN
echo "your-webhook-secret" | wrangler secret put GITHUB_WEBHOOK_SECRET

Configure Webhook:

Go to your GitHub repository → Settings → Webhooks
Add webhook: https://your-worker-url.workers.dev/api/webhook/github
Content type: application/json
Secret: (same as GITHUB_WEBHOOK_SECRET above)
Events: Select "Pull requests"



📖 Usage
Web Interface

Navigate to your deployed URL or http://localhost:8787
Paste code into the left editor panel
Click "Run Security Analysis"
Review the comprehensive analysis on the right panel

API Endpoints
POST /api/chat
Main code review endpoint with streaming responses.
bashcurl -X POST https://your-worker.workers.dev/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "```javascript\nfunction test() { var x = 5; }\n```"
      }
    ]
  }'
GET /api/history
Retrieve session review history.
bashcurl https://your-worker.workers.dev/api/history
GET /api/search?q=security
Semantic search across past reviews.
bashcurl "https://your-worker.workers.dev/api/search?q=sql+injection"
POST /api/webhook/github
GitHub webhook endpoint for automated PR reviews (requires configuration).
🔧 Configuration
Environment Variables
Add to wrangler.toml under [vars]:

GITHUB_WEBHOOK_SECRET: Secret for verifying GitHub webhooks
GITHUB_TOKEN: Personal access token for GitHub API (use wrangler secret put)

Bindings

AI: Workers AI binding (automatic)
REVIEW_SESSIONS: Durable Object namespace
VECTORIZE: Vectorize index binding

🧪 Testing
Test with the included example code (buggy JavaScript):
javascriptfunction processData(data) {
  var result = [];
  for (var i = 0; i < data.length; i++) {
    if (data[i] == null) {
      console.log("Found null");
      eval("result.push(" + data[i] + ")");
    }
  }
  document.getElementById("output").innerHTML = result;
  return result;
}
Expected issues found:

🐛 Use of var instead of let/const
🚨 Critical: eval() security vulnerability
⚠️ XSS risk with innerHTML
⚠️ Loose equality (==) instead of strict (===)

📊 Analysis Categories
The AI assistant performs four types of analysis:

🐛 Bug Analysis: Logic errors, edge cases, type issues
🔒 Security Check: SQL injection, XSS, code injection, sensitive data exposure
⚡ Performance Review: Algorithm complexity, redundant operations, optimization opportunities
📝 Style & Best Practices: Code formatting, naming conventions, documentation

🏛️ Project Structure
cf_ai_code_reviewer/
├── src/
│   ├── server.ts          # Main Worker + API routes
│   ├── review_session.ts  # Durable Object for session state
│   ├── tools.ts           # Analysis tools (bugs, security, perf, style)
│   └── app.tsx            # React frontend
├── wrangler.toml          # Cloudflare configuration
├── package.json           # Dependencies
├── README.md              # This file
└── PROMPTS.md             # AI prompts used during development
🤝 Contributing
This is a submission for Cloudflare's AI assignment. All work is original, with AI-assisted development documented in PROMPTS.md.
📝 License
MIT License - feel free to use and modify for your own projects.
🔗 Links

Cloudflare Workers AI: https://developers.cloudflare.com/workers-ai/
Durable Objects: https://developers.cloudflare.com/durable-objects/
Vectorize: https://developers.cloudflare.com/vectorize/

💡 Future Enhancements

 Support for more languages (Go, Rust, TypeScript)
 Inline code suggestions
 Diff-based review mode
 Team collaboration features
 Custom rule configuration
 Integration with VS Code extension

📧 Support
For issues or questions, please open an issue on GitHub.
