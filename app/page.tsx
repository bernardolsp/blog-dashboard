"use client";

import { useSession, signOut } from "next-auth/react";
import { useGitHub } from "@/hooks/use-github";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FolderOpen, LogOut, ChevronRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Repository } from "@/lib/types";
import { useEffect } from "react";

export default function RepoSelector() {
  const { status } = useSession();

  const { repos, loading: reposLoading } = useGitHub();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [router, status]);

  const selectRepo = (repo: Repository) => {
    router.push(`/repo/${repo.owner.login}/${repo.name}`);
  };

  if (status === "loading" || reposLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
          <p className="text-sm text-muted-foreground">Carregando repositorios...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-2xl w-full animate-fade-in">
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center mx-auto mb-6 glow-accent">
            <FolderOpen className="text-amber-500" size={40} />
          </div>
          <h1 className="text-3xl font-bold text-gradient mb-3">
            Escolha um Repositorio
          </h1>
          <p className="text-muted-foreground">
            Selecione o repositorio do seu blog para comecar a editar
          </p>
        </div>

        <div className="glass-panel rounded-xl p-6">
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {repos.map((repo) => (
              <button
                key={repo.id}
                onClick={() => selectRepo(repo)}
                className="w-full text-left p-4 rounded-lg border border-border hover:border-amber-500/30 hover:bg-amber-500/5 transition-all flex items-center justify-between group"
              >
                <div>
                  <h3 className="font-medium text-foreground group-hover:text-amber-500 transition-colors">
                    {repo.name}
                  </h3>
                  {repo.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {repo.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                    {repo.full_name}
                    {repo.private && (
                      <Badge variant="outline" className="text-xs">Privado</Badge>
                    )}
                  </div>
                </div>
                <ChevronRight className="text-muted-foreground group-hover:text-amber-500" size={20} />
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 text-center">
          <Button
            variant="ghost"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-muted-foreground"
          >
            <LogOut size={16} className="mr-2" />
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
