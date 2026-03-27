import type { DefaultSession } from "next-auth";

// Extend the Session type to include accessToken
declare module "next-auth" {
  interface Session {
    accessToken: string;
    user: {
      login: string;
    } & DefaultSession["user"];
  }

  interface JWT {
    accessToken?: string;
    login?: string;
  }
}
