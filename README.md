# AutoMicro-Bot

**AutoMicro-Bot** is a floating **macOS desktop agent**: a glass-style chat window that stays on top of your workspace so you can steer the system in plain English—open apps, drive the browser, run multi-step flows, and get streamed answers from your chosen LLM.

The app pairs a **Tauri + React** front end with a **Python** backend (**FastAPI**, **LangGraph**, **SQLite**). Model calls can go through **Ollama** or other providers you configure in-app.

> **Note:** GitHub’s README viewer does not run JavaScript, so there is no true “carousel” with arrows. Below you get a **horizontal strip** you can scroll sideways, plus the same shots **full width in order** as you scroll the page.

---

## What it does

- **Natural-language macOS automation** — e.g. open Chrome, search, wait between steps, chain queries (`javascript` then `reactjs`).
- **Floating chat UI** — compact, dark-friendly interface with streaming-style feedback.
- **Settings** — tool permissions, model settings, appearance (e.g. dark mode), optional humanoid chat agent.
- **Model configuration** — pick provider, base URL, API key, and model name; keep a **history** of setups and switch active configs.
- **Local-first** — backend and memory can run on your machine; you control which models and endpoints to use.

---

## Tech stack

| Layer | Technologies |
|--------|----------------|
| Desktop UI | Tauri 2, React 19, Vite, Tailwind-style UI |
| Backend | Python, FastAPI, LangGraph / LangChain |
| Data | SQLite chat history |
| LLM | Ollama and other providers (configured in Model Settings) |

---

## Screenshots

### Horizontal strip (scroll sideways)

<div style="overflow-x:auto; width:100%; padding:12px 0;">
  <div style="display:flex; gap:14px; width:max-content; padding:4px 2px;">
    <img src="docs/readme-screenshots/01-splash.png" alt="Splash screen while AutoMicro-Bot initializes" style="height:220px; width:auto; border-radius:8px;" />
    <img src="docs/readme-screenshots/02-chat-browser-automation.png" alt="Chat: open Chrome and search ChatGPT" style="height:220px; width:auto; border-radius:8px;" />
    <img src="docs/readme-screenshots/03-demo-javascript-search.png" alt="Browser automation result: Google search for javascript" style="height:220px; width:auto; border-radius:8px;" />
    <img src="docs/readme-screenshots/04-demo-reactjs-automation.png" alt="Multi-step automation: javascript then reactjs search" style="height:220px; width:auto; border-radius:8px;" />
    <img src="docs/readme-screenshots/05-settings.png" alt="Settings: permissions, model, appearance" style="height:220px; width:auto; border-radius:8px;" />
    <img src="docs/readme-screenshots/06-about.png" alt="About window with version and links" style="height:220px; width:auto; border-radius:8px;" />
    <img src="docs/readme-screenshots/07-model-settings-config.png" alt="Model Settings configuration tab" style="height:220px; width:auto; border-radius:8px;" />
    <img src="docs/readme-screenshots/08-model-settings-history.png" alt="Model Settings history tab" style="height:220px; width:auto; border-radius:8px;" />
  </div>
</div>

### One by one (scroll down)

#### 1. Startup splash

<img src="docs/readme-screenshots/01-splash.png" alt="Splash screen while AutoMicro-Bot initializes" width="720" />

#### 2. Chat — browser automation

<img src="docs/readme-screenshots/02-chat-browser-automation.png" alt="Chat: open Chrome and search ChatGPT" width="720" />

#### 3. Demo — Google search for “javascript”

<img src="docs/readme-screenshots/03-demo-javascript-search.png" alt="Browser showing Google results for javascript" width="720" />

#### 4. Demo — chained search (“javascript” then “reactjs”)

<img src="docs/readme-screenshots/04-demo-reactjs-automation.png" alt="Chat overlay on Google results for reactjs" width="720" />

#### 5. Settings

<img src="docs/readme-screenshots/05-settings.png" alt="AutoMicro-Bot settings window" width="720" />

#### 6. About

<img src="docs/readme-screenshots/06-about.png" alt="About AutoMicro-Bot" width="720" />

#### 7. Model Settings — configuration

<img src="docs/readme-screenshots/07-model-settings-config.png" alt="Model Settings configuration" width="720" />

#### 8. Model Settings — history

<img src="docs/readme-screenshots/08-model-settings-history.png" alt="Model Settings history" width="720" />

---

## Setup (developers)

Detailed install and run steps for the backend and Tauri app live in **[`auto-bot/README.md`](auto-bot/README.md)** (Node, Python/Poetry, Rust, Ollama).

```bash
# Backend (from auto-bot/back-end)
poetry install && cp .env.example .env
poetry run start

# Desktop app (from auto-bot/front-end)
npm install
npm run tauri:dev
```

---

## Repository layout

```text
AutoMicro-bot/
├── docs/readme-screenshots/   # Images used by this README
├── auto-bot/
│   ├── front-end/             # Tauri + React
│   └── back-end/              # FastAPI + LangGraph
└── README.md                  # This file
```

---

## License

Add a `LICENSE` file in the repo root when you are ready to publish.
