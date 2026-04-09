# Aucctus - Market Intelligence System (Django Edition)

1:1 refactor of the Aucctus market intelligence system into Django/Celery/Postgres. Same functionality, same agents, same UI - built for the Django stack.

**Original (TypeScript/Next.js/Convex):** https://github.com/noah-vh/aucctus

## Architecture

```
Browser <-> Django (templates + HTMX + Tailwind) <-> Postgres
                    |
                    | HTTP (internal)
                    v
            Agent Service (Node.js)
            pi-agent-core + pi-ai
            Tools read/write Postgres directly
```

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Django 6 + Django REST Framework |
| Database | Postgres (SQLite for dev) |
| Scheduling | Celery beat + Redis |
| Frontend | Django templates + HTMX + Tailwind CSS + Alpine.js |
| Agent Runtime | pi-agent-core + pi-ai (Node.js microservice) |
| LLM | OpenRouter (configurable model) |
| Search | Exa + Tavily |

## What's Built

- **20 Django models** matching the original 19 Convex tables + 1
- **Django REST API** with serializers, viewsets, and brain service logic
- **11 Django template pages** with HTMX for interactivity
- **SSE streaming** for real-time agent progress in chat
- **6 Celery periodic tasks** for continuous monitoring
- **Node.js agent service** with 24 tools across 11 files (unchanged from original)
- **Docker Compose** for full stack deployment (Postgres + Redis + Django + Celery + Agent service)

## Getting Started

### Quick Start (SQLite, no Docker)

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Run migrations
python manage.py migrate

# Create admin user
python manage.py createsuperuser

# Install agent service dependencies
cd agents && npm install && cd ..

# Start agent service (separate terminal)
cd agents && npm run dev

# Start Django
python manage.py runserver
```

### Docker Start (Postgres + Redis + everything)

```bash
cp .env.example .env
# Edit .env with your API keys

docker-compose up
```

Visit http://localhost:8000

### Environment Variables

```
SECRET_KEY=change-me
DEBUG=True
DATABASE_URL=                    # Leave empty for SQLite
CELERY_BROKER_URL=redis://localhost:6379/0
AGENT_SERVICE_URL=http://localhost:4000
OPENROUTER_API_KEY=              # LLM access
EXA_API_KEY=                     # Exa search
TAVILY_API_KEY=                  # Tavily search
```

## Project Structure

```
aucctus-django/
├── config/              # Django project settings
│   ├── settings.py
│   ├── urls.py
│   └── celery.py        # Celery beat schedule (6 crons)
├── ideas/               # Core research domain
│   ├── models.py        # 14 models (Idea, Company, FundingEvent, etc.)
│   ├── views.py         # REST API viewsets
│   ├── serializers.py   # DRF serializers
│   ├── services.py      # Brain service (upsert, dedup logic)
│   ├── template_views.py # Template rendering views
│   └── admin.py         # Django admin for all models
├── chat/                # Chat persistence
│   ├── models.py        # ChatSession, ChatMessage
│   └── views.py         # REST API + SSE proxy
├── monitoring/          # Background jobs
│   ├── models.py        # Job, JobSchedule, ActivityLog
│   ├── tasks.py         # 6 Celery periodic tasks
│   └── views.py
├── evals/               # Eval scores
│   └── models.py
├── templates/           # Django templates + HTMX
│   ├── base.html        # Layout with sidebar
│   ├── dashboard.html
│   ├── chat.html
│   ├── ideas/
│   ├── companies/
│   ├── investors/
│   ├── monitoring.html
│   ├── agents.html
│   ├── trends.html
│   └── compare.html
├── agents/              # Node.js agent service (unchanged)
│   ├── server.ts        # HTTP API for Django to call
│   ├── orchestrator.ts
│   ├── incumbents.ts
│   ├── funding.ts
│   ├── growth.ts
│   └── tools/           # 11 tool files
├── docker-compose.yml
└── requirements.txt
```

## Mapping from Original

| Original (TypeScript) | Django Edition |
|---|---|
| Convex schema (19 tables) | Django models (20 models) |
| Convex mutations/queries | Django REST viewsets + services |
| Next.js API routes | Django views + Celery tasks |
| Next.js React pages | Django templates + HTMX |
| Convex crons | Celery beat schedule |
| Convex real-time subscriptions | HTMX polling + SSE streaming |
| pi-agent-core (same) | pi-agent-core (same, Node.js microservice) |

## License

MIT
