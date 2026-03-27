export interface Post {
  slug: string;
  title: string;
  date: string;
  description: string;
  tags: string[];
  audio?: string;
  content: string;
  modified: boolean;
  sha?: string;
  path?: string;
  branch?: string;
  hasLocalDraft?: boolean;
}

export interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  owner: {
    login: string;
  };
}
