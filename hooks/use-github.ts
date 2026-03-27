"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import type { Repository } from "@/lib/types";

function encodeBase64Utf8(content: string) {
  const bytes = new TextEncoder().encode(content);
  let binaryString = "";

  for (let index = 0; index < bytes.length; index += 1) {
    binaryString += String.fromCharCode(bytes[index]);
  }

  return btoa(binaryString);
}

function encodeArrayBufferToBase64(arrayBuffer: ArrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binaryString = "";

  for (let index = 0; index < bytes.length; index += 1) {
    binaryString += String.fromCharCode(bytes[index]);
  }

  return btoa(binaryString);
}

export function useGitHub() {
  const { data: session } = useSession();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(false);

  const accessToken = session?.accessToken;

  const fetchRepositories = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);

    try {
      const response = await fetch(
        "https://api.github.com/user/repos?sort=updated&per_page=100",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
          cache: "no-store",
        }
      );

      if (response.ok) {
        const data = await response.json();
        setRepos(data);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        console.error("Failed to fetch repositories:", error);
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  const fetchFileContent = useCallback(async (owner: string, repo: string, path: string) => {
    if (!accessToken) return null;
    try {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        const binaryString = atob(data.content.replace(/\n/g, ""));
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return new TextDecoder().decode(bytes);
      }
    } catch (error) {
      console.error("Failed to fetch file:", error);
    }
    return null;
  }, [accessToken]);

  const createOrUpdateFile = useCallback(async (
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    sha?: string
  ): Promise<{ success: boolean; sha?: string }> => {
    if (!accessToken) return { success: false };
    try {
      const base64 = encodeBase64Utf8(content);

      const body: { message: string; content: string; sha?: string } = {
        message,
        content: base64,
      };
      if (sha) body.sha = sha;

      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );
      if (response.ok) {
        const data = await response.json();
        return { success: true, sha: data.content?.sha };
      }
      return { success: false };
    } catch (error) {
      console.error("Failed to update file:", error);
      return { success: false };
    }
  }, [accessToken]);

  const uploadFile = useCallback(async (
    owner: string,
    repo: string,
    path: string,
    file: File,
    message: string
  ) => {
    if (!accessToken) return null;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = encodeArrayBufferToBase64(arrayBuffer);

      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message,
            content: base64,
          }),
        }
      );
      if (response.ok) {
        const data = await response.json();
        return data.content.download_url;
      }
    } catch (error) {
      console.error("Failed to upload file:", error);
    }
    return null;
  }, [accessToken]);

  const deleteFile = useCallback(async (
    owner: string,
    repo: string,
    path: string,
    message: string,
    sha: string
  ): Promise<boolean> => {
    if (!accessToken) return false;
    try {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message, sha }),
        }
      );
      return response.ok;
    } catch (error) {
      console.error("Failed to delete file:", error);
      return false;
    }
  }, [accessToken]);

  const getDefaultBranch = useCallback(async (owner: string, repo: string) => {
    if (!accessToken) return null;

    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return (data.default_branch as string | undefined) ?? null;
    } catch (error) {
      console.error("Failed to fetch repository info:", error);
      return null;
    }
  }, [accessToken]);

  const createBranch = useCallback(async (
    owner: string,
    repo: string,
    branchName: string,
    fromBranch?: string
  ) => {
    if (!accessToken) return { success: false };

    try {
      const baseBranch = fromBranch ?? await getDefaultBranch(owner, repo);
      if (!baseBranch) {
        return { success: false };
      }

      const refResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (!refResponse.ok) {
        return { success: false };
      }

      const refData = await refResponse.json();
      const sha = refData.object?.sha as string | undefined;

      if (!sha) {
        return { success: false };
      }

      const createResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/refs`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ref: `refs/heads/${branchName}`,
            sha,
          }),
        }
      );

      if (createResponse.ok) {
        return { success: true, branch: branchName };
      }

      if (createResponse.status === 422) {
        return { success: true, branch: branchName, alreadyExists: true };
      }

      return { success: false };
    } catch (error) {
      console.error("Failed to create branch:", error);
      return { success: false };
    }
  }, [accessToken, getDefaultBranch]);

  const createOrUpdateFileOnBranch = useCallback(async (
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch: string,
    sha?: string
  ): Promise<{ success: boolean; sha?: string }> => {
    if (!accessToken) return { success: false };

    try {
      const base64 = encodeBase64Utf8(content);
      const body: { message: string; content: string; branch: string; sha?: string } = {
        message,
        content: base64,
        branch,
      };

      if (sha) {
        body.sha = sha;
      }

      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        return { success: false };
      }

      const data = await response.json();
      return { success: true, sha: data.content?.sha };
    } catch (error) {
      console.error("Failed to update file on branch:", error);
      return { success: false };
    }
  }, [accessToken]);

  const createPullRequest = useCallback(async (
    owner: string,
    repo: string,
    title: string,
    head: string,
    body?: string
  ): Promise<{ success: boolean; url?: string; alreadyExists?: boolean }> => {
    if (!accessToken) return { success: false };

    try {
      const base = await getDefaultBranch(owner, repo);
      if (!base) {
        return { success: false };
      }

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          head,
          base,
          body,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return { success: true, url: data.html_url as string | undefined };
      }

      if (response.status === 422) {
        const existingResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&head=${owner}:${head}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/vnd.github.v3+json",
            },
          }
        );

        if (existingResponse.ok) {
          const pulls = await existingResponse.json();
          const existingPull = pulls[0] as { html_url?: string } | undefined;
          if (existingPull?.html_url) {
            return { success: true, url: existingPull.html_url, alreadyExists: true };
          }
        }
      }

      return { success: false };
    } catch (error) {
      console.error("Failed to create pull request:", error);
      return { success: false };
    }
  }, [accessToken, getDefaultBranch]);

  useEffect(() => {
    if (accessToken) {
      fetchRepositories();
    }
  }, [accessToken, fetchRepositories]);

  return {
    repos,
    loading,
    fetchRepositories,
    fetchFileContent,
    createOrUpdateFile,
    createOrUpdateFileOnBranch,
    createBranch,
    createPullRequest,
    uploadFile,
    deleteFile,
    getDefaultBranch,
  };
}
