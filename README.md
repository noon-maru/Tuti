# Tuti

Tuti is a quiet prototype for helping someone step briefly outside their daily air with very low decision pressure.

## Run

```bash
docker compose up
```

Open http://localhost:5050.

## Checks

```bash
docker compose run --rm app sh -lc "pnpm lint"
docker compose run --rm app sh -lc "pnpm build"
docker compose run --rm app sh -lc "pnpm exec cap sync"
```

## Capacitor

The app is configured for static export with `out` as the Capacitor `webDir`.

```bash
docker compose run --rm app sh -lc "pnpm cap:sync"
```

Add native platforms when needed:

```bash
docker compose run --rm app sh -lc "pnpm exec cap add ios"
docker compose run --rm app sh -lc "pnpm exec cap add android"
```
