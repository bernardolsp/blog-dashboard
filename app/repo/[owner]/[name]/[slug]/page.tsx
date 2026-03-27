"use client";

import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { useSession, signOut } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useGitHub } from "@/hooks/use-github";
import { useNotification } from "@/hooks/use-notification";
import { usePostDraft } from "@/hooks/use-post-draft";
import {
  fetchPostByPath,
  fetchPostsIndex,
  getCachedPostByPath,
  getCachedPosts,
  removeCachedPost,
  upsertCachedPost,
} from "@/lib/github-posts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Notification } from "@/components/notification";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listDrafts } from "@/lib/draft-storage";
import type { Post } from "@/lib/types";
import {
  FileText,
  Plus,
  Save,
  Music,
  Image as ImageIcon,
  Eye,
  Trash2,
  Calendar,
  FileCode,
  LogOut,
  FolderOpen,
  Loader2,
  ArrowLeft,
  X,
  GitBranch,
  Cloud,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import matter from "gray-matter";

const MDXEditor = lazy(() => import("@/components/mdx-editor"));

function buildEmptyPost() {
  const timestamp = Date.now();
  const slug = `novo-post-${timestamp}`;

  return {
    slug,
    title: "Novo Post",
    date: new Date().toISOString().split("T")[0],
    description: "",
    tags: [],
    content: "# Novo Post\n\nComece a escrever...",
    modified: true,
    path: `posts/${slug}.md`,
  } satisfies Post;
}

function sanitizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .replace(/-+/g, "-");
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export default function PostEditor() {
  const params = useParams<{ owner: string; name: string; slug: string }>();
  const router = useRouter();
  const { data: session, status } = useSession();
  const {
    createOrUpdateFile,
    createOrUpdateFileOnBranch,
    uploadFile,
    deleteFile,
    createBranch,
    createPullRequest,
    listBranches,
    getDefaultBranch,
  } = useGitHub();
  const { notification, showNotification } = useNotification();

  const owner = params.owner;
  const repoName = params.name;
  const slug = params.slug;
  const isNew = slug === "new";

  const [post, setPost] = useState<Post | null>(null);
  const [originalPath, setOriginalPath] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeTab, setActiveTab] = useState("editor");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showBranchDialog, setShowBranchDialog] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [isSavingBranch, setIsSavingBranch] = useState(false);
  const [isCreatingPr, setIsCreatingPr] = useState(false);
  const [draftPaths, setDraftPaths] = useState<Set<string>>(new Set());
  const [branches, setBranches] = useState<Array<{ name: string; commit: { sha: string } }>>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [router, status]);

  useEffect(() => {
    const cachedPosts = getCachedPosts(owner, repoName);
    if (cachedPosts) {
      setPosts(cachedPosts);
    }

    if (!isNew) {
      const cachedPost = getCachedPostByPath(owner, repoName, `posts/${slug}.md`)
        ?? getCachedPostByPath(owner, repoName, `posts/${slug}.mdx`);

      if (cachedPost) {
        setPost(cachedPost);
        setOriginalPath(cachedPost.path ?? null);
      }
    }
  }, [owner, repoName, slug, isNew]);

  const refreshDraftPaths = useCallback(async () => {
    try {
      const drafts = await listDrafts(owner, repoName);
      setDraftPaths(new Set(
        drafts
          .map((draft) => draft.post.path)
          .filter((path): path is string => typeof path === "string")
      ));
    } catch (error) {
      console.error("Failed to refresh draft paths:", error);
    }
  }, [owner, repoName]);

  useEffect(() => {
    void refreshDraftPaths();
  }, [refreshDraftPaths]);

  useEffect(() => {
    const loadBranches = async () => {
      if (!session?.accessToken) return;
      
      setIsLoadingBranches(true);
      try {
        const branchList = await listBranches(owner, repoName);
        setBranches(branchList);
        
        // Set default branch as selected if no branch is currently selected
        const defaultBranch = await getDefaultBranch(owner, repoName);
        if (defaultBranch && !selectedBranch) {
          setSelectedBranch(defaultBranch);
        }
      } catch (error) {
        console.error("Failed to load branches:", error);
      } finally {
        setIsLoadingBranches(false);
      }
    };

    void loadBranches();
  }, [session?.accessToken, owner, repoName, listBranches, getDefaultBranch, selectedBranch]);

  const sourceUpdatedAt = useMemo(() => post?.sha ?? post?.path ?? null, [post?.path, post?.sha]);

  const { status: draftStatus, hasDraft, draftSavedAt, clearDraft } = usePostDraft({
    owner,
    repo: repoName,
    postKey: isNew ? `new:${slug}` : originalPath ?? `posts/${slug}.md`,
    post,
    enabled: status === "authenticated" && Boolean(post),
    sourceUpdatedAt: sourceUpdatedAt ?? undefined,
    onRestore: (draftPost: Post) => {
      setPost({
        ...draftPost,
        modified: true,
      });

      if (draftPost.path) {
        setOriginalPath(draftPost.path);
      }

      showNotification("Draft local restaurado", "success");
    },
  });

  const loadPosts = useCallback(
    async (signal?: AbortSignal) => {
      if (!session?.accessToken) {
        return;
      }

      try {
        const postsList = await fetchPostsIndex(
          owner,
          repoName,
          session.accessToken,
          signal
        );
        setPosts(postsList);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error("Error loading sidebar posts:", error);
        showNotification("Erro ao carregar posts", "error");
      }
    },
    [session?.accessToken, owner, repoName, showNotification]
  );

  const loadCurrentPost = useCallback(
    async (signal?: AbortSignal) => {
      if (isNew) {
        const emptyPost = buildEmptyPost();
        setPost(emptyPost);
        setOriginalPath(null);
        return;
      }

      if (!session?.accessToken) {
        return;
      }

      try {
        const possiblePaths = [`posts/${slug}.md`, `posts/${slug}.mdx`];

        for (const path of possiblePaths) {
          const loadedPost = await fetchPostByPath(
            owner,
            repoName,
            path,
            session.accessToken,
            signal
          );

          if (loadedPost) {
            setPost(loadedPost);
            setOriginalPath(path);
            return;
          }
        }

        showNotification("Post nao encontrado", "error");
        router.replace(`/repo/${owner}/${repoName}`);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error("Failed to load post:", error);
        showNotification("Erro ao carregar post", "error");
      } finally {
        // no-op: layout keeps rendering while data streams in
      }
    },
    [session?.accessToken, owner, repoName, slug, isNew, router, showNotification]
  );

  useEffect(() => {
    if (!session?.accessToken) {
      return;
    }

    const controller = new AbortController();
    void Promise.all([
      loadCurrentPost(controller.signal),
      loadPosts(controller.signal),
    ]);

    return () => controller.abort();
  }, [session?.accessToken, loadCurrentPost, loadPosts]);

  const updatePost = useCallback((updates: Partial<Post>) => {
    setPost((currentPost) => {
      if (!currentPost) {
        return currentPost;
      }

      return {
        ...currentPost,
        ...updates,
        modified: true,
      };
    });
  }, []);

  const previewDate = useMemo(() => {
    if (!post?.date) {
      return null;
    }

    const parsedDate = new Date(post.date);
    if (Number.isNaN(parsedDate.getTime())) {
      return null;
    }

    return parsedDate;
  }, [post?.date]);

  const savePost = async () => {
    if (!post) {
      return;
    }

    const sanitizedSlug = sanitizeSlug(post.slug);
    if (!sanitizedSlug) {
      showNotification("Defina um slug valido antes de salvar", "error");
      return;
    }

    setIsSaving(true);

    try {
      const frontmatter: Record<string, unknown> = {
        title: post.title,
        date: post.date,
        description: post.description,
      };

      if (post.tags.length > 0) {
        frontmatter.tags = post.tags;
      }

      if (post.audio) {
        frontmatter.audio = post.audio;
      }

      const content = matter.stringify(post.content, frontmatter);
      const targetPath = `posts/${sanitizedSlug}.md`;
      const currentPath = originalPath ?? targetPath;
      const isRename = Boolean(post.sha && originalPath && originalPath !== targetPath);

      const result = await createOrUpdateFile(
        owner,
        repoName,
        targetPath,
        content,
        post.sha ? `Update ${post.title}` : `Create ${post.title}`,
        isRename ? undefined : post.sha
      );

      if (!result.success) {
        showNotification("Erro ao salvar post", "error");
        return;
      }

      if (isRename && post.sha) {
        const deletedOriginal = await deleteFile(
          owner,
          repoName,
          currentPath,
          `Rename ${post.title}`,
          post.sha
        );

        if (!deletedOriginal) {
          showNotification(
            "Post salvo, mas o arquivo antigo nao foi removido",
            "error"
          );
        }
      }

      const updatedPost: Post = {
        ...post,
        slug: sanitizedSlug,
        modified: false,
        path: targetPath,
        sha: result.sha || post.sha,
      };

      setPost(updatedPost);
      setOriginalPath(targetPath);
      upsertCachedPost(owner, repoName, updatedPost, currentPath);
      await clearDraft();
      await refreshDraftPaths();
      showNotification("Post salvo com sucesso!", "success");
      await loadPosts();

      const destination = `/repo/${owner}/${repoName}/${sanitizedSlug}`;
      if (slug !== sanitizedSlug) {
        router.replace(destination);
      }
    } catch (error) {
      console.error("Failed to save post:", error);
      showNotification("Erro ao salvar post", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const saveWorkingBranch = async () => {
    if (!post) {
      return;
    }

    const sanitizedSlug = sanitizeSlug(post.slug);
    const normalizedBranchName = sanitizeSlug(branchName || `${sanitizedSlug}-draft`);

    if (!sanitizedSlug || !normalizedBranchName) {
      showNotification("Defina um slug e nome de branch validos", "error");
      return;
    }

    setIsSavingBranch(true);

    try {
      const branchResult = await createBranch(owner, repoName, normalizedBranchName);
      if (!branchResult.success) {
        showNotification("Nao foi possivel criar a branch de trabalho", "error");
        return;
      }

      const frontmatter: Record<string, unknown> = {
        title: post.title,
        date: post.date,
        description: post.description,
      };

      if (post.tags.length > 0) {
        frontmatter.tags = post.tags;
      }

      if (post.audio) {
        frontmatter.audio = post.audio;
      }

      const content = matter.stringify(post.content, frontmatter);
      const targetPath = `posts/${sanitizedSlug}.md`;

      const result = await createOrUpdateFileOnBranch(
        owner,
        repoName,
        targetPath,
        content,
        `Working draft: ${post.title}`,
        normalizedBranchName,
        post.sha
      );

      if (!result.success) {
        showNotification("Branch criada, mas o draft nao foi salvo nela", "error");
        return;
      }

      const postWithBranch: Post = {
        ...post,
        branch: normalizedBranchName,
      };

      setPost(postWithBranch);
      upsertCachedPost(owner, repoName, postWithBranch, post.path);
      setBranchName(normalizedBranchName);
      setShowBranchDialog(false);
      showNotification(
        branchResult.alreadyExists
          ? `Draft atualizado na branch ${normalizedBranchName}`
          : `Draft salvo na branch ${normalizedBranchName}`,
        "success"
      );
    } catch (error) {
      console.error("Failed to save working branch:", error);
      showNotification("Erro ao salvar draft em branch", "error");
    } finally {
      setIsSavingBranch(false);
    }
  };

  const discardLocalDraft = async () => {
    await clearDraft();
    await refreshDraftPaths();
    showNotification("Draft local descartado", "success");

    if (isNew) {
      const emptyPost = buildEmptyPost();
      setPost(emptyPost);
      setOriginalPath(null);
      return;
    }

    await loadCurrentPost();
  };

  const openWorkingBranchPullRequest = async () => {
    if (!post?.branch) {
      showNotification("Salve antes em uma working branch", "error");
      return;
    }

    setIsCreatingPr(true);

    try {
      const result = await createPullRequest(
        owner,
        repoName,
        `Draft: ${post.title}`,
        post.branch,
        [
          "## Summary",
          `- Working draft for \`${post.title}\``,
          `- Source post: \`${post.path ?? `posts/${post.slug}.md`}\``,
          "- Created from the dashboard working-branch flow",
        ].join("\n")
      );

      if (!result.success || !result.url) {
        showNotification("Nao foi possivel abrir o pull request", "error");
        return;
      }

      window.open(result.url, "_blank", "noopener,noreferrer");
      showNotification(
        result.alreadyExists ? "PR existente aberta em nova aba" : "PR criado e aberto em nova aba",
        "success"
      );
    } catch (error) {
      console.error("Failed to create pull request:", error);
      showNotification("Erro ao criar pull request", "error");
    } finally {
      setIsCreatingPr(false);
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    type: "audio" | "image"
  ) => {
    const file = event.target.files?.[0];
    if (!file || !post) {
      return;
    }

    setIsSaving(true);

    try {
      const safeFileName = sanitizeFileName(file.name);
      const path = `public/${type}s/${Date.now()}-${safeFileName}`;
      const url = await uploadFile(
        owner,
        repoName,
        path,
        file,
        `Add ${type}: ${safeFileName}`
      );

      if (!url) {
        showNotification("Erro no upload", "error");
        return;
      }

      if (type === "audio") {
        updatePost({ audio: url });
      } else {
        const imageMarkdown = `![${safeFileName}](${url})`;
        setPost((currentPost) => {
          if (!currentPost) {
            return currentPost;
          }

          return {
            ...currentPost,
            content: `${currentPost.content}\n\n${imageMarkdown}`,
            modified: true,
          };
        });
      }

      showNotification(
        `${type === "audio" ? "Audio" : "Imagem"} adicionado!`,
        "success"
      );
    } catch (error) {
      console.error("Upload failed:", error);
      showNotification("Erro no upload", "error");
    } finally {
      event.target.value = "";
      setIsSaving(false);
    }
  };

  const addTag = (tag: string) => {
    const normalizedTag = tag.trim();
    if (!normalizedTag) {
      return;
    }

    setPost((currentPost) => {
      if (!currentPost || currentPost.tags.includes(normalizedTag)) {
        return currentPost;
      }

      return {
        ...currentPost,
        tags: [...currentPost.tags, normalizedTag],
        modified: true,
      };
    });
  };

  const removeTag = (tagToRemove: string) => {
    setPost((currentPost) => {
      if (!currentPost) {
        return currentPost;
      }

      return {
        ...currentPost,
        tags: currentPost.tags.filter((tag) => tag !== tagToRemove),
        modified: true,
      };
    });
  };

  const handleDelete = async () => {
    if (!post?.sha || !post.path) {
      return;
    }

    setIsDeleting(true);

    try {
      const success = await deleteFile(
        owner,
        repoName,
        post.path,
        `Delete ${post.title}`,
        post.sha
      );

      if (success) {
        removeCachedPost(owner, repoName, post.path);
        showNotification("Post excluido com sucesso!", "success");
        router.push(`/repo/${owner}/${repoName}`);
        return;
      }

      showNotification("Erro ao excluir post", "error");
      setConfirmDelete(false);
    } catch (error) {
      console.error("Delete failed:", error);
      showNotification("Erro ao excluir post", "error");
      setConfirmDelete(false);
    } finally {
      setIsDeleting(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (status !== "authenticated") {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex">
      {notification && (
        <Notification message={notification.message} type={notification.type} />
      )}

      <aside className="w-80 border-r border-border bg-card/50 flex flex-col">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center">
              <FileText className="text-amber-500" size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold text-gradient truncate">
                {repoName}
              </h1>
              <p className="text-xs text-muted-foreground truncate">
                {owner}/{repoName}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => router.push(`/repo/${owner}/${repoName}/new`)}
              className="flex-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30"
            >
              <Plus size={16} className="mr-2" />
              Novo Post
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => router.push("/")}
              title="Trocar repositorio"
            >
              <FolderOpen size={16} />
            </Button>
          </div>
        </div>

        <div className="px-4 pt-4 pb-2">
          <label className="text-xs text-muted-foreground mb-2 block flex items-center gap-1">
            <GitBranch size={12} />
            Branch
          </label>
          <Select
            value={selectedBranch}
            onValueChange={setSelectedBranch}
            disabled={isLoadingBranches || branches.length === 0}
          >
            <SelectTrigger className="w-full bg-background/80 border-border/80 text-sm">
              <SelectValue placeholder={isLoadingBranches ? "Carregando..." : "Selecionar branch"} />
            </SelectTrigger>
            <SelectContent className="max-h-[280px]">
              {branches.map((branch) => (
                <SelectItem key={branch.name} value={branch.name} className="text-sm">
                  <div className="flex items-center gap-2">
                    <GitBranch size={12} className="text-muted-foreground" />
                    <span className="truncate">{branch.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            {posts.length === 0 ? (
              Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-border bg-card/50 p-4 animate-pulse"
                >
                  <div className="h-4 w-2/3 rounded bg-muted mb-3" />
                  <div className="h-3 w-full rounded bg-muted/70 mb-2" />
                  <div className="h-3 w-1/3 rounded bg-muted/60" />
                </div>
              ))
            ) : (
              posts.map((listedPost) => (
                <button
                  key={listedPost.path ?? listedPost.slug}
                  onClick={() =>
                    router.push(`/repo/${owner}/${repoName}/${listedPost.slug}`)
                  }
                  className={`w-full text-left p-4 rounded-lg border transition-all duration-200 group ${
                    listedPost.slug === post?.slug
                      ? "bg-amber-500/10 border-amber-500/30"
                      : "bg-card/50 border-border hover:border-amber-500/20 hover:bg-card"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2 gap-2">
                    <h3 className="font-medium text-sm line-clamp-1 pr-2 min-w-0 flex-1">
                      {listedPost.title}
                    </h3>
                    <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end max-w-[45%]">
                      {listedPost.path && draftPaths.has(listedPost.path) && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400 whitespace-nowrap">
                          <Cloud size={10} />
                          Draft
                        </span>
                      )}
                      {listedPost.branch && (
                        <span 
                          className="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-300 max-w-full"
                          title={listedPost.branch}
                        >
                          <GitBranch size={10} className="shrink-0" />
                          <span className="truncate">{listedPost.branch}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                    {listedPost.description || "Sem descricao"}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
                    <Calendar size={12} />
                    {listedPost.date ? (
                      format(new Date(listedPost.date), "dd MMM yyyy", {
                        locale: ptBR,
                      })
                    ) : (
                      <span>Sem data</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center">
              <span className="text-xs font-medium text-amber-500">
                {session.user?.name?.charAt(0) || "U"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{session.user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {session.user?.email}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut size={16} />
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        {post ? (
          <>
          <div className="h-16 border-b border-border flex items-center justify-between px-6 bg-card/50 backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Cloud size={14} className={draftStatus === "saving" ? "animate-pulse text-amber-500" : hasDraft ? "text-amber-500" : ""} />
                <span>
                  {draftStatus === "saving" && "Salvando draft local..."}
                  {draftStatus === "restored" && "Draft local restaurado"}
                  {draftStatus === "saved" && `Draft local salvo${draftSavedAt ? ` as ${format(new Date(draftSavedAt), "HH:mm", { locale: ptBR })}` : ""}`}
                  {draftStatus === "error" && "Erro ao salvar draft local"}
                  {draftStatus === "idle" && (hasDraft ? "Draft local disponivel" : "Sem draft local")}
                </span>
              </div>

              {hasDraft && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void discardLocalDraft()}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Descartar draft local
                </Button>
              )}

              <Tooltip>
                <TooltipTrigger>
                  <span className="inline-flex">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/repo/${owner}/${repoName}`)}
                    >
                      <ArrowLeft size={16} className="mr-2" />
                      Voltar
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Voltar para lista de posts</p>
                </TooltipContent>
              </Tooltip>

              <Separator orientation="vertical" className="h-6" />

              <Tooltip>
                <TooltipTrigger>
                  <span className="inline-flex">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={savePost}
                      disabled={isSaving || !post.modified}
                      className={post.modified ? "text-amber-500" : ""}
                    >
                      <Save size={16} className="mr-2" />
                      {isSaving ? "Salvando..." : "Salvar"}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Salvar no GitHub</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger>
                  <span className="inline-flex">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setBranchName(post.branch ?? `${sanitizeSlug(post.slug)}-draft`);
                        setShowBranchDialog(true);
                      }}
                      disabled={isSavingBranch}
                    >
                      <GitBranch size={16} className="mr-2" />
                      Working branch
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Salvar checkpoint em uma branch separada</p>
                </TooltipContent>
              </Tooltip>

              <Separator orientation="vertical" className="h-6" />

              <Tooltip>
                <TooltipTrigger>
                  <label className="cursor-pointer inline-flex items-center rounded-lg border border-transparent h-7 gap-1 px-2.5 text-[0.8rem] font-medium whitespace-nowrap transition-all hover:bg-muted hover:text-foreground">
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(event) => handleFileUpload(event, "audio")}
                    />
                    <Music size={16} className="mr-2" />
                    Audio
                  </label>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Adicionar audio ao post</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger>
                  <label className="cursor-pointer inline-flex items-center rounded-lg border border-transparent h-7 gap-1 px-2.5 text-[0.8rem] font-medium whitespace-nowrap transition-all hover:bg-muted hover:text-foreground">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => handleFileUpload(event, "image")}
                    />
                    <ImageIcon size={16} className="mr-2" />
                    Imagem
                  </label>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Adicionar imagem ao post</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="flex items-center gap-4">
              {!isNew && post.sha && (
                <>
                  {confirmDelete ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-destructive">Tem certeza?</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="text-destructive hover:bg-destructive/20 hover:text-destructive"
                      >
                        {isDeleting ? (
                          <Loader2 size={14} className="mr-1 animate-spin" />
                        ) : (
                          <Trash2 size={14} className="mr-1" />
                        )}
                        Excluir
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDelete(false)}
                        disabled={isDeleting}
                      >
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger>
                        <span className="inline-flex">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmDelete(true)}
                            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 size={16} />
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Excluir post</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <Separator orientation="vertical" className="h-6" />
                </>
              )}

              {post.branch && (
                <div 
                  className="flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs text-amber-400 max-w-[200px]"
                  title={post.branch}
                >
                  <GitBranch size={12} className="shrink-0" />
                  <span className="font-mono truncate">{post.branch}</span>
                </div>
              )}

              {post.branch && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void openWorkingBranchPullRequest()}
                  disabled={isCreatingPr}
                  className="border-amber-500/20 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                >
                  {isCreatingPr ? "Abrindo PR..." : "Abrir PR"}
                </Button>
              )}

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="bg-muted">
                  <TabsTrigger value="editor" className="gap-2">
                    <FileCode size={14} />
                    Editor
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="gap-2">
                    <Eye size={14} />
                    Preview
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            <Tabs value={activeTab} className="h-full">
              <TabsContent value="editor" className="h-full m-0">
                <div className="h-full flex">
                  <div className="w-80 border-r border-border bg-card/30 p-6 overflow-y-auto">
                    <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                      <FileText size={16} className="text-amber-500" />
                      Metadados
                    </h3>

                    <div className="space-y-4">
                      {post.branch && (
                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                          <div className="flex items-center gap-2 text-sm font-medium text-amber-300">
                            <GitBranch size={14} />
                            Working branch ativa
                          </div>
                          <p className="mt-2 font-mono text-xs text-amber-200/90">{post.branch}</p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Use esta branch para checkpoints remotos e abra um PR quando quiser revisar ou mesclar.
                          </p>
                        </div>
                      )}

                      <div>
                        <label className="text-xs text-muted-foreground mb-2 block">
                          Titulo
                        </label>
                        <Input
                          value={post.title}
                          onChange={(event) =>
                            updatePost({ title: event.target.value })
                          }
                          className="bg-background/80 border-border/80 focus-visible:border-amber-500/50 focus-visible:ring-amber-500/20"
                          placeholder="Titulo do post"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground mb-2 block">
                          Slug
                        </label>
                        <Input
                          value={post.slug}
                          onChange={(event) =>
                            updatePost({ slug: sanitizeSlug(event.target.value) })
                          }
                          className="bg-background/80 border-border/80 focus-visible:border-amber-500/50 focus-visible:ring-amber-500/20 font-mono text-xs"
                          placeholder="slug-do-post"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground mb-2 block">
                          Data
                        </label>
                        <Input
                          type="date"
                          value={post.date}
                          onChange={(event) =>
                            updatePost({ date: event.target.value })
                          }
                          className="bg-background/80 border-border/80 focus-visible:border-amber-500/50 focus-visible:ring-amber-500/20"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground mb-2 block">
                          Descricao
                        </label>
                        <Textarea
                          value={post.description}
                          onChange={(event) =>
                            updatePost({ description: event.target.value })
                          }
                          className="bg-background/80 border-border/80 min-h-[80px] focus-visible:border-amber-500/50 focus-visible:ring-amber-500/20"
                          placeholder="Breve descricao do post"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground mb-2 block">
                          Tags
                        </label>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {post.tags.map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="cursor-pointer bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-destructive/20 hover:text-destructive hover:border-destructive/30 transition-colors"
                              onClick={() => removeTag(tag)}
                            >
                              {tag}
                              <X size={12} className="ml-1" />
                            </Badge>
                          ))}
                        </div>
                        <Input
                          placeholder="Adicionar tag..."
                          className="bg-background/80 border-border/80 focus-visible:border-amber-500/50 focus-visible:ring-amber-500/20"
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              addTag(event.currentTarget.value);
                              event.currentTarget.value = "";
                            }
                          }}
                        />
                      </div>

                      {post.audio && (
                        <div>
                          <label className="text-xs text-muted-foreground mb-2 block">
                            Audio
                          </label>
                          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                            <Music size={16} className="text-amber-500" />
                            <span className="text-sm truncate flex-1">
                              {post.audio.split("/").pop()}
                            </span>
                            <button
                              type="button"
                              onClick={() => updatePost({ audio: undefined })}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 p-6">
                    <Suspense
                      fallback={
                        <div className="h-full rounded-xl border border-border bg-card/40 animate-pulse" />
                      }
                    >
                      <MDXEditor
                        markdown={post.content}
                        onChange={(value) => updatePost({ content: value || "" })}
                        contentEditableClassName="mdxeditor-prose"
                      />
                    </Suspense>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="preview" className="h-full m-0 p-8 overflow-auto">
                <div className="max-w-3xl mx-auto">
                  <article className="prose-editor">
                    <header className="mb-8 text-center">
                      {post.tags.length > 0 && (
                        <div className="flex flex-wrap justify-center gap-2 mb-4">
                          {post.tags.map((tag) => (
                            <Badge
                              key={tag}
                              variant="outline"
                              className="text-amber-500 border-amber-500/30"
                            >
                              #{tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <h1 className="text-4xl font-bold mb-4">{post.title}</h1>
                      <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                        {previewDate && (
                          <span>
                            {format(previewDate, "dd 'de' MMMM 'de' yyyy", {
                              locale: ptBR,
                            })}
                          </span>
                        )}
                        {post.audio && (
                          <>
                            <span>-</span>
                            <span className="flex items-center gap-1 text-amber-500">
                              <Music size={14} />
                              Com audio
                            </span>
                          </>
                        )}
                      </div>
                    </header>
                    <div className="prose prose-invert prose-amber max-w-none">
                      <Markdown remarkPlugins={[remarkGfm]}>{post.content}</Markdown>
                    </div>
                  </article>
                </div>
              </TabsContent>
            </Tabs>
          </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col">
            <div className="h-16 border-b border-border bg-card/50 backdrop-blur-sm" />
            <div className="flex-1 grid place-items-center p-8">
              <div className="w-full max-w-3xl space-y-4 animate-pulse">
                <div className="h-8 w-1/3 rounded bg-muted" />
                <div className="h-4 w-1/4 rounded bg-muted/70" />
                <div className="h-[420px] rounded-xl border border-border bg-card/40" />
              </div>
            </div>
          </div>
        )}
      </main>

      <Dialog open={showBranchDialog} onOpenChange={setShowBranchDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salvar como working branch</DialogTitle>
            <DialogDescription>
              Cria ou reutiliza uma branch para guardar um checkpoint remoto sem publicar direto na branch principal.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="text-sm font-medium">Nome da branch</label>
            <Input
              value={branchName}
              onChange={(event) => setBranchName(sanitizeSlug(event.target.value))}
              placeholder="meu-post-draft"
              className="font-mono text-xs"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBranchDialog(false)} disabled={isSavingBranch}>
              Cancelar
            </Button>
            <Button onClick={saveWorkingBranch} disabled={isSavingBranch}>
              {isSavingBranch ? "Salvando..." : "Salvar branch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
