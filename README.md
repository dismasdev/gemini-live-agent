# Interview Coach — DSA & System Design

> 🏆 **Google Live Agent Hackathon Submission**
> **Category:** Live Agents 🗣️
> An advanced multimodal AI interview coach that can **See, Hear, Speak, and Act** to train candidates for developer jobs at top tech companies through interactive mock interviews.

## 🚀 Overview

Interview Coach is not just a chatbot; it's a **live, interactive interview trainer**. Built using the **Google ADK (Agent Development Kit)** and the **Gemini Live API**, it allows candidates to:
- Practice DSA and System Design interviews through real-time bidirectional voice conversation.
- Share their screen while coding or upload photos of whiteboard sketches.
- Draw system design diagrams on a built-in whiteboard canvas and get instant visual feedback.
- Have their Python code **executed and validated in real-time** by the agent.

The agent uses a **Socratic teaching method** — asking guiding questions, giving progressive hints, and correcting mistakes rather than simply providing answers.

---

## ✨ Key Features

| Capability | How It Works |
|:---:|---|
| 👂 **Hear** | Real-time voice streaming at 16kHz PCM. The candidate speaks their thought process naturally, just like in a real interview. |
| 🗣️ **Speak** | The coach responds with natural, sub-second latency voice (24kHz PCM) — asking follow-ups, giving hints, and correcting mistakes. |
| 👁️ **See** | Candidates can share their screen showing code in an IDE, upload photos, or use the built-in whiteboard to draw system design diagrams. The coach reads code, examines diagrams, and gives specific visual feedback. |
| 🛠️ **Act (Code Execution)** | The agent can execute Python code via an MCP server to validate candidate solutions against test cases in real-time. |
| ✏️ **Whiteboard** | Built-in drawing canvas for system design sketches — draw components, arrows, and diagrams, then send to the coach for review. |
| 🛑 **Graceful Interruption** | Candidates can interrupt the coach mid-sentence simply by speaking over it. The system instantly clears audio buffers and handles the interruption smoothly — just like a real conversation. |
| 🧠 **Adaptive Coaching** | The coach adjusts difficulty based on performance. Struggling? More scaffolding. Crushing it? Harder problems and deeper follow-ups. |

---

## 🏗️ Architecture & System Design

The application consists of a **React frontend**, a **FastAPI WebSocket backend**, and the **Google ADK** routing to the Gemini model.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND                                        │
│                   React + Vite + Shadcn/UI                               │
│                                                                          │
│  ┌──────────────┐  ┌────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ ChatInterface│  │VoiceButton │  │Activity Log  │  │  Whiteboard  │  │
│  │ Messages,    │  │ Mic toggle │  │ Live MCP     │  │  Canvas for  │  │
│  │ text input   │  │ with pulse │  │ tracking UI  │  │  diagrams    │  │
│  └──────┬───────┘  └─────┬──────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                │                 │                  │          │
│         └────────────────┼─────────────────┼──────────────────┘          │
│                          │                 │                             │
│                ┌─────────▼─────────────────▼──┐                          │
│                │     useWebSocket Hook         │                         │
│                │  • Connects to WS server      │                         │
│                │  • Sends text/audio/images    │                         │
│                │  • Parses ADK response events │                         │
│                │  • Plays audio                │                         │
│                └─────────────┬─────────────────┘                         │
└──────────────────────────────┼───────────────────────────────────────────┘
                               │
                        WebSocket Connection
                        ws://localhost:8000/ws/{session}
                        ├─ Upstream: JSON/PCM text/audio/images
                        └─ Downstream: ADK Event objects (JSON)
                               │
