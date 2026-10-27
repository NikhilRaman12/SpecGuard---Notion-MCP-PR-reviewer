import { describe, expect, it } from "vitest";
import request from "supertest";

import { calculateTriageScore, createApp, parseGitHubPrUrl, parseReviewResponse, selectRelevantNotionContext } from "../server";

describe("parseGitHubPrUrl", () => {
  it("accepts valid GitHub PR URLs", () => {
    expect(parseGitHubPrUrl("https://github.com/octo/repo/pull/42")).toEqual({
      owner: "octo",
      repo: "repo",
      pullNumber: 42,
      url: "https://github.com/octo/repo/pull/42",
    });
  });

  it("rejects non-GitHub or malformed URLs", () => {
    expect(() => parseGitHubPrUrl("https://example.com/owner/repo/pull/42")).toThrow("Only GitHub PR URLs are accepted");
    expect(() => parseGitHubPrUrl("https://github.com/octo/repo")).toThrow("URL must point to a GitHub pull request");
  });
});

describe("selectRelevantNotionContext", () => {
  it("ranks pages by keyword relevance", () => {
    const pages = [
      { title: "API latency policy", excerpt: "Keep latency under 250ms for all reads.", url: "https://example.com/latency" },
      { title: "Design system", excerpt: "Buttons should use the design tokens palette.", url: "https://example.com/design" },
      { title: "Security standards", excerpt: "Secrets must never be embedded in source code.", url: "https://example.com/security" },
    ];

    const selected = selectRelevantNotionContext("JWT secret hardcoded in auth route and no rate limiting", pages);
    expect(selected[0]?.title).toContain("Security");
  });
});

describe("calculateTriageScore", () => {
  it("weights findings by severity", () => {
    const score = calculateTriageScore([
      { severity: "critical", title: "Critical", finding: "Issue", evidence_quote: "evidence", recommendation: "fix it", knowledge_gaps: [], evidence_backed: true },
      { severity: "warning", title: "Warning", finding: "Issue", evidence_quote: "evidence", recommendation: "fix it", knowledge_gaps: [], evidence_backed: true },
    ]);

    expect(score).toBeGreaterThan(40);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("parseReviewResponse", () => {
  it("accepts a valid review payload", () => {
    const payload = parseReviewResponse(`{
      "summary": "No relevant evidence was found.",
      "findings": [],
      "triage_score": 8,
      "evidence": [],
      "knowledge_gaps": ["No matching Notion page was found."]
    }`);

    expect(payload.findings).toHaveLength(0);
    expect(payload.triage_score).toBe(8);
  });
});

describe("API failures", () => {
  it("rejects malformed review payloads", async () => {
    const app = createApp();
    const response = await request(app).post("/api/review-pr").send({ prUrl: "bad-url" });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/GitHub PR URL/i);
  });

  it("health endpoint responds", async () => {
    const app = createApp();
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });
});
