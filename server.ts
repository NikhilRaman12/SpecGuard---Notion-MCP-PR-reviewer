import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { Client } from "@notionhq/client";
import { Octokit } from "octokit";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer as createViteServer } from "vite";

dotenvConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:3000"];

const reviewRequestSchema = z.object({
  prUrl: z.string().trim().min(10),
});

const evidenceSchema = z.object({
  title: z.string().min(1),
  type: z.string().default("notion"),
  url: z.string().url().optional().or(z.literal("")),
  excerpt: z.string().min(1),
});

export const reviewFindingSchema = z.object({
  severity: z.enum(["critical", "warning", "info"]),
  title: z.string().min(1),
  finding: z.string().min(1),
  evidence_quote: z.string().min(1).max(2000),
  source_url: z.string().url().optional().or(z.literal("")),
  file_path: z.string().optional(),
  line_number: z.number().int().positive().optional(),
  recommendation: z.string().min(1),
  knowledge_gaps: z.array(z.string()).default([]),
  evidence_backed: z.boolean().default(true),
});

export const reviewResultSchema = z.object({
  summary: z.string().min(1),
  findings: z.array(reviewFindingSchema).default([]),
  triage_score: z.number().int().min(0).max(100),
  evidence: z.array(evidenceSchema).default([]),
  knowledge_gaps: z.array(z.string()).default([]),
});

export type ReviewFinding = z.infer<typeof reviewFindingSchema>;
export type ReviewResult = z.infer<typeof reviewResultSchema>;

export function parseGitHubPrUrl(rawUrl: string) {
  if (!rawUrl) {
    throw new Error("GitHub PR URL is required.");
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid GitHub PR URL format.");
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname !== "github.com" && hostname !== "www.github.com") {
    throw new Error("Only GitHub PR URLs are accepted.");
  }

  const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/);
  if (!match) {
    throw new Error("URL must point to a GitHub pull request, e.g. https://github.com/owner/repo/pull/123");
  }

  const [, owner, repo, pullNumber] = match;
  if (!owner || !repo || !pullNumber) {
    throw new Error("GitHub PR URL is missing required owner, repository, or PR number.");
  }

  return {
    owner,
    repo,
    pullNumber: Number(pullNumber),
    url: `https://github.com/${owner}/${repo}/pull/${pullNumber}`,
  };
}

