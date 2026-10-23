# Continuous integration

`github-actions.yml` is the project's GitHub Actions pipeline (format check, ESLint, typecheck, unit and fairness tests, build, integration tests on PGlite and on PostgreSQL 16 + Redis 7, migrations and seed, and Playwright end-to-end tests).

It lives here because the automation that pushed this branch was not allowed to write to `.github/workflows/`. To enable it, move it into place once:

```bash
mkdir -p .github/workflows
git mv ci/github-actions.yml .github/workflows/ci.yml
git commit -m "ci: enable GitHub Actions workflow" && git push
```
