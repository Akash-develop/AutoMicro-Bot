# AutoMicro-Bot — Floating AI Chatbot Desktop App

A full-stack desktop chatbot application that floats on your screen, powered by Tauri, React, and a local Python backend with LangGraph and Ollama.

## 🚀 Features

- **Floating Glassmorphism UI**: High-end transparent, always-on-top chat widget.
- **Local AI Logic**: Orchestrated via LangGraph and LangChain.
- **Streaming Responses**: Real-time token-by-token feedback via WebSockets.
- **Persistent Memory**: Chat history saved in a local SQLite database.
- **Private & Secure**: Runs entirely on your machine using Ollama.

## 🛠️ Tech Stack

- **Frontend**: Tauri, React, Vite, Tailwind CSS
- **Backend**: Python, FastAPI, LangGraph, SQLite
- **LLM**: Ollama (llama3)

---

## 📦 Setup Instructions

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Python](https://www.python.org/) (v3.11+)
- [Poetry](https://python-poetry.org/) (for backend dependency management)
- [Rust](https://www.rust-lang.org/) (for Tauri builds)
- [Ollama](https://ollama.ai/) (installed and running)

### 2. Backend Setup (Python)

```bash
cd back-end
poetry install
cp .env.example .env
# Pull the model in Ollama
ollama pull llama3
# Start the server
poetry run start
```

### 3. Frontend Setup (Tauri + React)

```bash
cd front-end
npm install
# Start in development mode
npm run tauri dev
```

---

## 📁 Project Structure

```text
AutoMicro-bot/
├── front-end/               # Tauri + React app
│   ├── src/                 # React components & UI
│   ├── src-tauri/           # Tauri window & rust config
│   └── tauri.conf.json      # Window settings (360x520, transparent)
└── back-end/                # FastAPI Chat Server
    ├── app/
    │   ├── db/              # SQLite database layer
    │   ├── graph/           # LangGraph agent definitions
    │   ├── models/          # Pydantic schemas
    │   └── routes/          # API & WebSocket endpoints
    └── pyproject.toml       # Backend dependencies
```

## ⚙️ Configuration

Control the bot's behavior via the `.env` file in the `back-end` directory:
- `OLLAMA_MODEL`: Change the underlying AI model.
- `DB_PATH`: Location of the SQLite database.
- `CORS_ORIGINS`: Allowed origins for the frontend.
