import matter from "gray-matter";

import type { Post } from "@/lib/types";

interface GitHubTreeItem {
  path?: string;
  sha?: string;
  type?: string;
}

interface GitHubContentFile {
  path: string;
  sha: string;
  type: string;
}

interface GitHubFileResponse {
  content?: string;
  sha?: string;
}

interface GitHubTreeResponse {
  tree?: unknown[];
}

interface PostCacheEntry {
  posts: Post[];
  postsByPath: Map<string, Post>;
}

const postCache = new Map<string, PostCacheEntry>();

function getCacheKey(owner: string, repo: string) {
  return `${owner}/${repo}`;
}

function decodeBase64Utf8(content: string) {
  const normalized = content.replace(/\n/g, "");
  const binaryString = atob(normalized);
  const bytes = new Uint8Array(binaryString.length);

  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

function normalizeDate(value: unknown, fallback: string) {
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
    return fallback;
  }

  return value;
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((tag): tag is string => typeof tag === "string");
}

function isGitHubContentFile(item: GitHubTreeItem): item is GitHubContentFile {
  return (
    item.type === "blob" &&
    typeof item.path === "string" &&
    typeof item.sha === "string" &&
    item.path.startsWith("posts/") &&
    /\.(md|mdx)$/.test(item.path)
  );
}

function getFileName(path: string) {
  return path.split("/").pop() ?? path;
}

function sortPostsByDate(posts: Post[]) {
  return [...posts].sort((left, right) => {
    const leftTime = new Date(left.date).getTime();
    const rightTime = new Date(right.date).getTime();

    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }

    return left.slug.localeCompare(right.slug);
  });
}

function updateCache(owner: string, repo: string, posts: Post[]) {
  postCache.set(getCacheKey(owner, repo), {
    posts: sortPostsByDate(posts),
    postsByPath: new Map(posts.map((post) => [post.path ?? post.slug, post])),
  });
}

export function getCachedPosts(owner: string, repo: string) {
  return postCache.get(getCacheKey(owner, repo))?.posts ?? null;
}

export function getCachedPostByPath(owner: string, repo: string, path: string) {
  return postCache.get(getCacheKey(owner, repo))?.postsByPath.get(path) ?? null;
}

export function upsertCachedPost(owner: string, repo: string, post: Post, previousPath?: string | null) {
  const cacheKey = getCacheKey(owner, repo);
  const currentCache = postCache.get(cacheKey);

  if (!currentCache) {
    updateCache(owner, repo, [post]);
    return;
  }

  const nextPosts = currentCache.posts.filter(
    (currentPost) =>
      currentPost.path !== post.path &&
      currentPost.path !== previousPath &&
      currentPost.slug !== post.slug
  );

  nextPosts.push(post);
  updateCache(owner, repo, nextPosts);
}

export function removeCachedPost(owner: string, repo: string, path: string) {
  const cacheKey = getCacheKey(owner, repo);
  const currentCache = postCache.get(cacheKey);

  if (!currentCache) {
    return;
  }

  updateCache(
    owner,
    repo,
    currentCache.posts.filter((post) => post.path !== path)
  );
}

export function parsePostFile(path: string, content: string, sha?: string): Post {
  const parsed = matter(content);
  const fileName = getFileName(path);
  const slug = fileName.replace(/\.(md|mdx)$/, "");
  const fallbackDate = new Date().toISOString().split("T")[0];

  return {
    slug,
    title: typeof parsed.data.title === "string" ? parsed.data.title : fileName,
    date: normalizeDate(parsed.data.date, fallbackDate),
    description:
      typeof parsed.data.description === "string" ? parsed.data.description : "",
    tags: normalizeTags(parsed.data.tags),
    audio: typeof parsed.data.audio === "string" ? parsed.data.audio : undefined,
    content: parsed.content,
    modified: false,
    sha,
    path,
  };
}

export async function fetchPostsIndex(
  owner: string,
  repo: string,
  accessToken: string,
  signal?: AbortSignal,
  forceRefresh = false
): Promise<Post[]> {
  const cachedPosts = !forceRefresh ? getCachedPosts(owner, repo) : null;
  if (cachedPosts) {
    return cachedPosts;
  }

  const treeResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
      signal,
      cache: "no-store",
    }
  );

  if (treeResponse.status === 404) {
    updateCache(owner, repo, []);
    return [];
  }

  if (!treeResponse.ok) {
    throw new Error(`Failed to load repository tree: ${treeResponse.status}`);
  }

  const data = (await treeResponse.json()) as GitHubTreeResponse;
  const tree = (Array.isArray(data.tree) ? data.tree : []) as GitHubTreeItem[];
  const files = tree.filter(isGitHubContentFile);

  const posts = await Promise.all(
    files.map(async (file) => {
      const post = await fetchPostByPath(
        owner,
        repo,
        file.path,
        accessToken,
        signal,
        forceRefresh
      );

      return post;
    })
  );

  const hydratedPosts = posts.filter((post): post is Post => post !== null);
  updateCache(owner, repo, hydratedPosts);

  return getCachedPosts(owner, repo) ?? [];
}

export async function fetchPostByPath(
  owner: string,
  repo: string,
  path: string,
  accessToken: string,
  signal?: AbortSignal,
  forceRefresh = false
): Promise<Post | null> {
  const cachedPost = !forceRefresh ? getCachedPostByPath(owner, repo, path) : null;
  if (cachedPost) {
    return cachedPost;
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
      signal,
      cache: "no-store",
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to load file: ${response.status}`);
  }

  const data = (await response.json()) as GitHubFileResponse;

  if (!data.content) {
    return null;
  }

  const post = parsePostFile(path, decodeBase64Utf8(data.content), data.sha);
  upsertCachedPost(owner, repo, post);

  return post;
}
