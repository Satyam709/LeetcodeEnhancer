import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { extract } from "tar";
import { WINDOW_FILES } from "./windows";

export const REPO = "liquidslr/leetcode-company-wise-problems";

const DEFAULT_TARBALL_URL = `https://codeload.github.com/${REPO}/tar.gz/refs/heads/main`;
const COMMITS_API = `https://api.github.com/repos/${REPO}/commits/main`;

export interface SourceResult {
  dir: string;
  commitSha: string;
  commitDate: string;
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Local path: used as-is (dev/tests), metadata falls back to sentinel values.
 * Otherwise: download the repo tarball, extract it, and best-effort query the
 * GitHub API for the latest commit (network/API failure never fails the sync).
 */
export async function fetchSource(opts: {
  localPath?: string;
  tarballUrl?: string;
}): Promise<SourceResult> {
  if (opts.localPath) {
    return { dir: opts.localPath, commitSha: "unknown", commitDate: today() };
  }

  const url = opts.tarballUrl ?? DEFAULT_TARBALL_URL;
  const workDir = await mkdtemp(path.join(tmpdir(), "lce-source-"));
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `failed to download source tarball: HTTP ${res.status} from ${url}`
    );
  }
  const tarballPath = path.join(workDir, "source.tar.gz");
  await writeFile(tarballPath, Buffer.from(await res.arrayBuffer()));

  const extractDir = path.join(workDir, "extract");
  await mkdir(extractDir, { recursive: true });
  await extract({ file: tarballPath, cwd: extractDir });
  const [root] = await readdir(extractDir);
  if (!root) throw new Error("source tarball extracted to an empty directory");

  let commitSha = "unknown";
  let commitDate = today();
  try {
    const api = await fetch(COMMITS_API, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "leetcode-enhancer-data-sync",
      },
    });
    if (api.ok) {
      const json = (await api.json()) as {
        sha?: string;
        commit?: { committer?: { date?: string } };
      };
      if (json.sha) commitSha = json.sha;
      const date = json.commit?.committer?.date;
      if (date) commitDate = date.slice(0, 10);
    }
  } catch {
    // best-effort only
  }

  return { dir: path.join(extractDir, root), commitSha, commitDate };
}

/** Company folder names (sorted) that contain all five window files. */
export async function discoverCompanies(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const files = new Set(await readdir(path.join(dir, entry.name)));
    if (WINDOW_FILES.every((w) => files.has(w.file))) names.push(entry.name);
  }
  return names.sort();
}
