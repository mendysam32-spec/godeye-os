// Shared definitions for MEDUSA OS agent tools (model tool-use).
// Both the chat API route and the chat UI use these so the model and the
// renderer agree on names + parameters for creating real files.
export interface MEDUSAToolFunction {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties?: Record<string, unknown>;
      required?: string[];
    };
  };
}

export const MEDUSA_TOOLS: MEDUSAToolFunction[] = [
  {
    type: "function",
    function: {
      name: "medusa_saveFile",
      description:
        "Create a single file on the user's computer. Use for any text/code content (reports, scripts, configs, notes). On the desktop app it writes into the Documents/MEDUSA folder (or a sub-folder via `folder`). In the browser it creates a file the user can download. Returns the saved path. For the user to get a file as an artifact they can keep/download, this tool is the right choice. Use `base64` + `type` for binary content.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "File name with extension, e.g. main.py, report.md, notes.txt" },
          content: { type: "string", description: "The full text or code content to write (omit when passing base64)" },
          base64: { type: "string", description: "Optional base64-encoded binary content (e.g. for an image or a downloaded asset)" },
          type: { type: "string", description: "Optional MIME type, e.g. text/plain, application/json, image/png" },
          folder: { type: "string", description: "Optional sub-folder under Documents/MEDUSA (desktop only), e.g. projects/app/src" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "medusa_createFolder",
      description:
        "Create a new (empty) folder. Desktop app: creates a real folder on disk under Documents/MEDUSA. Browser: generates a ZIP containing the empty folder so it can be unzipped locally. Use when the user asks for a folder for organizing output.",
      parameters: {
        type: "object",
        properties: {
          folder: { type: "string", description: "Folder path, e.g. my-project or projects/website" },
        },
        required: ["folder"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "medusa_createZip",
      description:
        "Package one or more files into a single downloadable .zip archive. Each file entry supports a `path` (nested folders are preserved inside the zip) and either `content` (text) or `base64` (binary). Use when the user wants a bundle of files, a code project, a backup, or a download of everything produced in one go.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Zip file name, e.g. project.zip" },
          files: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "string", description: "Path inside the zip, e.g. src/main.py or README.md" },
                content: { type: "string", description: "Text content (omit when passing base64)" },
                base64: { type: "string", description: "Optional base64 binary content" },
              },
              required: ["path"],
            },
            description: "Files to include in the archive",
          },
          folder: { type: "string", description: "Optional sub-folder under Documents/MEDUSA to save the zip into (desktop only)" },
        },
        required: ["name", "files"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "medusa_createDocx",
      description:
        "Create a real Microsoft Word (.docx) document from text. Supports markdown-ish input: headings (#, ##, ###), bold, italics, bullet lists and paragraphs. Use when the user asks for a Word document, an essay, a report, a letter, a CV, meeting notes, or 'make me a document'.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "File name, e.g. report.docx" },
          title: { type: "string", description: "Document title (rendered as a big heading)" },
          content: { type: "string", description: "Full document text with markdown headings/bullets/paragraphs, e.g. # Report\\n\\nIntro paragraph..." },
          folder: { type: "string", description: "Optional sub-folder under Documents/MEDUSA (desktop only)" },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "medusa_createPdf",
      description:
        "Create a PDF document from text: bold title on top, then titled/paragraph content. Use when the user asks for a PDF, a printable report, an invoice, a one-pager, a flyer, or a document they can email/print.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "File name, e.g. report.pdf" },
          title: { type: "string", description: "Document title (rendered large at the top)" },
          content: { type: "string", description: "Document text, one paragraph per line" },
          folder: { type: "string", description: "Optional sub-folder under Documents/MEDUSA (desktop only)" },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "medusa_readFile",
      description:
        "Read a text file from the user's computer (desktop app only) and return its contents. Use to inspect existing code, configs, or documents before editing them.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path of the file to read" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "medusa_runCommand",
      description:
        "Run a shell command on the user's computer (desktop app only): e.g. `python main.py`, `node app.js`, `git status`, `npm test`, `dir`. Returns exit code, stdout and stderr. Use to execute, verify, and iterate on code the user asked you to build. Installs, dependency setup and video renders can take several minutes - pass a larger timeoutMs (up to 900000) instead of letting the default cut them off.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command to run" },
          cwd: { type: "string", description: "Optional working directory (defaults to MEDUSA folder). For an installed skill use its diskPath." },
          timeoutMs: { type: "number", description: "Optional timeout in ms (default 180000, max 900000). Use 600000+ for installs and long renders." },
        },
        required: ["command"],
      },
    },
  },
  /* ---- internet access ---------------------------------------------------- */
  {
    type: "function",
    function: {
      name: "medusa_webSearch",
      description:
        "Search the live web and get back ranked results (title, URL, snippet). Use this FIRST whenever the answer depends on anything current — news, prices, releases, documentation, 'latest', today's date, any fact you are not certain about. Never guess a fact you could search for. Then use medusa_fetchUrl to read the promising pages.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query. Prefer keywords over full questions." },
          count: { type: "number", description: "How many results to return (1-10, default 6)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "medusa_fetchUrl",
      description:
        "Download a URL and return its content. HTML pages come back as readable text (scripts/styles/nav stripped) so you can quote them; JSON and plain text come back verbatim. Use it after medusa_webSearch to read a page, or to pull an API endpoint. Refuses private/internal addresses.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Absolute http(s) URL to fetch" },
          format: { type: "string", description: "'text' (default, HTML converted to readable text), 'html' (raw markup), or 'json' (parsed + pretty-printed)" },
          maxChars: { type: "number", description: "Truncate the result to this many characters (default 12000, max 60000)" },
        },
        required: ["url"],
      },
    },
  },
  /* ---- external APIs ------------------------------------------------------ */
  {
    type: "function",
    function: {
      name: "medusa_httpRequest",
      description:
        "Call any REST/HTTP API with a chosen method, headers and JSON body, and get the status + response back. Use it for external services the user asks about (weather, stocks, sports, exchange rates, a company's API, webhooks you are integrating). Runs server-side so there is no CORS limit. Set `header` values to '{{VAULT:openai}}' to inject a key stored in the Providers Vault without ever seeing it.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Absolute http(s) endpoint" },
          method: { type: "string", description: "GET, POST, PUT, PATCH or DELETE (default GET)" },
          headers: { type: "object", description: "Request headers as key/value pairs, e.g. { \"Accept\": \"application/json\" }" },
          body: { type: "string", description: "Request body for POST/PUT/PATCH. Plain text, or JSON string." },
          contentType: { type: "string", description: "Content-Type for the body (default application/json)" },
        },
        required: ["url"],
      },
    },
  },
  /* ---- database ----------------------------------------------------------- */
  {
    type: "function",
    function: {
      name: "medusa_queryDb",
      description:
        "Run a read-only SQL query against MEDUSA's own database (SQLite/D1) and get rows back. Inspect users, chat threads and chat messages, plus any table created in the app. SELECT / WITH / PRAGMA only — writes are rejected. Use `medusa_listTables` first when you do not know the schema, and always filter by the current user's uid rather than dumping every row.",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "A single read-only statement: SELECT ... or WITH ... SELECT ... Use ? placeholders for values." },
          params: { type: "array", items: {}, description: "Values for the ? placeholders, in order" },
          limit: { type: "number", description: "Max rows to return (default 50, max 200)" },
        },
        required: ["sql"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "medusa_listTables",
      description:
        "List every table in MEDUSA's database with its column names and row count. Call this before medusa_queryDb whenever the schema is unknown.",
      parameters: { type: "object", properties: {} },
    },
  },
  /* ---- image generation --------------------------------------------------- */
  {
    type: "function",
    function: {
      name: "medusa_generateImage",
      description:
        "Generate a real image from a text prompt with the current provider's image model and attach it to the conversation as a downloadable file. Use it whenever the user wants a picture, logo, diagram, mockup, illustration or icon — describe the image fully (subject, style, lighting, composition, aspect) instead of only telling the user what it would look like.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Detailed image prompt" },
          size: { type: "string", description: "Optional size, e.g. 1024x1024, 1792x1024, 1024x1792" },
          name: { type: "string", description: "Optional file name for the saved image, e.g. hero-banner.png" },
        },
        required: ["prompt"],
      },
    },
  },
  /* ---- advanced file operations (desktop) ---------------------------------- */
  {
    type: "function",
    function: {
      name: "medusa_listDir",
      description:
        "List a folder on the user's computer (desktop app only) with sizes and modified dates. Use it to explore a codebase or find files before reading/editing them. Read it first when you do not know what is in a directory.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute folder path (omit for the MEDUSA folder)" },
          recursive: { type: "boolean", description: "Walk sub-folders too (default false)" },
          maxEntries: { type: "number", description: "Max entries to return (default 200, max 2000)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "medusa_editFile",
      description:
        "Edit a file in place on the user's computer (desktop app only). Either pass `content` to rewrite the whole file, or pass `find` + `replace` to patch one or more spots without resending the entire file — patching is far cheaper for large files. Set `createIfMissing` to make a new file. Returns a diff-style summary of what changed.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path of the file to edit" },
          content: { type: "string", description: "New full content (omitted when using find/replace)" },
          find: { type: "string", description: "Exact text to search for" },
          replace: { type: "string", description: "Replacement text for `find`" },
          all: { type: "boolean", description: "Replace every occurrence, not just the first (default false)" },
          createIfMissing: { type: "boolean", description: "Create the file when it does not exist (default false)" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "medusa_movePath",
      description:
        "Move or rename a file or folder on the user's computer (desktop app only). Use it to reorganise, rename, or tidy up files the user has.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Absolute source path" },
          to: { type: "string", description: "Absolute destination path (full new name, not just a folder)" },
          overwrite: { type: "boolean", description: "Replace the destination if it exists (default false)" },
        },
        required: ["from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "medusa_copyPath",
      description:
        "Copy a file or folder on the user's computer (desktop app only), optionally recursing into folders. Use it for backups and duplicates.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Absolute source path" },
          to: { type: "string", description: "Absolute destination path" },
          recursive: { type: "boolean", description: "Copy folder contents too (default true for folders)" },
          overwrite: { type: "boolean", description: "Replace the destination if it exists (default false)" },
        },
        required: ["from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "medusa_deletePath",
      description:
        "Delete a file or folder on the user's computer (desktop app only). Folders need `recursive: true`. Irreversible — only call it when the user clearly asked for the deletion, and never for anything outside a path they named. Set `dryRun` to preview what would be removed.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path to delete" },
          recursive: { type: "boolean", description: "Required to delete a non-empty folder" },
          dryRun: { type: "boolean", description: "Report what would be deleted without deleting (default false)" },
        },
        required: ["path"],
      },
    },
  },
  /* ---- system monitoring -------------------------------------------------- */
  {
    type: "function",
    function: {
      name: "medusa_systemStats",
      description:
        "Read live system metrics from the user's computer (desktop app only): CPU load per core, memory used/total, free disk space, uptime, network interfaces and throughput. Use it to answer 'how much RAM is free', 'is the CPU maxed', 'how full is the disk', or to check a machine before/after running heavy work.",
      parameters: { type: "object", properties: {} },
    },
  },
];

/**
 * Tools that must execute server-side: they need the network (CORS blocks the
 * browser), a database binding, or a provider API key. The client dispatcher
 * forwards these to `POST /api/tools/run` instead of handling them locally.
 */
export const SERVER_TOOL_NAMES = [
  "medusa_webSearch",
  "medusa_fetchUrl",
  "medusa_httpRequest",
  "medusa_queryDb",
  "medusa_listTables",
  "medusa_generateImage",
] as const;

export function isServerTool(name: string): boolean {
  return (SERVER_TOOL_NAMES as readonly string[]).includes(name);
}

// Providers with native (or OpenAI-compatible) `tools`/tool_calls support.
// Anthropic, Google and Cohere speak their own tool formats which the router
// translates (see llm-router.ts), so they take part in the auto-tool loop too.
export const TOOLS_SUPPORTED_PROVIDERS = [
  "openai",
  "nvidia",
  "openrouter",
  "omeroute",
  "mistral",
  "together",
  "agentrouter",
  "atria",
  "anthropic",
  "google",
  "cohere",
] as const;

export function isToolProvider(provider: string | undefined | null): boolean {
  return !!provider && (TOOLS_SUPPORTED_PROVIDERS as readonly string[]).includes(provider);
}