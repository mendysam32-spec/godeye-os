// Shared definitions for GodEye OS agent tools (model tool-use).
// Both the chat API route and the chat UI use these so the model and the
// renderer agree on names + parameters for creating real files.
export interface GodEyeToolFunction {
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

export const GODEYE_TOOLS: GodEyeToolFunction[] = [
  {
    type: "function",
    function: {
      name: "godeye_saveFile",
      description:
        "Create a single file on the user's computer. Use for any text/code content (reports, scripts, configs, notes). On the desktop app it writes into the Documents/GodEye folder (or a sub-folder via `folder`). In the browser it creates a file the user can download. Returns the saved path. For the user to get a file as an artifact they can keep/download, this tool is the right choice. Use `base64` + `type` for binary content.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "File name with extension, e.g. main.py, report.md, notes.txt" },
          content: { type: "string", description: "The full text or code content to write (omit when passing base64)" },
          base64: { type: "string", description: "Optional base64-encoded binary content (e.g. for an image or a downloaded asset)" },
          type: { type: "string", description: "Optional MIME type, e.g. text/plain, application/json, image/png" },
          folder: { type: "string", description: "Optional sub-folder under Documents/GodEye (desktop only), e.g. projects/app/src" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "godeye_createFolder",
      description:
        "Create a new (empty) folder. Desktop app: creates a real folder on disk under Documents/GodEye. Browser: generates a ZIP containing the empty folder so it can be unzipped locally. Use when the user asks for a folder for organizing output.",
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
      name: "godeye_createZip",
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
          folder: { type: "string", description: "Optional sub-folder under Documents/GodEye to save the zip into (desktop only)" },
        },
        required: ["name", "files"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "godeye_createDocx",
      description:
        "Create a real Microsoft Word (.docx) document from text. Supports markdown-ish input: headings (#, ##, ###), bold, italics, bullet lists and paragraphs. Use when the user asks for a Word document, an essay, a report, a letter, a CV, meeting notes, or 'make me a document'.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "File name, e.g. report.docx" },
          title: { type: "string", description: "Document title (rendered as a big heading)" },
          content: { type: "string", description: "Full document text with markdown headings/bullets/paragraphs, e.g. # Report\\n\\nIntro paragraph..." },
          folder: { type: "string", description: "Optional sub-folder under Documents/GodEye (desktop only)" },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "godeye_createPdf",
      description:
        "Create a PDF document from text: bold title on top, then titled/paragraph content. Use when the user asks for a PDF, a printable report, an invoice, a one-pager, a flyer, or a document they can email/print.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "File name, e.g. report.pdf" },
          title: { type: "string", description: "Document title (rendered large at the top)" },
          content: { type: "string", description: "Document text, one paragraph per line" },
          folder: { type: "string", description: "Optional sub-folder under Documents/GodEye (desktop only)" },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "godeye_readFile",
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
      name: "godeye_runCommand",
      description:
        "Run a shell command on the user's computer (desktop app only): e.g. `python main.py`, `node app.js`, `git status`, `npm test`, `dir`. Returns exit code, stdout and stderr. Use to execute, verify, and iterate on code the user asked you to build.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command to run" },
          cwd: { type: "string", description: "Optional working directory (defaults to GodEye folder)" },
          timeoutMs: { type: "number", description: "Optional timeout in ms (default 60000)" },
        },
        required: ["command"],
      },
    },
  },
];

// Providers whose OpenAI-compatible endpoints accept `tools`/tool_calls.
// Anthropic, Google and Cohere speak different tool formats and are kept out
// of the auto-tool loop (manual Save / Run still work for them).
export const TOOLS_SUPPORTED_PROVIDERS = [
  "openai",
  "nvidia",
  "openrouter",
  "omeroute",
  "mistral",
  "together",
  "agentrouter",
  "atria",
] as const;

export function isToolProvider(provider: string | undefined | null): boolean {
  return !!provider && (TOOLS_SUPPORTED_PROVIDERS as readonly string[]).includes(provider);
}