export function sanitizeText(value: string | null | undefined, maxLength = 4000) {
  if (!value) return "";
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

export function extractTextFromProperties(properties: Record<string, unknown> | undefined) {
  if (!properties) return "";

  const chunks: string[] = [];
  for (const prop of Object.values(properties)) {
    if (!prop || typeof prop !== "object") continue;
    const record = prop as Record<string, unknown>;
    if (record.type === "title" && Array.isArray(record.title)) {
      chunks.push(...record.title.map((entry: any) => entry.plain_text ?? ""));
    }
    if (record.type === "rich_text" && Array.isArray(record.rich_text)) {
      chunks.push(...record.rich_text.map((entry: any) => entry.plain_text ?? ""));
    }
    if (record.type === "text" && Array.isArray(record.text)) {
      chunks.push(...record.text.map((entry: any) => entry.plain_text ?? ""));
    }
    if (record.type === "url" && typeof record.url === "string") {
      chunks.push(record.url);
    }
  }

  return sanitizeText(chunks.filter(Boolean).join(" "), 8000);
}

export function selectRelevantNotionContext(prText: string, pages: Array<{ title: string; excerpt: string; url?: string }>) {
  const keywords = Array.from(
    new Set(
      prText
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 2)
        .slice(0, 30),
    ),
  );

  if (keywords.length === 0) {
    return pages.slice(0, 3);
  }

  const scored = pages
    .map((page) => {
      const haystack = `${page.title} ${page.excerpt}`.toLowerCase();
      const score = keywords.reduce((total, keyword) => total + (haystack.includes(keyword) ? 3 : 0), 0);
      return { ...page, score };
    })
    .filter((page) => page.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return scored.length > 0 ? scored : pages.slice(0, 3);
}

export function calculateTriageScore(findings: ReviewFinding[]) {
  const weightMap = { critical: 38, warning: 18, info: 7 };
  if (findings.length === 0) return 8;

  const weighted = findings.reduce((total, finding) => total + (weightMap[finding.severity] ?? 8), 0);
  const score = Math.min(100, Math.round(weighted + Math.min(findingLengthBoost(findings), 25)));
  return score;
}

function findingLengthBoost(findings: ReviewFinding[]) {
  const uniqueFiles = new Set(findings.map((finding) => finding.file_path ?? "unknown")).size;
  return uniqueFiles * 3 + findings.length * 2;
}

function clampValue(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function buildModelPrompt(prTitle: string, prBody: string, diff: string, evidence: { title: string; excerpt: string; url?: string }[]) {
  const evidenceText = evidence.length
    ? evidence
        .map((doc, index) => `Evidence ${index + 1}: ${doc.title}\n${doc.excerpt}\nURL: ${doc.url ?? "N/A"}`)
        .join("\n\n")
    : "No relevant Notion evidence was found for this PR.";

  return `You are SpecGuard, a PR reviewer. Evaluate the following pull request and supporting engineering standards. Claim only what the diff and retrieved evidence support. Do not invent file paths, lines, or Notion pages. Output strictly valid JSON matching the schema below. If there is no relevant evidence, keep findings empty and explain the gap in the summary and knowledge_gaps.

PR title: ${prTitle}
PR description: ${prBody || "No description"}

PR diff:
${diff.slice(0, 18000)}

Retrieved Notion evidence:
${evidenceText}

Return a JSON object with keys:
{
  "summary": "string",
  "findings": [
    {
      "severity": "critical|warning|info",
      "title": "string",
      "finding": "string",
      "evidence_quote": "string",
      "source_url": "string or empty",
      "file_path": "string or null",
      "line_number": "number or null",
      "recommendation": "string",
      "knowledge_gaps": ["string"],
      "evidence_backed": true
    }
  ],
  "knowledge_gaps": ["string"],
  "triage_score": 0
}

Rules:
- This triage_score is a prioritization score for engineering follow-up, not a probability of a defect.
- Put findings in order by importance.
- Only include file_path and line_number when the diff directly supports them.
- If evidence is not directly relevant, set evidence_backed false and explain in the finding.
- If no relevant evidence found, summarize that explicitly and leave findings empty.`;
}

export function parseReviewResponse(rawText: string) {
  const clean = rawText.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(clean);
  return reviewResultSchema.parse(parsed);
}

async function queryNotionDatabase(notion: Client, databaseId: string, projectText: string) {
  if (!databaseId) {
    throw new Error("Notion database configuration is missing.");
  }

  const pages: Array<{ title: string; excerpt: string; url?: string }> = [];
  let cursor: string | undefined = undefined;

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const response = await notion.databases.query({
      database_id: databaseId,
      page_size: 5,
      start_cursor: cursor,
    });

    for (const page of response.results) {
      const title = extractTitleFromPage(page as any);
      const excerpt = sanitizeText(extractTextFromProperties((page as any).properties), 400);
      pages.push({
        title: title || "Untitled Notion page",
        excerpt: excerpt || "No text snippet available.",
        url: (page as any).url || undefined,
      });
    }

    if (!response.has_more) break;
    cursor = response.next_cursor || undefined;
  }

  return selectRelevantNotionContext(projectText, pages).slice(0, 5);
}

export function extractTitleFromPage(page: any) {
  const properties = page?.properties ?? {};
  const titleProp = properties.Title || properties.Name || Object.values(properties).find((prop: any) => prop?.type === "title");
  if (titleProp?.title && Array.isArray(titleProp.title)) {
    return titleProp.title.map((part: any) => part.plain_text ?? "").join("") || "Untitled";
  }
  if (typeof page?.properties?.Name?.title?.[0]?.plain_text === "string") {
    return page.properties.Name.title[0].plain_text;
  }
  return "Untitled";
}

export async function fetchGithubPullRequestData(octokit: Octokit, prUrl: string) {
  const { owner, repo, pullNumber } = parseGitHubPrUrl(prUrl);
  const { data: pullRequest } = await octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber });
  const diffResponse = await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
    owner,
    repo,
    pull_number: pullNumber,
    headers: {
      accept: "application/vnd.github.v3.diff",
    },
  });

  const diff = typeof diffResponse.data === "string" ? diffResponse.data : "";
  return {
    url: `https://github.com/${owner}/${repo}/pull/${pullNumber}`,
    title: pullRequest.title || "Untitled pull request",
    body: pullRequest.body || "",
    diff: sanitizeText(diff, 26000),
    repoFullName: `${owner}/${repo}`,
  };
}

