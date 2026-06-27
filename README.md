# Ivy PPT ChatGPT App

ChatGPT App / MCP scaffold for the Ivy PPT workflow.

## Billing And Token Policy

This app must not use the owner's OpenAI API key or ChatGPT quota.

- Do not configure `OPENAI_API_KEY` or other provider API keys on the server.
- The server refuses to start if common provider key environment variables are present.
- Prompt generation and reasoning should happen inside the user's own ChatGPT session.
- The app server should only provide workflow tools, UI resources, prompt packaging, and non-model file processing.
- If a future feature needs a model provider, implement user-provided credentials or ChatGPT-mediated tool calls, not a shared owner key.

## Local Run

```powershell
npm install
npm start
```

Local endpoints:

- `http://localhost:8787/mcp` - MCP endpoint
- `http://localhost:8787/ivy-widget.html` - iframe UI preview
- `http://localhost:8787/healthz` - health check

## Public Deploy

Deploy this folder to any Node/Docker web host that supports HTTPS.

### Required environment variables

```text
PORT=8787
PUBLIC_BASE_URL=https://your-public-domain.example
```

`PUBLIC_BASE_URL` must be the final public HTTPS origin, without a trailing slash.

Do not set `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, or `DEEPSEEK_API_KEY` on the deployed service.

### Render

1. Push this folder to GitHub.
2. In Render, create a new Web Service from the repo.
3. Use the included `render.yaml` or Docker environment.
4. Set `PUBLIC_BASE_URL` to the Render service URL, for example:
   `https://ivy-ppt-chatgpt-app.onrender.com`
5. After deploy, test:
   - `https://.../healthz`
   - `https://.../ivy-widget.html`
   - `https://.../mcp`

### Railway / Fly.io / Docker

Use the included `Dockerfile`:

```bash
docker build -t ivy-ppt-chatgpt-app .
docker run -p 8787:8787 -e PUBLIC_BASE_URL=https://your-domain.example ivy-ppt-chatgpt-app
```

## ChatGPT App Connection

After public deployment, use the public MCP endpoint:

```text
https://your-public-domain.example/mcp
```

The current tool set:

- `ivy_start_workflow`
- `ivy_build_image_prompt`
- `ivy_build_replication_prompt`

This first version packages the ChatGPT UI and prompt workflow. The next step is adding a hosted PPTX renderer tool that accepts an approved image and returns a downloadable editable PPTX.