┌──────────────────────────────┼───────────────────────────────────────────┐
│                          BACKEND                                         │
│                   FastAPI + Google ADK                                   │
│                                                                          │
│  ┌───────────────────────────▼────────────┐                              │
│  │              WebSocket Server             │                           │
│  │              (app/main.py)                │                           │
│  └─────────────────────┬───────────────────┘                             │
│                        │                                                 │
│  ┌─────────────────────┴───────────────────┐                             │
│  │            ADK Runner.run_live()           │                          │
│  │         • Routes multimodal input          │                          │
│  │         • Yields response events           │                          │
│  └─────────────────────┬───────────────────┘                             │
│                        │                                                 │
│  ┌─────────────────────▼─────────────────────────────────────────────┐   │
│  │                  Root Agent (Interview Coach)                      │   │
│  │             Acts as MCP Tool Client + Google Search                │   │
│  └─────────────┬──────────────────────────────┬──────────────────────┘   │
│                │                              │                          │
│       MCP      │                     MCP      │                          │
│       Protocol │                     Protocol │                          │
│  ┌─────────────▼──────────────────┐ ┌─────────▼──────────────────────┐   │
│  │  LeetCode MCP Server           │ │  CodeExec MCP (FastMCP)        │   │
│  │  (@jinzcdev/leetcode-mcp)      │ │  - run_python_code             │   │
│  │  - get_daily_challenge         │ │    (execute & validate          │   │
│  │  - get_problem                 │ │     candidate solutions)        │   │
│  │  - search_problems             │ └────────────────────────────────┘   │
│  │  - list_problem_solutions      │                                      │
│  │  - get_problem_solution        │                                      │
│  │  + user profile/submission tools│                                     │
│  └────────────────────────────────┘                                      │
└──────────────────────────────────────────────────────────────────────────┘
```

### 1. Modular MCP Architecture
The agent uses the **Model Context Protocol (MCP)** for its tool capabilities, connecting to **two** MCP servers:

1. **LeetCode MCP Server** ([`@jinzcdev/leetcode-mcp-server`](https://github.com/jinzcdev/leetcode-mcp-server)): A community MCP server that provides direct access to LeetCode's problem database via their GraphQL API. The agent can search problems by difficulty/tags, fetch full problem details, get daily challenges, and retrieve community solutions — all from real LeetCode data.
2. **Code Execution MCP Server** (local FastMCP): A lightweight local server that provides sandboxed Python code execution for validating candidate solutions in real-time.
3. **Dynamic Bridge**: The `MCP Client Bridge` spawns both servers as subprocesses and dynamically fetches tools over the **stdio** protocol. Adding new MCP servers is as simple as adding a new `create_mcp_bridge_tools_from_command()` call.
4. **Google Search**: The agent also has access to Google Search for looking up algorithms, design patterns, and concepts in real-time.

### 2. WebSocket & Interruption Flow
Graceful interruptions require precise coordination across the full stack:
- **Frontend (`useWebSocket.ts`):** Wraps Web Audio API playback. When the user speaks, it triggers `interruptAgent()`, which instantly clears the audio buffer, drops partial messages, and sends an interruption signal.
- **Backend (`main.py`):** Uses an `asyncio.Event` (`cancel_event`) shared between the upstream (receive) and downstream (send) tasks. If the client disconnects or interrupts, tasks are cleanly cancelled without hanging the server or queue.
- **Auto-Reconnect:** Features exponential backoff for unexpected network drops, ensuring a resilient live session.

---

## 📂 Project Structure

```
Google_Hackathon/
├── .env                        # API key + model config
├── requirements.txt            # Python dependencies
│
├── bidi_streaming_agent/       # Google ADK Agent Code
│   ├── agent.py                # Root agent: Interview Coach persona, dual MCP Client loading
│   ├── mcp_client_bridge.py    # Bridge: Spawns MCP servers (Python & Node.js) & wraps tools
│   └── mcp_servers/
│       └── interview_mcp_server.py  # FastMCP server for code execution
│
├── app/
│   └── main.py                 # FastAPI WebSocket server (session & interrupt mgmt)
│
└── frontend/                   # React app (Vite + TypeScript)
    └── src/
        ├── hooks/
        │   ├── useWebSocket.ts      # WS lifecycle, streaming, interruption handling
        │   └── useAudioRecorder.ts  # Mic capture via AudioWorklet (16kHz PCM)
        └── components/
            ├── ChatInterface.tsx    # Main UI (Chat, Voice, Whiteboard, Activity Log)
            ├── Whiteboard.tsx       # Canvas drawing tool for system design diagrams
            └── ui/                  # Shadcn UI primitives
```

---

## 🛠️ Spin-Up Instructions (For Judges)

### Prerequisites
- Python 3.10+
- Node.js & `pnpm`
- A Gemini API Key

### 1. Backend Setup
1. Clone the repository and navigate to the root directory.
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Install the LeetCode MCP server (requires Node.js):
   ```bash
   npm install -g @jinzcdev/leetcode-mcp-server
   ```
5. Set up your `.env` file in the root directory:
   ```env
   GEMINI_API_KEY="your_api_key_here"
   DEMO_AGENT_MODEL="gemini-2.5-flash-native-audio-preview-12-2025"
   ```
6. Start the FastAPI server:
   ```bash
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

### 2. Frontend Setup
1. Open a second terminal and navigate to the `frontend` folder:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Start the Vite development server:
   ```bash
   pnpm run dev
   ```
4. Open your browser to `http://localhost:5173`. Click the microphone icon to start a coaching session and begin practicing!

---

## ☁️ Google Cloud Deployment Notes

The backend infrastructure leverages Google Cloud for all AI capabilities.

**How it uses Google Cloud:**
- **Google ADK & Vertex AI/Gemini API:** The core intelligence and multimodal live streaming are powered completely by Google's cloud infrastructure via the Gemini Live API endpoint.
- **Production Deployment Strategy:** In a production scenario, the FastAPI backend can be deployed via **Google Cloud Run** using a Dockerfile. The code execution sandbox would run in an isolated container for security, and the frontend would be served via Cloud CDN.

---

## ⚙️ Tech Stack

- **Agent Framework:** Google ADK (Agent Development Kit)
- **AI Model:** Gemini 2.5 Flash Native Audio (bidi streaming API)
- **Backend:** Python, FastAPI, Uvicorn, WebSockets, `asyncio`
- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS v4, Shadcn/UI
- **Browser APIs:** Web Audio API, AudioWorklet (raw PCM conversion), Screen Capture API, Canvas API
- **Tooling:** MCP (Model Context Protocol), FastMCP, [@jinzcdev/leetcode-mcp-server](https://github.com/jinzcdev/leetcode-mcp-server), Google Search