export async function fetchNotionEvidence(notion: Client, databaseId: string, searchText: string) {
  const pages = await queryNotionDatabase(notion, databaseId, searchText);
  return pages.map((page) => ({
    title: page.title,
    excerpt: page.excerpt,
    url: page.url || "",
  }));
}

async function callGoogleModel(prompt: string) {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Gemini API key. Set GEMINI_API_KEY or GOOGLE_API_KEY in the environment.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  const text = typeof response?.text === "string" ? response.text : String(response || "");
  if (!text) {
    throw new Error("Google AI returned an empty response.");
  }

  return text;
}

export async function generateReviewResult(prTitle: string, prBody: string, diff: string, evidence: Array<{ title: string; excerpt: string; url?: string }>) {
  const prompt = buildModelPrompt(prTitle, prBody, diff, evidence);
  const rawText = await callGoogleModel(prompt);
  const parsed = parseReviewResponse(rawText);
  const findings = parsed.findings.map((finding) => ({
    ...finding,
    source_url: finding.source_url || evidence[0]?.url || "",
    evidence_backed: finding.evidence_backed ?? true,
  }));

  return {
    ...parsed,
    findings,
    triage_score: clampValue(calculateTriageScore(findings)),
    evidence: evidence.map((item) => ({
      title: item.title,
      type: "notion",
      url: item.url || "",
      excerpt: item.excerpt,
    })),
  } satisfies ReviewResult;
}

export function createApp() {
  const app: Express = express();

  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGINS.join(",")).split(",").map((entry) => entry.trim()).filter(Boolean);
  const originAllowList = new Set(allowedOrigins);

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || originAllowList.has(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Origin not allowed by CORS policy."));
      },
      methods: ["GET", "POST"],
      credentials: false,
    }),
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Too many requests. Please wait a moment before submitting another review." },
    }),
  );

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/review-pr", async (req: Request, res: Response) => {
    try {
      const parsedBody = reviewRequestSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({ error: "A valid GitHub PR URL is required." });
      }

      const { prUrl } = parsedBody.data;
      const { owner, repo, pullNumber } = parseGitHubPrUrl(prUrl);
      const octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN,
        userAgent: "specguard-mvp",
      });

      const { title, body, diff } = await fetchGithubPullRequestData(octokit, prUrl);
      const notionDatabaseId = process.env.NOTION_DATABASE_ID;
      const notion = new Client({ auth: process.env.NOTION_API_KEY });

      let evidence: Array<{ title: string; excerpt: string; url?: string }> = [];
      if (notionDatabaseId && process.env.NOTION_API_KEY) {
        try {
          evidence = await fetchNotionEvidence(notion, notionDatabaseId, `${title} ${body} ${diff}`);
        } catch (error: any) {
          console.warn("Notion context fetch failed:", error?.message || error);
          evidence = [];
        }
      }

      if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
        return res.status(503).json({
          error: "AI review is not configured. Set GEMINI_API_KEY or GOOGLE_API_KEY in the environment before running a review.",
        });
      }

      const review = await generateReviewResult(title, body, diff, evidence);
      const validate = reviewResultSchema.safeParse(review);
      if (!validate.success) {
        console.error("Model output validation failed:", validate.error.flatten());
        return res.status(500).json({ error: "The model returned an invalid review payload." });
      }

      return res.json({
        repo: `${owner}/${repo}`,
        prNumber: pullNumber,
        review: validate.data,
      });
    } catch (error: any) {
      const message = error?.message || "Unknown server error.";
      const status = error?.status || 500;
      const safeMessage = message.includes("rate limit") ? "GitHub rate limit reached. Please wait a moment and retry." : message;
      return res.status(status).json({ error: safeMessage });
    }
  });

  return app;
}

async function startServer() {
  const app = createApp();
  const port = Number(process.env.PORT || 3000);

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`SpecGuard listening on http://localhost:${port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error) => {
    console.error("Failed to start SpecGuard server:", error);
    process.exit(1);
  });
}

function dotenvConfig() {
  if (process.env.NODE_ENV === "test") return;
  try {
    const dotenv = require("dotenv");
    dotenv.config();
  } catch {
    // no-op for environments without dotenv
  }
}
