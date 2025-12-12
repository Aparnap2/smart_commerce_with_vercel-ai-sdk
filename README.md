# Vercel AI SDK E-commerce Chatbot

A **production-ready, AI-powered e-commerce support chatbot** built with:

- **Vercel AI SDK** (streaming, tools, edge-ready)
- **Google Gemini** (LLM)
- **Prisma** + **Neon DB** (type-safe, serverless Postgres)
- **Zod** (robust schema validation)
- **Next.js** (modern frontend, App Router)

---

## ✨ Features

- **Conversational AI**: Natural support for orders, products, support tickets, and more.
- **Database integration**: Type-safe queries and mutations via Prisma and Neon DB.
- **Streaming LLM responses**: Fast, real-time answers powered by Google Gemini and Vercel AI SDK.
- **Input validation**: All API and LLM-tool inputs validated with Zod.
- **Modern UI**: Responsive React/Next.js chat interface with Markdown rendering and animated UX.
- **Extensible**: Add tools, business logic, validation, or third-party API integrations easily.

---

## 🛠️ Tech Stack

- **Frontend**: Next.js, React, Tailwind CSS, framer-motion, react-markdown
- **Backend**: Vercel AI SDK, Google Gemini, Prisma, Neon DB, Zod, nanoid

---

## 🚀 Quick Start

### 1. **Clone the repo**

```bash
git clone https://github.com/Aparnap2/vercel-ai-sdk.git
cd vercel-ai-sdk
```

### 2. **Install dependencies**

```bash
npm install
```

### 3. **Set up environment variables**

The system automatically switches between **Ollama (development)** and **Google GenAI (production)** based on your environment.

#### Development Mode (Ollama - Local LLM)

For local development, the system uses Ollama by default:

```
# .env.local for development
NODE_ENV=development
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DB
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=ministral-3:3b
```

**Requirements:**
- Docker with Ollama container running
- Model `ministral-3:3b` pulled (or your preferred model)

#### Production Mode (Google GenAI)

For production deployment, switch to Google GenAI:

```
# .env.local for production
NODE_ENV=production
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DB
GOOGLE_GENERATIVE_AI_API_KEY=your-google-api-key-here
```

**Requirements:**
- Google Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
- Production database connection

#### Hybrid Mode (Fallback)

You can configure both providers for fallback:

```
# .env.local for hybrid setup
NODE_ENV=production
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DB
GOOGLE_GENERATIVE_AI_API_KEY=your-google-api-key-here
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=ministral-3:3b
```

In this case, production will use Google GenAI, but can fall back to Ollama if needed.

### 4. **Set up the database**

```bash
npx prisma db push
npx prisma generate
# (Optional) seed your DB if you have a script
```

### 5. **Run the dev server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and chat!

---

## 🧩 Project Structure

```
├── app/
│   ├── api/
│   │   └── chat/
│   │       ├── route.js          # API endpoint (Vercel AI SDK + tools)
│   │       ├── route-ollama.js    # Ollama-specific route (legacy)
│   │       └── system-prompt.js  # System prompt for LLM
│   └── page.jsx                  # Main chat UI
├── lib/
│   ├── ai/
│   │   ├── config.js             # LLM provider configuration (NEW)
│   │   └── google.js             # Google Gemini config (legacy)
│   └── tools/
│       └── database.js           # DB query tool with Zod validation
├── prisma/
│   └── schema.prisma             # Prisma models
├── public/
│   └── images/                   # Project images
├── .env.local                    # API keys and DB URL
├── package.json
└── README.md
```

---

## 🧑‍💻 How It Works

- **Frontend**: Users chat with the bot via a Next.js interface. Messages are sent to `/api/chat`.
- **API Route**:  
  - **Automatic LLM Switching**: Uses Ollama in development (`NODE_ENV=development`) and Google GenAI in production (`NODE_ENV=production`).
  - Handles simple greetings directly.
  - For all other queries, uses `generateText` from Vercel AI SDK with the configured LLM provider.
  - Exposes a custom `db_query` tool (validated by Zod and powered by Prisma).
  - Returns Markdown-formatted, streaming responses.
- **Database**: All queries are validated (Zod) and run with Prisma on PostgreSQL, returning only safe, allowed data.
- **LLM Configuration**: The system automatically detects the environment and uses the appropriate LLM provider.

---

## 🤖 LLM Provider Configuration

The system features **automatic LLM provider switching** based on the environment:

### 🔧 Configuration Logic

```javascript
// lib/ai/config.js
function getLLMConfig() {
  const isDev = env.NODE_ENV === 'development';
  
  if (isDev && env.OLLAMA_BASE_URL) {
    // Development: Use Ollama (local LLM)
    return {
      provider: 'ollama',
      model: createOllama(env.OLLAMA_MODEL),
      isDev: true
    };
  } else if (env.GOOGLE_GENERATIVE_AI_API_KEY) {
    // Production: Use Google GenAI
    return {
      provider: 'google',
      model: google('models/gemini-2.0-flash-exp'),
      isDev: false
    };
  }
}
```

### 🎛️ Usage in API Routes

Both API routes now use the unified configuration:

```javascript
// app/api/chat/route.js
import { getLLMModel, isDevelopment } from '../../../lib/ai/config';

const result = await generateText({
  model: getLLMModel(),  // Automatically selects provider
  temperature: isDevelopment() ? 0.7 : 0.5,  // Higher creativity in dev
  // ... other parameters
});
```

### 🔄 Switching Behavior

| Environment | Provider | Model | Use Case |
|------------|----------|-------|----------|
| `development` | Ollama | `ministral-3:3b` | Local development, no API costs |
| `production` | Google GenAI | `gemini-2.0-flash-exp` | Production deployment, best performance |
| `production` (fallback) | Ollama | Configured model | Backup if Google API fails |

### 🎯 Benefits

- **Cost Savings**: Use free local Ollama for development
- **Performance**: Use optimized Google models in production
- **Flexibility**: Easy to switch between providers
- **Fallback**: Automatic fallback if primary provider fails
- **Consistency**: Same API interface for both providers

## 🛡️ Security & Best Practices

- **All tool inputs are validated** with Zod before touching the DB.
- **Edge runtime ready**: Fast, scalable, serverless deployment.
- **No sensitive data returned** by default (customize tool output as needed).
- **Easy to extend**:  
  - Add new tools (APIs, actions, etc.)
  - Expand the Prisma schema
  - Customize system prompt/business logic

---

## 📦 Customization

- **Change the System Prompt**:  
  Edit `app/api/chat/system-prompt.js`
- **Modify data models**:  
  Edit `prisma/schema.prisma` and run `npx prisma db push`
- **Add/modify tools**:  
  See `lib/tools/database.js`
- **UI tweaks**:  
  Edit `app/page.jsx` and Tailwind classes

---

## 📝 License

MIT

---

## 👤 Author

**Aparnap2**  
[GitHub](https://github.com/Aparnap2) | [LinkedIn](https://linkedin.com/in/aparnap2)

---

## ⭐️ If this helped you, star the repo!
