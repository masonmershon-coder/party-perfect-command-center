import type { DashboardExport } from "./types";

interface GitHubExportOptions {
  repo: string;
  branch?: string;
  message?: string;
  payload: DashboardExport;
  token: string;
}

interface GitHubContentItem {
  path: string;
  content: string;
}

function encodeContent(content: string) {
  return Buffer.from(content, "utf8").toString("base64");
}

async function githubRequest<T>(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `GitHub API error (${response.status}): ${errorText || response.statusText}`,
    );
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

async function getFileSha(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  token: string,
) {
  try {
    const data = await githubRequest<{ sha: string }>(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`,
      token,
    );
    return data.sha;
  } catch {
    return undefined;
  }
}

export async function exportDashboardToGitHub(options: GitHubExportOptions) {
  const [owner, repoName] = options.repo.split("/");

  if (!owner || !repoName) {
    throw new Error("Repository must be in owner/repo format.");
  }

  const branch = options.branch ?? "main";
  const token = options.token;
  const timestamp = options.payload.exportedAt.replace(/[:.]/g, "-");
  const basePath = `grok-dashboard/${timestamp}`;

  const files: GitHubContentItem[] = [
    {
      path: `${basePath}/dashboard.json`,
      content: JSON.stringify(options.payload, null, 2),
    },
    {
      path: `${basePath}/agents.json`,
      content: JSON.stringify(options.payload.agents, null, 2),
    },
    {
      path: `${basePath}/tasks.json`,
      content: JSON.stringify(options.payload.tasks, null, 2),
    },
    ...options.payload.conversations.map((conversation) => ({
      path: `${basePath}/conversations/${conversation.agentId}.json`,
      content: JSON.stringify(conversation, null, 2),
    })),
  ];

  const commitMessage =
    options.message ??
    `Export Grok dashboard snapshot (${options.payload.agents.length} agents)`;

  for (const file of files) {
    const sha = await getFileSha(owner, repoName, branch, file.path, token);

    await githubRequest(
      `https://api.github.com/repos/${owner}/${repoName}/contents/${encodeURIComponent(file.path)}`,
      token,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: commitMessage,
          content: encodeContent(file.content),
          branch,
          ...(sha ? { sha } : {}),
        }),
      },
    );
  }

  return {
    repo: options.repo,
    branch,
    path: basePath,
    fileCount: files.length,
    url: `https://github.com/${owner}/${repoName}/tree/${branch}/${basePath}`,
  };
}
