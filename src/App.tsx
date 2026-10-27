import React, { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, ExternalLink, FileText, Loader2, Search, Shield, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

type Severity = "critical" | "warning" | "info";

type ReviewFinding = {
  severity: Severity;
  title: string;
  finding: string;
  evidence_quote: string;
  source_url?: string;
  file_path?: string;
  line_number?: number;
  recommendation: string;
  knowledge_gaps: string[];
  evidence_backed: boolean;
};

type ReviewPayload = {
  summary: string;
  findings: ReviewFinding[];
  triage_score: number;
  evidence: Array<{ title: string; url: string; excerpt: string; type: string }>;
  knowledge_gaps: string[];
};

const severityClasses: Record<Severity, string> = {
  critical: "border-red-200 bg-red-50 text-red-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
};

export default function App() {
  const [prUrl, setPrUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewPayload | null>(null);
  const [lastRequestedUrl, setLastRequestedUrl] = useState<string | null>(null);

  useEffect(() => {
    const existing = window.location.hash;
    if (existing && /^https?:\/\//.test(existing.replace(/^#/, ""))) {
      setPrUrl(existing.replace(/^#/, ""));
    }
  }, []);

  const reviewSummary = useMemo(() => {
    if (!result) return null;
    return result.findings.length === 0
      ? "No outcome was supported by the PR diff and retrieved Notion evidence."
      : `${result.findings.length} finding${result.findings.length > 1 ? "s" : ""} were identified.`;
  }, [result]);

  async function handleReview() {
    const trimmed = prUrl.trim();
    if (!trimmed) {
      setError("Enter a GitHub pull request URL.");
      setResult(null);
      return;
    }

    setError(null);
    setIsLoading(true);
    setLastRequestedUrl(trimmed);

    try {
      const response = await fetch("/api/review-pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prUrl: trimmed }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Review failed.");
      }

      setResult(payload.review as ReviewPayload);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Review request failed.";
      setError(message);
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f1ed] text-[#101010]">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <header className="mb-8 flex flex-col gap-4 border-b border-[#101010]/10 pb-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#101010] text-[#f4f1ed]">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-mono uppercase tracking-[0.24em] text-[#101010]/60">SpecGuard</div>
              <h1 className="text-2xl font-semibold tracking-tight">PR review evidence tracker</h1>
            </div>
          </div>

          <button
            type="button"
            onClick={handleReview}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#101010] px-5 py-3 text-sm font-medium text-[#f4f1ed] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isLoading ? "Reviewing PR..." : "Review PR"}
          </button>
        </header>

        <main className="grid gap-8 lg:grid-cols-[420px,minmax(0,1fr)]">
          <section className="rounded-3xl border border-[#101010]/10 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              Pull request input
            </div>

            <label className="mb-2 block text-xs font-mono uppercase tracking-[0.2em] text-[#101010]/50">GitHub PR URL</label>
            <input
              value={prUrl}
              onChange={(event) => setPrUrl(event.target.value)}
              placeholder="https://github.com/owner/repo/pull/123"
              className="w-full rounded-2xl border border-[#101010]/10 bg-[#f7f5f2] px-4 py-3 text-sm outline-none transition focus:border-[#101010]/30"
            />

            <div className="mt-4 rounded-2xl border border-dashed border-[#101010]/10 bg-[#f8f5f2] p-3 text-xs text-[#101010]/60">
              Accepted format: <span className="font-medium">https://github.com/&lt;owner&gt;/&lt;repo&gt;/pull/&lt;number&gt;</span>
            </div>

            {lastRequestedUrl && !isLoading && !error && result && (
              <div className="mt-5 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Last review: {lastRequestedUrl}
              </div>
            )}

            {error && (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-[#101010]/10 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-2 text-sm font-medium">
              <Search className="h-4 w-4" />
              Review output
            </div>

            {!result && !isLoading && (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#101010]/10 bg-[#faf9f7] p-8 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#101010]/5">
                  <Search className="h-8 w-8 text-[#101010]/25" />
                </div>
                <h2 className="text-xl font-medium">Ready for review</h2>
                <p className="mt-2 max-w-md text-sm text-[#101010]/60">
                  Submit a valid GitHub PR URL to fetch the diff, select relevant Notion standards, and run a real evidence-backed review.
                </p>
              </div>
            )}

            {isLoading && (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-[#101010]/10 bg-[#faf9f7] p-8">
                <Loader2 className="mb-4 h-8 w-8 animate-spin text-[#101010]" />
                <p className="text-lg font-medium">Fetching PR and scanning Notion evidence…</p>
                <p className="mt-2 text-sm text-[#101010]/60">This may take a few seconds while the server queries GitHub and the model evaluates the diff.</p>
              </div>
            )}

            {result && (
              <div className="space-y-6">
                <div className="rounded-2xl bg-[#101010] p-6 text-[#f7f1ec]">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#f7f1ec]/60">Triage score</span>
                    <span className="rounded-full border border-[#f7f1ec]/20 px-2 py-1 text-xs font-medium">Not a defect probability</span>
                  </div>

                  <div className="flex items-end gap-4">
                    <div className="flex-1">
                      <div className="mb-2 text-4xl font-semibold">{result.triage_score}</div>
                      <div className="h-2 overflow-hidden rounded-full bg-[#f7f1ec]/10">
                        <div className="h-full rounded-full bg-orange-400" style={{ width: `${result.triage_score}%` }} />
                      </div>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-[#f7f1ec]/80">{reviewSummary}</p>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-[#101010]/50">Summary</h3>
                  <p className="rounded-2xl border border-[#101010]/10 bg-[#faf9f7] p-4 text-sm leading-relaxed text-[#101010]/80">{result.summary}</p>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-[#101010]/50">Evidence</h3>
                  {result.evidence.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-[#101010]/10 bg-[#faf9f7] p-4 text-sm text-[#101010]/60">
                      No relevant Notion evidence was found for this PR. The review used the diff alone and clearly called out the gap.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {result.evidence.map((item) => (
                        <div key={`${item.title}-${item.url}`} className="rounded-2xl border border-[#101010]/10 bg-[#faf9f7] p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium">{item.title}</div>
                              <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[#101010]/40">{item.type}</div>
                            </div>
                            {item.url && (
                              <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700">
                                Open <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                          <p className="mt-2 text-sm text-[#101010]/70">{item.excerpt}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-[#101010]/50">Findings</h3>
                  {result.findings.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#101010]/10 bg-[#faf9f7] p-4 text-sm text-[#101010]/60">
                      No evidence-backed findings were produced. This indicates either the diff was low risk or the relevant engineering standards were not found.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {result.findings.map((finding, index) => (
                        <div key={`${finding.title}-${index}`} className={`rounded-2xl border p-4 ${severityClasses[finding.severity]}`}>
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-semibold uppercase tracking-[0.12em]">{finding.severity}</div>
                            <div className="text-xs font-medium">{finding.title}</div>
                          </div>

                          <p className="text-sm leading-relaxed">{finding.finding}</p>

                          <div className="mt-4 rounded-xl border border-current/10 bg-white/30 p-3 text-sm leading-relaxed">
                            <span className="font-medium">Evidence:</span> “{finding.evidence_quote}”
                          </div>

                          {(finding.file_path || finding.line_number || finding.source_url) && (
                            <div className="mt-4 flex flex-wrap gap-2 text-xs">
                              {finding.file_path && <span className="rounded-full bg-white/40 px-2 py-1">{finding.file_path}</span>}
                              {typeof finding.line_number === "number" && <span className="rounded-full bg-white/40 px-2 py-1">Line {finding.line_number}</span>}
                              {finding.source_url && (
                                <a href={finding.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-white/40 px-2 py-1 underline">
                                  Source <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          )}

                          <div className="mt-4 text-sm">
                            <span className="font-medium">Recommendation:</span> {finding.recommendation}
                          </div>

                          {finding.knowledge_gaps.length > 0 && (
                            <div className="mt-4 text-sm">
                              <span className="font-medium">Knowledge gaps:</span> {finding.knowledge_gaps.join(" ")}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {result.knowledge_gaps.length > 0 && (
                  <div>
                    <h3 className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-[#101010]/50">Knowledge gaps</h3>
                    <ul className="space-y-2">
                      {result.knowledge_gaps.map((gap) => (
                        <li key={gap} className="rounded-2xl border border-[#101010]/10 bg-[#faf9f7] p-3 text-sm text-[#101010]/75">
                          {gap}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
