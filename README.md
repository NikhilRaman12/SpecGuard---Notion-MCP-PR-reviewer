# SpecGuard 🛡️

> AI-powered PR reviewer with institutional memory — powered by Notion MCP.

![Claude](https://img.shields.io/badge/AI-Claude%20Sonnet%204-orange) ![Notion MCP](https://img.shields.io/badge/Notion-MCP-black) ![Next.js](https://img.shields.io/badge/Next.js-14-black) ![License](https://img.shields.io/badge/License-MIT-blue)

---

## The Problem

Your team documents decisions in Notion — ADRs, coding standards, architecture specs. But every AI code review tool is blind to them. PRs get merged that silently violate months of decisions.

**SpecGuard fixes this.**

---

## How It Works

When a PR is opened, SpecGuard:

1. Fetches the diff from GitHub
2. Uses **Claude + Notion MCP** to search your entire workspace
3. Flags violations with links to exact Notion pages
4. Scores PR risk 0–100
5. Posts a review comment to GitHub
6. Logs the review back to Notion (bidirectional)
7. Sends a Slack digest to the team

---

## Stack

| | |
|---|---|
| AI Reasoning | Anthropic Claude Sonnet 4 |
| Knowledge Layer | Notion MCP |
| Trigger | GitHub Webhooks |
| Notifications | Slack |
| Dashboard | Next.js 14 + Vercel |

---

## Quick Start

```bash
git clone https://github.com/NikhilRamanK/specguard
cd specguard
npm install
cp .env.example .env   # add your API keys
npm run dev
```

**Environment variables:**
```env
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...
GITHUB_WEBHOOK_SECRET=...
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

**Add GitHub webhook:**
```
Payload URL: https://your-app.vercel.app/api/webhook/github
Events: Pull requests
```

---

## Built For

**Global Hack Week: Cloud — Notion AI Challenge** by MLH × Notion

---

## Author

**NikhilRaman K**  
AI/ML Engineer | Data Scientist | GenAI & LLM Systems (RAG, Agents, Fine-Tuning) | Python
https://www.linkedin.com/in/nikhil-raman-k-448589201/?skipRedirect=true

---
