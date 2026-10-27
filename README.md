# SpecGuard

SpecGuard is a Vite + React frontend and Express + TypeScript backend for evidence-backed pull request review. It fetches real GitHub PR diffs, queries relevant Notion standards, calls a server-side LLM, and returns traceable findings with a transparent triage score.

## Architecture

- Frontend: React + TypeScript + Vite
- Backend: Express + TypeScript
- GitHub: Octokit
- Notion: Official Notion SDK
- LLM provider: Google Gemini via server-side adapter
- Validation: Zod schemas for request/response validation

## Required environment variables

Create a local `.env` file from `.env.example` and fill in values.

```bash
cp .env.example .env
```

The app expects:

- `GITHUB_TOKEN`: Personal access token or GitHub App installation token with read access to the target repositories
- `NOTION_API_KEY`: Notion integration secret with database access
- `NOTION_DATABASE_ID`: The Notion database that contains engineering standards / ADRs
- `GEMINI_API_KEY` or `GOOGLE_API_KEY`: API key for the selected provider
- `AI_PROVIDER` (optional, default: `google`)
- `ALLOWED_ORIGINS` (optional, default: `http://localhost:5173,http://localhost:3000`)
- `PORT` (optional, default: `3000`)

## GitHub permissions

The GitHub token must be able to read pull request metadata and diffs from the target repositories. For private repos, the token must have repo access. GitHub API failures, authentication issues, and rate limits are surfaced as honest user-facing errors.

## Notion permissions

The Notion integration requires access to the database that stores engineering standards or ADRs. The server queries the configured database, paginates through results, and ranks pages by relevance before sending the model only the best context.

## Local development

```bash
npm install
npm run dev
```

The frontend runs at `http://localhost:5173` in Vite dev mode and the backend is served through the Express app on `http://localhost:3000`.

## Production build

```bash
npm run build
npm run preview
```

## API endpoints

- `GET /api/health` — health check
- `POST /api/review-pr` — accepts `{ "prUrl": "https://github.com/owner/repo/pull/123" }` and returns the review result JSON

The returned JSON includes:

- `summary`
- `findings[]` with severity, file path, line number when supported, evidence quote, source URL, recommendation, and evidence_backed flag
- `triage_score` (a prioritization score for triage, not a defect probability)
- `knowledge_gaps[]`
- `evidence[]` from Notion pages

## Security notes

- Secrets stay server-side and are never exposed to the browser.
- Request bodies are validated with Zod.
- Only GitHub PR URLs matching the GitHub host and `/owner/repo/pull/number` pattern are accepted.
- CORS is restricted to configured local origins by default.
- Rate limiting and JSON body size limits are enabled for the review endpoint.
- Raw secrets and full sensitive diff payloads are not logged.

## Model and review behavior

The server uses one LLM provider through a server-side adapter. The default implementation uses Google Gemini. The LLM prompt asks for structured JSON output and the result is schema validated before it reaches the UI.

Evidence-backed findings are clearly labeled. If the diff and retrieved Notion evidence do not support a concern, the backend returns an empty findings list and documents the knowledge gap instead of inventing citations or line numbers.

## Triage score

The `triage_score` is a transparent heuristic used for human prioritization. It is computed from the severity-weighted findings and is labeled as a triage score, not a probability of defects.

## Limitations

- Real LLM output depends on valid provider credentials and the quality of the Notion database content.
- GitHub or Notion API access must be configured in the local environment.
- Live external API verification requires credentials and network access.

## Deployment notes

For deployment, set the environment variables above in the hosting environment, expose the app on a trusted host, and keep `ALLOWED_ORIGINS` restricted to the deployed frontend domain. Avoid committing real credentials or tokens to source control.
