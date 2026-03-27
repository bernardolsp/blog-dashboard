"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { useGitHub } from "@/hooks/use-github";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Notification } from "@/components/notification";
import { useNotification } from "@/hooks/use-notification";
import { listDrafts } from "@/lib/draft-storage";
import { fetchPostsIndex, getCachedPosts } from "@/lib/github-posts";
import type { Post } from "@/lib/types";
import {
  FileText,
  Plus,
  Calendar,
  LogOut,
  FolderOpen,
  Loader2,
  GitBranch,
  Cloud,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function PostsList() {
  const params = useParams<{ owner: string; name: string }>();
  const router = useRouter();
  const { data: session, status } = useSession();
  const { listBranches, getDefaultBranch } = useGitHub();
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [draftPaths, setDraftPaths] = useState<Set<string>>(new Set());
  const [branches, setBranches] = useState<Array<{ name: string; commit: { sha: string } }>>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const { notification, showNotification } = useNotification();

  const owner = params.owner;
  const name = params.name;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [router, status]);

  useEffect(() => {
    const cachedPosts = getCachedPosts(owner, name);
    if (cachedPosts) {
      setPosts(cachedPosts);
      setIsLoading(false);
    }
  }, [owner, name]);

  useEffect(() => {
    let cancelled = false;

    const syncDrafts = async () => {
      try {
        const drafts = await listDrafts(owner, name);
        if (cancelled) {
          return;
        }

        setDraftPaths(new Set(
          drafts
            .map((draft) => draft.post.path)
            .filter((path): path is string => typeof path === "string")
        ));
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to list drafts:", error);
        }
      }
    };

    void syncDrafts();
    window.addEventListener("focus", syncDrafts);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", syncDrafts);
    };
  }, [owner, name]);

  const loadPosts = useCallback(
    async (signal?: AbortSignal) => {
      if (!session?.accessToken) {
        return;
      }

      setIsLoading(true);

      try {
        const postsList = await fetchPostsIndex(
          owner,
          name,
          session.accessToken,
          signal
        );
        setPosts(postsList);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error("Failed to load posts:", error);
        showNotification("Erro ao carregar posts", "error");
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [session?.accessToken, owner, name, showNotification]
  );

  useEffect(() => {
    if (!session?.accessToken) {
      return;
    }

    const controller = new AbortController();
    void loadPosts(controller.signal);

    return () => controller.abort();
  }, [session?.accessToken, loadPosts]);

  useEffect(() => {
    const loadBranches = async () => {
      if (!session?.accessToken) return;
      
      setIsLoadingBranches(true);
      try {
        const branchList = await listBranches(owner, name);
        setBranches(branchList);
        
        // Set default branch as selected if no branch is currently selected
        const defaultBranch = await getDefaultBranch(owner, name);
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
  }, [session?.accessToken, owner, name, listBranches, getDefaultBranch, selectedBranch]);

  const createNewPost = () => {
    router.push(`/repo/${owner}/${name}/new`);
  };

  const openPost = (post: Post) => {
    router.push(`/repo/${owner}/${name}/${post.slug}`);
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
              <h1 className="text-lg font-semibold text-gradient truncate">{name}</h1>
              <p className="text-xs text-muted-foreground truncate">
                {owner}/{name}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={createNewPost}
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
            {isLoading ? (
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
            ) : posts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">Nenhum post encontrado</p>
                <p className="text-xs mt-1">Crie um novo post para comecar</p>
              </div>
            ) : (
              posts.map((post, index) => {
                const hasLocalDraft = post.path ? draftPaths.has(post.path) : false;

                return (
                  <button
                    key={post.path ?? post.slug}
                    onClick={() => openPost(post)}
                    className="w-full text-left p-4 rounded-lg border bg-card/50 border-border hover:border-amber-500/20 hover:bg-card transition-all duration-200 group animate-fade-in"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex items-start justify-between mb-2 gap-2">
                      <h3 className="font-medium text-sm line-clamp-1 pr-2 min-w-0 flex-1">
                        {post.title}
                      </h3>
                      <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end max-w-[45%]">
                        {hasLocalDraft && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400 whitespace-nowrap">
                            <Cloud size={10} />
                            Draft
                          </span>
                        )}
                        {post.branch && (
                          <span 
                            className="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-300 max-w-full"
                            title={post.branch}
                          >
                            <GitBranch size={10} className="shrink-0" />
                            <span className="truncate">{post.branch}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                      {post.description || "Sem descricao"}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
                      <Calendar size={12} />
                      {post.date ? (
                        format(new Date(post.date), "dd MMM yyyy", { locale: ptBR })
                      ) : (
                        <span>Sem data</span>
                      )}
                      {post.tags.length > 0 && (
                        <div className="flex gap-1 ml-auto">
                          {post.tags.slice(0, 2).map((tag) => (
                            <Badge
                              key={tag}
                              variant="outline"
                              className="text-[10px] px-1.5 py-0"
                            >
                              {tag}
                            </Badge>
                          ))}
                          {post.tags.length > 2 && (
                            <span className="text-[10px]">+{post.tags.length - 2}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
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

      <main className="flex-1 flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-6">
            <FileText size={40} className="text-amber-500/50" />
          </div>
          <h2 className="text-xl font-medium text-muted-foreground mb-2">
            Nenhum post selecionado
          </h2>
          <p className="text-sm text-muted-foreground/70 mb-6">
            Selecione um post na lista ou crie um novo
          </p>
          <Button
            onClick={createNewPost}
            className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30"
          >
            <Plus size={16} className="mr-2" />
            Criar Novo Post
          </Button>
        </div>
      </main>
    </div>
  );
}
