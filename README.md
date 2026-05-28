# URL Shortener — DevOps/AWS capstone

A deliberately tiny URL shortener that I'll grow into a fully deployed,
production-style AWS service over the course of this roadmap.

## Run it locally

```bash
npm install
npm start
```

The server starts on port 3000 (override with `PORT=8080 npm start`).

## Try it

```bash
# Create a short code
curl -X POST localhost:3000/urls \
  -H 'content-type: application/json' \
  -d '{"url":"https://www.anthropic.com"}'
# -> {"code":"a1b2c3d4","shortUrl":"/a1b2c3d4"}

# Follow the redirect (-i shows the 302 + Location header)
curl -i localhost:3000/a1b2c3d4

# Health checks
curl localhost:3000/healthz   # liveness  -> {"status":"ok"}
curl localhost:3000/readyz    # readiness -> {"status":"ready"}
```

## Why it's written this way (the cloud-readiness bits)

- **Logs to stdout as JSON** — the platform collects stdout; never log to files in a container.
- **Liveness (`/healthz`) vs readiness (`/readyz`)** — two different questions the orchestrator asks. Liveness = "restart me if I'm hung." Readiness = "don't send metraffic until my dependencies are up."
- **In-memory storage** — zero external dependencies so it runs instantly. Gets swapped for Postgres + Redis later without touching the rest of the app.

## Roadmap for this repo
1. ✅ Runs locally (in-memory)
2. ⬜ Containerize with Docker (multi-stage)
3. ⬜ docker-compose: app + Postgres + Redis
4. ⬜ Deploy into a VPC on AWS (ECS Fargate behind an ALB)
5. ⬜ Infrastructure as Code (Terraform)
6. ⬜ CI/CD (GitHub Actions, deploy on push)
7. ⬜ Observability (CloudWatch + Prometheus/Grafana)