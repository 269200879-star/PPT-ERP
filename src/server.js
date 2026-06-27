import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { z } from "zod/v4";
import { buildImagePrompt, REPLICATION_PROMPT } from "./prompts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const publicDir = join(rootDir, "public");
const port = Number(process.env.PORT || 8787);
const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
const widgetUri = "ui://widget/ivy-ppt-tool.html";

const forbiddenProviderKeys = [
  "OPENAI_API_KEY",
  "OPENAI_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "GEMINI_API_KEY",
  "DEEPSEEK_API_KEY",
];

const configuredProviderKeys = forbiddenProviderKeys.filter((key) => process.env[key]);
if (configuredProviderKeys.length) {
  throw new Error(
    `Refusing to start: this public app must not use owner/provider API keys. Remove: ${configuredProviderKeys.join(", ")}`
  );
}

function textResult(text, structuredContent = {}) {
  return {
    structuredContent,
    content: [{ type: "text", text }],
  };
}

function createServer() {
  const server = new McpServer({
    name: "ivy-ppt-tool",
    version: "0.1.0",
  });

  server.registerResource(
    "ivy-ppt-widget",
    widgetUri,
    {
      title: "Ivy PPT Tool",
      description: "Ivy PPT workflow interface.",
      mimeType: "text/html+skybridge",
    },
    async () => {
      const html = await readFile(join(publicDir, "ivy-widget.html"), "utf8");
      return {
        contents: [
          {
            uri: widgetUri,
            mimeType: "text/html+skybridge",
            text: html,
            _meta: {
              ui: {
                prefersBorder: true,
                csp: {
                  connectDomains: [publicBaseUrl],
                  resourceDomains: [publicBaseUrl],
                },
              },
              "openai/widgetDescription": "Ivy PPT Tool guides users from PPT template and brief to image mockup prompt, then to editable PPTX reconstruction instructions.",
              "openai/widgetPrefersBorder": true,
              "openai/widgetCSP": {
                connect_domains: [publicBaseUrl],
                resource_domains: [publicBaseUrl],
              },
            },
          },
        ],
      };
    }
  );

  const toolMeta = {
    ui: { resourceUri: widgetUri },
    "openai/outputTemplate": widgetUri,
    "openai/widgetAccessible": true,
  };

  server.registerTool(
    "ivy_start_workflow",
    {
      title: "Start Ivy PPT Workflow",
      description: "Open the Ivy PPT Tool workflow UI and explain the required inputs.",
      inputSchema: {},
      outputSchema: {
        nextSteps: z.array(z.string()),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        ...toolMeta,
        "openai/toolInvocation/invoking": "Opening Ivy PPT workflow",
        "openai/toolInvocation/invoked": "Ivy workflow ready",
      },
    },
    async () =>
      textResult("Ivy PPT Tool is ready. Upload a PPT template, describe the target slide/deck, then generate an image-sample prompt.", {
        nextSteps: [
          "Upload a PPT template or describe its style.",
          "Provide the PPT brief, target audience, page count, and sample mode.",
          "Call ivy_build_image_prompt to generate the image prompt.",
          "After approving a generated image, call ivy_build_replication_prompt.",
        ],
      })
  );

  server.registerTool(
    "ivy_build_image_prompt",
    {
      title: "Build Image Sample Prompt",
      description: "Create a prompt for an image-generation model from a PPT template summary and user brief.",
      inputSchema: {
        brief: z.string().min(1).describe("User PPT requirement, topic, audience, and style."),
        templateSummary: z.string().optional().describe("Template style/layout summary or catalog extracted from the uploaded PPTX."),
        pageCount: z.number().int().min(1).max(20).default(1),
        sampleMode: z.enum(["single", "multi"]).default("single"),
      },
      outputSchema: {
        imagePrompt: z.string(),
        pageCount: z.number(),
        sampleMode: z.string(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        ...toolMeta,
        "openai/toolInvocation/invoking": "Building image prompt",
        "openai/toolInvocation/invoked": "Image prompt ready",
      },
    },
    async ({ brief, templateSummary = "", pageCount = 1, sampleMode = "single" }) => {
      const imagePrompt = buildImagePrompt({ brief, templateSummary, pageCount, sampleMode });
      return textResult(imagePrompt, { imagePrompt, pageCount, sampleMode });
    }
  );

  server.registerTool(
    "ivy_build_replication_prompt",
    {
      title: "Build Editable PPTX Replication Prompt",
      description: "Return Ivy's image-to-editable-PPTX reconstruction instructions for an approved sample image.",
      inputSchema: {
        imageNotes: z.string().optional().describe("Optional notes about the approved image sample or desired fixes."),
        outputLanguage: z.enum(["zh", "en"]).default("zh"),
      },
      outputSchema: {
        replicationPrompt: z.string(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        ...toolMeta,
        "openai/toolInvocation/invoking": "Preparing PPTX reconstruction prompt",
        "openai/toolInvocation/invoked": "PPTX prompt ready",
      },
    },
    async ({ imageNotes = "" }) => {
      const notes = imageNotes.trim() ? `\n\n用户补充说明：\n${imageNotes.trim()}` : "";
      const replicationPrompt = `${REPLICATION_PROMPT}${notes}`;
      return textResult(replicationPrompt, { replicationPrompt });
    }
  );

  return server;
}

const app = createMcpExpressApp();
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, MCP-Session-Id");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});
app.use("/", (await import("express")).default.static(publicDir));

app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    name: "ivy-ppt-chatgpt-app",
    mcp: "/mcp",
    widget: "/ivy-widget.html",
  });
});

app.post("/mcp", async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error("MCP request failed:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. Use POST /mcp." },
    id: null,
  });
});

app.delete("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  });
});

app.listen(port, (error) => {
  if (error) {
    console.error("Failed to start Ivy PPT App:", error);
    process.exit(1);
  }
  console.log(`Ivy PPT ChatGPT App MCP server: ${publicBaseUrl}/mcp`);
  console.log(`Widget preview: ${publicBaseUrl}/ivy-widget.html`);
});
