# Next Steps

This document tracks recommended improvements and fixes for the Blog Dashboard project.

## 🚨 Critical Fixes

- [ ] **Fix button nesting hydration error**
  - Location: `app/page.tsx:57` and `app/repo/[owner]/[name]/page.tsx:288`
  - Issue: `<button>` elements wrapping other buttons causes React hydration error
  - Fix: Change outer `<button>` to `<div role="button">` with click handlers

- [ ] **Add proper dark mode toggle**
  - Location: `app/layout.tsx:20`
  - Issue: Currently forcing `className="dark"` without user control
  - Fix: Implement next-themes with theme provider and toggle component

## 🎨 UI/UX Improvements

- [ ] **Improve typography**
  - Current: Inter (generic)
  - Suggestion: Space Grotesk + Source Serif 4, or Playfair Display + Lora for editorial feel

- [ ] **Add keyboard shortcuts**
  - `Cmd/Ctrl+S` for save
  - `Cmd/Ctrl+P` for preview toggle
  - `Esc` for cancel actions

- [ ] **Better loading skeletons**
  - Replace generic `animate-pulse` with content-matching skeletons

- [ ] **Mobile responsiveness**
  - Sidebar layout breaks on mobile
  - Add collapsible drawer pattern for small screens

- [ ] **Toast notifications**
  - Replace custom Notification component with Sonner

## 🏗️ Code Architecture

- [ ] **Refactor useGitHub hook**
  - Current: 443 lines, too many responsibilities
  - Split into: `useRepositories`, `useBranches`, `useFileOperations`

- [ ] **Add React Query (TanStack Query)**
  - Replace manual caching with server state management
  - Benefits: Optimistic updates, stale-while-revalidate, automatic retries

- [ ] **Implement Error Boundaries**
  - Wrap MDXEditor and main content areas
  - Show fallback UI on runtime errors

## ⚡ Performance

- [ ] **Improve editor lazy loading**
  - Add skeleton that mimics editor layout
  - Current Suspense fallback is too generic

- [ ] **Image optimization**
  - Use `next/image` for avatars and uploaded images

- [ ] **Debounce search/filter inputs**
  - If adding repo/post search functionality

## 🛠️ Developer Experience

- [ ] **Add testing**
  - Unit tests for `lib/github-posts.ts`
  - Integration tests for editor flow
  - Consider: Vitest + React Testing Library

- [ ] **Set up pre-commit hooks**
  - Husky + lint-staged

- [ ] **Improve ESLint config**
  - Extend from stricter config (e.g., @antfu/eslint-config)

- [ ] **Add bundle analyzer**
  - `next-bundle-analyzer` to monitor chunk sizes

## 🔒 Security & Reliability

- [ ] **Rate limiting**
  - Add client-side request throttling for GitHub API
  - Avoid hitting GitHub rate limits

- [ ] **Add retry logic**
  - Exponential backoff for failed GitHub API requests

- [ ] **Input validation**
  - Validate frontmatter fields with Zod schemas
  - Prevent invalid data from being saved

---

## Priority Order

1. Critical fixes (hydration error, dark mode)
2. Mobile responsiveness
3. Code architecture improvements
4. Testing setup
5. Performance optimizations
6. Security enhancements
