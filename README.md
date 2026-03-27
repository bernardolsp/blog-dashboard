# Blog Dashboard

Blog Dashboard is a Next.js 14 app for browsing your GitHub repositories, editing markdown posts, previewing content, and publishing changes through GitHub OAuth.

## What It Does

- Signs in with GitHub using NextAuth
- Lists repositories you can manage
- Loads post metadata from markdown frontmatter and sorts posts by date
- Edits posts with MDXEditor and previews them with `react-markdown`
- Uploads media through the GitHub contents API
- Runs well in Docker with Bun

## Required Environment Variables

Copy the template and fill in real values before running locally or in Docker:

```bash
cp .env.example .env.local
```

Required variables:

- `NEXTAUTH_URL` - public URL where the app is served
- `NEXTAUTH_SECRET` - long random secret for session encryption
- `GITHUB_CLIENT_ID` - GitHub OAuth app client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth app client secret
- `GITHUB_REDIRECT_URI` - GitHub OAuth callback URL, usually `https://your-domain/api/auth/callback/github`

Generate a secret with:

```bash
openssl rand -base64 32
```

## Local Development

Install dependencies and start the app:

```bash
bun install
bun run dev
```

Then open `http://localhost:3000`.

If you prefer npm, the project still supports the usual `npm install` and `npm run dev` flow, but the container build uses Bun.

## Docker Compose

This repo includes a Bun-based `Dockerfile` and a `docker-compose.yml` for running on a VM or homelab box.

1. Create `.env.local` with your real secrets.
2. Build and start the container:

```bash
docker compose build
docker compose up -d
```

3. Open `http://localhost:3000` or your reverse-proxied hostname.

The compose file reads secrets from `.env.local`, so sensitive values are not hardcoded into versioned config.

## GitHub OAuth Setup

Create a GitHub OAuth app and configure:

- Homepage URL: your app URL, for example `https://blog.example.com`
- Authorization callback URL: `https://blog.example.com/api/auth/callback/github`

The callback URL must match `GITHUB_REDIRECT_URI`.

## Publishing an Image to GHCR

The repo includes a GitHub Actions workflow that builds the Docker image and publishes it to GitHub Container Registry.

What it does:

- builds on pushes to `main`
- builds on tags like `v1.0.0`
- publishes `ghcr.io/<owner>/<repo>:main`
- publishes a sha-tagged image
- publishes a semver tag when you push a version tag

The workflow uses the built-in `GITHUB_TOKEN`, so you do not need a separate registry password as long as the repository has permission to publish packages.

## Running the Published Image

After the workflow pushes an image, you can run it directly:

```bash
docker run -d \
  --name blog-dashboard \
  -p 3000:3000 \
  --env-file .env.local \
  ghcr.io/<owner>/<repo>:main
```

## Stack

- Next.js 14
- React 18
- NextAuth
- MDXEditor
- Tailwind CSS
- Bun for container builds

## Notes

- Keep `.env.local` out of git.
- `.env.example` is safe to commit and should only contain placeholders.
- This app depends on GitHub OAuth and GitHub repository access to function correctly.
