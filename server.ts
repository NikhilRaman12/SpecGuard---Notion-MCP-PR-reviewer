import express from "express";
import { createServer as createViteServer } from "vite";
import { Client } from "@notionhq/client";
import { Octokit } from "octokit";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Notion Client
  const notion = new Client({
    auth: process.env.NOTION_API_KEY,
  });

  // GitHub Client
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });

  // API Routes
  app.get("/api/notion/decisions", async (req, res) => {
    try {
      const databaseId = process.env.NOTION_DATABASE_ID;
      if (!databaseId || !process.env.NOTION_API_KEY) {
        return res.status(400).json({ 
          error: "Notion configuration missing. Please set NOTION_API_KEY and NOTION_DATABASE_ID." 
        });
      }

      const response = await (notion as any).databases.query({
        database_id: databaseId,
      });

      const decisions = response.results.map((page: any) => {
        // Extracting title and excerpt - assuming common naming conventions
        const titleProp = page.properties.Title || page.properties.Name || Object.values(page.properties).find((p: any) => p.type === 'title');
        const excerptProp = page.properties.Excerpt || page.properties.Description || Object.values(page.properties).find((p: any) => p.type === 'rich_text');

        const title = titleProp?.title?.[0]?.plain_text || "Untitled Document";
        const excerpt = excerptProp?.rich_text?.[0]?.plain_text || "No content available.";

        return { title, excerpt };
      });

      res.json(decisions);
    } catch (error: any) {
      console.error("Notion API Error Details:", {
        message: error.message,
        code: error.code,
        status: error.status,
      });

      let userMessage = "Failed to fetch from Notion.";
      if (error.code === "object_not_found") {
        userMessage = "Notion database not found. Please check your NOTION_DATABASE_ID.";
      } else if (error.status === 401) {
        userMessage = "Invalid Notion API Key. Please check your NOTION_API_KEY.";
      } else if (error.status === 403) {
        userMessage = "Access denied to Notion database. Ensure your integration has access.";
      }

      res.status(error.status || 500).json({ error: userMessage, details: error.message });
    }
  });

  app.post("/api/github/pr", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "GitHub PR URL is required." });
      }

      // Parse GitHub URL: https://github.com/:owner/:repo/pull/:number
      const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
      if (!match) {
        return res.status(400).json({ error: "Invalid GitHub PR URL format." });
      }

      const [_, owner, repo, pull_number] = match;

      // Fetch PR Details
      const { data: pr } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: parseInt(pull_number),
      });

      // Fetch PR Diff
      const { data: diff } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: parseInt(pull_number),
        headers: {
          accept: "application/vnd.github.v3.diff",
        },
      });

      res.json({
        title: pr.title,
        description: pr.body || "",
        diff: typeof diff === "string" ? diff : "Could not fetch diff.",
      });
    } catch (error: any) {
      console.error("GitHub API Error Details:", {
        message: error.message,
        status: error.status,
      });

      let userMessage = "Failed to fetch from GitHub.";
      if (error.status === 404) {
        userMessage = "GitHub Pull Request not found. Ensure the URL is correct and the repository is accessible.";
      } else if (error.status === 401) {
        userMessage = "Invalid GitHub Token. Please check your GITHUB_TOKEN.";
      } else if (error.status === 403) {
        userMessage = "GitHub API rate limit exceeded or access denied.";
      }

      res.status(error.status || 500).json({ error: userMessage, details: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
