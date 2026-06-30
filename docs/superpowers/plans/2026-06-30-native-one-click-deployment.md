# Native One-Click Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows and Linux native one-click production deployment path that configures the app, prepares Prisma, builds Next.js, and starts Web, scheduler, and optional Telegram worker together.

**Architecture:** `scripts/start-all.mjs` contains the cross-platform implementation and exports pure helpers for tests. Root wrapper scripts only locate the repository and invoke the Node script, keeping Windows and Linux behavior identical. Configuration is written to `.env`, long-running services are supervised by the Node process, and README documents the native path beside Docker.

**Tech Stack:** Node.js ESM, npm scripts, PowerShell, POSIX shell, Vitest, Prisma, Next.js.

---

## File Structure

- Create `scripts/start-all.mjs`: cross-platform CLI, configuration wizard, validation, command runner, process supervisor, scheduler loop, exported test helpers.
- Create `start-all.ps1`: Windows PowerShell wrapper that checks Node/npm and calls `node scripts/start-all.mjs`.
- Create `start-all.cmd`: Windows double-click wrapper that delegates to `start-all.ps1`.
- Create `start-all.sh`: Linux shell wrapper that checks Node/npm and calls `node scripts/start-all.mjs`.
- Create `tests/unit/start-all.test.ts`: Vitest coverage for config parsing, generated defaults, required config validation, CLI args, service plan, and wrapper/package wiring.
- Modify `package.json`: add `start:all`.
- Modify `README.md`: add native one-click deployment section beside Docker.

## Task 1: Core Configuration Tests

**Files:**
- Create: `tests/unit/start-all.test.ts`
- Later modify: `scripts/start-all.mjs`

- [ ] **Step 1: Write failing tests for `.env` parsing, updates, generated defaults, and validation**

Create `tests/unit/start-all.test.ts` with:

```ts
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type EnvDocument = unknown;

type StartAllModule = {
  parseArgs: (argv: string[]) => { configure: boolean; yes: boolean };
  parseDotEnv: (text: string) => EnvDocument;
  serializeDotEnv: (document: EnvDocument) => string;
  getEnvValue: (document: EnvDocument, key: string) => string | undefined;
  setEnvValue: (document: EnvDocument, key: string, value: string) => EnvDocument;
  envDocumentToObject: (document: EnvDocument) => Record<string, string>;
  applyGeneratedDefaults: (
    values: Record<string, string>,
    generator: { token: (bytes: number) => string }
  ) => {
    values: Record<string, string>;
    generated: {
      seedUserEmail?: string;
      seedUserPassword?: string;
      schedulerTickSecret?: string;
    };
  };
  validateRequiredConfig: (values: Record<string, string>) => string[];
};

async function loadStartAll(): Promise<StartAllModule> {
  const url = pathToFileURL(resolve("scripts/start-all.mjs")).href;
  return (await import(url)) as StartAllModule;
}

describe("native one-click deployment config", () => {
  it("parses arguments for configure and non-interactive modes", async () => {
    const { parseArgs } = await loadStartAll();

    expect(parseArgs(["--configure"])).toEqual({ configure: true, yes: false });
    expect(parseArgs(["--yes"])).toEqual({ configure: false, yes: true });
    expect(parseArgs(["--configure", "--yes"])).toEqual({
      configure: true,
      yes: true
    });
  });

  it("updates env values while preserving comments and unrelated keys", async () => {
    const { getEnvValue, parseDotEnv, serializeDotEnv, setEnvValue } =
      await loadStartAll();

    const original = [
      "# Local database",
      "DATABASE_URL=file:./old.db",
      "",
      "AMAP_API_KEY=",
      "SMTP_HOST=smtp.example.com"
    ].join("\n");

    let document = parseDotEnv(original);
    expect(getEnvValue(document, "DATABASE_URL")).toBe("file:./old.db");

    document = setEnvValue(document, "DATABASE_URL", "file:./data/commute.db");
    document = setEnvValue(document, "OPENAI_MODEL", "gpt-4o-mini");

    expect(serializeDotEnv(document)).toContain("# Local database");
    expect(serializeDotEnv(document)).toContain(
      "DATABASE_URL=file:./data/commute.db"
    );
    expect(serializeDotEnv(document)).toContain("SMTP_HOST=smtp.example.com");
    expect(serializeDotEnv(document)).toContain("OPENAI_MODEL=gpt-4o-mini");
  });

  it("generates seed credentials and scheduler secret when they are empty", async () => {
    const { applyGeneratedDefaults } = await loadStartAll();
    const generator = {
      token: (bytes: number) => `token-${bytes}`
    };

    const result = applyGeneratedDefaults(
      {
        DATABASE_URL: "",
        DEFAULT_CITY: "",
        DEFAULT_TIMEZONE: "",
        OPENAI_BASE_URL: "",
        OPENAI_MODEL: "",
        SEED_USER_EMAIL: "",
        SEED_USER_PASSWORD: "",
        SCHEDULER_TICK_SECRET: ""
      },
      generator
    );

    expect(result.values.DATABASE_URL).toBe("file:./data/commute.db");
    expect(result.values.DEFAULT_TIMEZONE).toBe("Asia/Shanghai");
    expect(result.values.OPENAI_BASE_URL).toBe("https://api.openai.com/v1");
    expect(result.values.OPENAI_MODEL).toBe("gpt-4o-mini");
    expect(result.values.SEED_USER_EMAIL).toBe("user-token-6@example.local");
    expect(result.values.SEED_USER_PASSWORD).toBe("token-18");
    expect(result.values.SCHEDULER_TICK_SECRET).toBe("token-24");
    expect(result.generated).toEqual({
      seedUserEmail: "user-token-6@example.local",
      seedUserPassword: "token-18",
      schedulerTickSecret: "token-24"
    });
  });

  it("requires AMap and AI agent settings before deployment can start", async () => {
    const { validateRequiredConfig } = await loadStartAll();

    expect(
      validateRequiredConfig({
        DATABASE_URL: "file:./data/commute.db",
        DEFAULT_CITY: "宁波",
        DEFAULT_TIMEZONE: "Asia/Shanghai",
        AMAP_API_KEY: "",
        OPENAI_API_KEY: "",
        OPENAI_BASE_URL: "https://api.openai.com/v1",
        OPENAI_MODEL: ""
      })
    ).toEqual(["AMAP_API_KEY", "OPENAI_API_KEY", "OPENAI_MODEL"]);

    expect(
      validateRequiredConfig({
        DATABASE_URL: "file:./data/commute.db",
        DEFAULT_CITY: "宁波",
        DEFAULT_TIMEZONE: "Asia/Shanghai",
        AMAP_API_KEY: "amap-key",
        OPENAI_API_KEY: "openai-key",
        OPENAI_BASE_URL: "https://api.openai.com/v1",
        OPENAI_MODEL: "gpt-4o-mini"
      })
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails because the module is missing**

Run:

```bash
npm test -- tests/unit/start-all.test.ts
```

Expected: FAIL with a module resolution error for `scripts/start-all.mjs` or missing named exports.

## Task 2: Core Configuration Implementation

**Files:**
- Create: `scripts/start-all.mjs`
- Modify: `tests/unit/start-all.test.ts` only if the failure is caused by a test typo

- [ ] **Step 1: Implement the minimal exported helpers**

Create `scripts/start-all.mjs` with these exported helpers first:

```js
#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REQUIRED_KEYS = [
  "DATABASE_URL",
  "DEFAULT_CITY",
  "DEFAULT_TIMEZONE",
  "AMAP_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL"
];

const DEFAULTS = {
  DATABASE_URL: "file:./data/commute.db",
  DEFAULT_CITY: "宁波",
  DEFAULT_TIMEZONE: "Asia/Shanghai",
  OPENAI_BASE_URL: "https://api.openai.com/v1",
  OPENAI_MODEL: "gpt-4o-mini"
};

export function parseArgs(argv) {
  return {
    configure: argv.includes("--configure"),
    yes: argv.includes("--yes")
  };
}

export function parseDotEnv(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.length === 0 ? [] : normalized.split("\n");

  return {
    trailingNewline: normalized.endsWith("\n"),
    lines: lines.map((line) => {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) {
        return { type: "raw", raw: line };
      }

      return {
        type: "entry",
        key: match[1],
        value: match[2],
        raw: line
      };
    })
  };
}

export function serializeDotEnv(document) {
  const text = document.lines
    .map((line) =>
      line.type === "entry" ? `${line.key}=${line.value}` : line.raw
    )
    .join("\n");

  return document.trailingNewline && text.length > 0 ? `${text}\n` : text;
}

export function getEnvValue(document, key) {
  const line = document.lines.find(
    (candidate) => candidate.type === "entry" && candidate.key === key
  );
  return line?.value;
}

export function setEnvValue(document, key, value) {
  let updated = false;
  const lines = document.lines.map((line) => {
    if (!updated && line.type === "entry" && line.key === key) {
      updated = true;
      return { ...line, value };
    }
    return line;
  });

  if (!updated) {
    if (lines.length > 0 && lines[lines.length - 1].raw !== "") {
      lines.push({ type: "raw", raw: "" });
    }
    lines.push({ type: "entry", key, value, raw: `${key}=${value}` });
  }

  return { ...document, lines };
}

export function envDocumentToObject(document) {
  return Object.fromEntries(
    document.lines
      .filter((line) => line.type === "entry")
      .map((line) => [line.key, line.value])
  );
}

function firstNonEmpty(value, fallback) {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

export function createRandomGenerator() {
  return {
    token(bytes) {
      return randomBytes(bytes).toString("base64url");
    }
  };
}

export function applyGeneratedDefaults(values, generator = createRandomGenerator()) {
  const next = { ...values };
  const generated = {};

  next.DATABASE_URL = firstNonEmpty(next.DATABASE_URL, DEFAULTS.DATABASE_URL);
  next.DEFAULT_CITY = firstNonEmpty(next.DEFAULT_CITY, DEFAULTS.DEFAULT_CITY);
  next.DEFAULT_TIMEZONE = firstNonEmpty(
    next.DEFAULT_TIMEZONE,
    DEFAULTS.DEFAULT_TIMEZONE
  );
  next.OPENAI_BASE_URL = firstNonEmpty(
    next.OPENAI_BASE_URL,
    DEFAULTS.OPENAI_BASE_URL
  );
  next.OPENAI_MODEL = firstNonEmpty(next.OPENAI_MODEL, DEFAULTS.OPENAI_MODEL);

  if (!next.SEED_USER_EMAIL?.trim()) {
    generated.seedUserEmail = `user-${generator.token(6)}@example.local`;
    next.SEED_USER_EMAIL = generated.seedUserEmail;
  }

  if (!next.SEED_USER_PASSWORD?.trim()) {
    generated.seedUserPassword = generator.token(18);
    next.SEED_USER_PASSWORD = generated.seedUserPassword;
  }

  if (!next.SCHEDULER_TICK_SECRET?.trim()) {
    generated.schedulerTickSecret = generator.token(24);
    next.SCHEDULER_TICK_SECRET = generated.schedulerTickSecret;
  }

  return { values: next, generated };
}

export function validateRequiredConfig(values) {
  return REQUIRED_KEYS.filter((key) => !values[key]?.trim());
}
```

- [ ] **Step 2: Run the focused test and verify it passes**

Run:

```bash
npm test -- tests/unit/start-all.test.ts
```

Expected: PASS for the four config tests.

- [ ] **Step 3: Commit the tested core helpers**

Run:

```bash
git add scripts/start-all.mjs tests/unit/start-all.test.ts
git commit -m "feat: add native deployment config helpers"
```

## Task 3: Configuration Wizard and Startup Plan Tests

**Files:**
- Modify: `tests/unit/start-all.test.ts`
- Modify later: `scripts/start-all.mjs`

- [ ] **Step 1: Add failing tests for preparing configuration and service plans**

Append these imports and tests to `tests/unit/start-all.test.ts`:

```ts
type PrepareConfigurationInput = {
  envText: string | undefined;
  exampleText: string;
  args: { configure: boolean; yes: boolean };
  prompt: (question: string, defaultValue?: string) => Promise<string>;
  generator: { token: (bytes: number) => string };
};

type StartAllModuleWithRuntime = StartAllModule & {
  prepareConfiguration: (
    input: PrepareConfigurationInput
  ) => Promise<{
    envText: string;
    values: Record<string, string>;
    generated: {
      seedUserEmail?: string;
      seedUserPassword?: string;
      schedulerTickSecret?: string;
    };
    missing: string[];
  }>;
  getPreparationCommands: () => string[][];
  buildServicePlan: (
    values: Record<string, string>
  ) => Array<{ name: string; command: string[]; kind: "process" | "scheduler" }>;
};

async function loadRuntimeStartAll(): Promise<StartAllModuleWithRuntime> {
  const url = pathToFileURL(resolve("scripts/start-all.mjs")).href;
  return (await import(url)) as StartAllModuleWithRuntime;
}

describe("native one-click deployment runtime planning", () => {
  it("prompts for required AMap and AI values in interactive mode", async () => {
    const { prepareConfiguration } = await loadRuntimeStartAll();
    const answers = new Map([
      ["AMAP_API_KEY", "amap-key"],
      ["OPENAI_API_KEY", "openai-key"],
      ["OPENAI_BASE_URL", "https://api.openai.com/v1"],
      ["OPENAI_MODEL", "gpt-4o-mini"]
    ]);

    const result = await prepareConfiguration({
      envText: [
        "DATABASE_URL=file:./data/commute.db",
        "DEFAULT_CITY=宁波",
        "DEFAULT_TIMEZONE=Asia/Shanghai",
        "AMAP_API_KEY=",
        "OPENAI_API_KEY=",
        "OPENAI_BASE_URL=",
        "OPENAI_MODEL="
      ].join("\n"),
      exampleText: "",
      args: { configure: false, yes: false },
      prompt: async (question, defaultValue) => {
        const key = question.match(/^([A-Z0-9_]+)/)?.[1];
        return key ? answers.get(key) ?? defaultValue ?? "" : defaultValue ?? "";
      },
      generator: { token: (bytes) => `token-${bytes}` }
    });

    expect(result.missing).toEqual([]);
    expect(result.values.AMAP_API_KEY).toBe("amap-key");
    expect(result.values.OPENAI_API_KEY).toBe("openai-key");
    expect(result.envText).toContain("SEED_USER_EMAIL=user-token-6@example.local");
    expect(result.generated.seedUserPassword).toBe("token-18");
  });

  it("does not prompt or invent required service keys in yes mode", async () => {
    const { prepareConfiguration } = await loadRuntimeStartAll();

    const result = await prepareConfiguration({
      envText: "DATABASE_URL=\nAMAP_API_KEY=\nOPENAI_API_KEY=\nOPENAI_MODEL=\n",
      exampleText: "",
      args: { configure: false, yes: true },
      prompt: async () => {
        throw new Error("prompt should not be called in --yes mode");
      },
      generator: { token: (bytes) => `token-${bytes}` }
    });

    expect(result.missing).toEqual(["AMAP_API_KEY", "OPENAI_API_KEY"]);
    expect(result.values.DATABASE_URL).toBe("file:./data/commute.db");
    expect(result.values.OPENAI_MODEL).toBe("gpt-4o-mini");
  });

  it("prepares install, prisma, seed, and production build commands", async () => {
    const { getPreparationCommands } = await loadRuntimeStartAll();

    expect(getPreparationCommands()).toEqual([
      ["npm", "install"],
      ["npm", "run", "prisma:generate"],
      ["npm", "run", "prisma:deploy"],
      ["npm", "run", "prisma:seed"],
      ["npm", "run", "build"]
    ]);
  });

  it("starts Telegram only when a bot token is configured", async () => {
    const { buildServicePlan } = await loadRuntimeStartAll();

    expect(buildServicePlan({ TELEGRAM_BOT_TOKEN: "" }).map((service) => service.name))
      .toEqual(["web", "scheduler"]);
    expect(buildServicePlan({ TELEGRAM_BOT_TOKEN: "bot-token" }).map((service) => service.name))
      .toEqual(["web", "scheduler", "telegram"]);
  });
});
```

- [ ] **Step 2: Run the focused test and verify the new tests fail for missing exports**

Run:

```bash
npm test -- tests/unit/start-all.test.ts
```

Expected: FAIL with `prepareConfiguration is not a function`, `getPreparationCommands is not a function`, or `buildServicePlan is not a function`.

## Task 4: Configuration Wizard and Startup Plan Implementation

**Files:**
- Modify: `scripts/start-all.mjs`

- [ ] **Step 1: Add interactive configuration and startup planning helpers**

Append these exports to `scripts/start-all.mjs`:

```js
async function promptForKey({ key, currentValue, prompt }) {
  const defaultValue = currentValue?.trim() || DEFAULTS[key] || "";
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const answer = await prompt(`${key}${suffix}: `, defaultValue);
  return answer.trim() || defaultValue;
}

function shouldPromptForKey({ key, args, values }) {
  if (args.yes) {
    return false;
  }

  if (args.configure) {
    return REQUIRED_KEYS.includes(key);
  }

  return REQUIRED_KEYS.includes(key) && !values[key]?.trim();
}

export async function prepareConfiguration({
  envText,
  exampleText,
  args,
  prompt,
  generator = createRandomGenerator()
}) {
  let document = parseDotEnv(envText ?? exampleText);
  let values = envDocumentToObject(document);
  const generatedResult = applyGeneratedDefaults(values, generator);
  values = generatedResult.values;

  for (const [key, value] of Object.entries(values)) {
    document = setEnvValue(document, key, value);
  }

  for (const key of REQUIRED_KEYS) {
    if (shouldPromptForKey({ key, args, values })) {
      values[key] = await promptForKey({
        key,
        currentValue: values[key],
        prompt
      });
      document = setEnvValue(document, key, values[key]);
    }
  }

  const missing = validateRequiredConfig(values);

  return {
    envText: serializeDotEnv(document),
    values,
    generated: generatedResult.generated,
    missing
  };
}

export function getPreparationCommands() {
  return [
    ["npm", "install"],
    ["npm", "run", "prisma:generate"],
    ["npm", "run", "prisma:deploy"],
    ["npm", "run", "prisma:seed"],
    ["npm", "run", "build"]
  ];
}

export function buildServicePlan(values) {
  const services = [
    { name: "web", command: ["npm", "run", "start"], kind: "process" },
    {
      name: "scheduler",
      command: ["npm", "run", "scheduler:tick"],
      kind: "scheduler"
    }
  ];

  if (values.TELEGRAM_BOT_TOKEN?.trim()) {
    services.push({
      name: "telegram",
      command: ["npm", "run", "telegram:poll"],
      kind: "process"
    });
  }

  return services;
}
```

- [ ] **Step 2: Run the focused test and verify it passes**

Run:

```bash
npm test -- tests/unit/start-all.test.ts
```

Expected: PASS for configuration and runtime planning tests.

- [ ] **Step 3: Commit the wizard and startup planning helpers**

Run:

```bash
git add scripts/start-all.mjs tests/unit/start-all.test.ts
git commit -m "feat: plan native deployment startup"
```

## Task 5: CLI Runtime, Process Supervision, and Wrappers

**Files:**
- Modify: `tests/unit/start-all.test.ts`
- Modify: `scripts/start-all.mjs`
- Create: `start-all.ps1`
- Create: `start-all.cmd`
- Create: `start-all.sh`
- Modify: `package.json`

- [ ] **Step 1: Add failing tests for package and wrapper wiring**

Append these tests to `tests/unit/start-all.test.ts`:

```ts
describe("native one-click deployment wrappers", () => {
  it("exposes the start:all npm script", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["start:all"]).toBe("node scripts/start-all.mjs");
  });

  it("provides Windows and Linux wrapper scripts", () => {
    const ps1 = readFileSync("start-all.ps1", "utf8");
    const cmd = readFileSync("start-all.cmd", "utf8");
    const sh = readFileSync("start-all.sh", "utf8");

    expect(ps1).toContain("scripts/start-all.mjs");
    expect(ps1).toContain("-Configure");
    expect(ps1).toContain("-Yes");
    expect(cmd).toContain("start-all.ps1");
    expect(sh).toContain("scripts/start-all.mjs");
    expect(sh).toContain("--configure");
    expect(sh).toContain("--yes");
  });
});
```

- [ ] **Step 2: Run the focused test and verify wrapper tests fail**

Run:

```bash
npm test -- tests/unit/start-all.test.ts
```

Expected: FAIL because `start:all` and wrapper files are missing.

- [ ] **Step 3: Add CLI runtime to `scripts/start-all.mjs`**

Append this runtime code to `scripts/start-all.mjs`:

```js
function commandToString(command) {
  return command.join(" ");
}

function runCommand(command, options = {}) {
  return new Promise((resolvePromise, reject) => {
    console.log(`[setup] ${commandToString(command)}`);
    const child = spawn(command[0], command.slice(1), {
      cwd: options.cwd,
      env: process.env,
      stdio: "inherit",
      shell: process.platform === "win32"
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(
        new Error(
          `${commandToString(command)} failed with ${
            signal ? `signal ${signal}` : `exit code ${code}`
          }`
        )
      );
    });
  });
}

function prefixOutput(stream, prefix, write) {
  let pending = "";
  stream.on("data", (chunk) => {
    pending += chunk.toString();
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      write(`[${prefix}] ${line}\n`);
    }
  });
}

function startProcessService(service, options) {
  const child = spawn(service.command[0], service.command.slice(1), {
    cwd: options.cwd,
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
    shell: process.platform === "win32"
  });

  prefixOutput(child.stdout, service.name, (text) => process.stdout.write(text));
  prefixOutput(child.stderr, service.name, (text) => process.stderr.write(text));

  child.on("exit", (code, signal) => {
    if (!options.stopping && code !== 0) {
      console.error(
        `[${service.name}] exited unexpectedly with ${
          signal ? `signal ${signal}` : `exit code ${code}`
        }`
      );
      options.stopAll(1);
    }
  });

  return child;
}

function startSchedulerLoop(service, options) {
  let timer;
  let stopped = false;

  const runTick = async () => {
    if (stopped) {
      return;
    }

    try {
      await runCommand(service.command, { cwd: options.cwd });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[scheduler] ${message}`);
    }

    if (!stopped) {
      timer = setTimeout(runTick, 60_000);
    }
  };

  void runTick();

  return {
    kill() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
    }
  };
}

async function askQuestion(question, defaultValue) {
  if (!globalThis.__startAllReadline) {
    globalThis.__startAllReadline = createInterface({ input, output });
  }
  const answer = await globalThis.__startAllReadline.question(question);
  return answer.trim() || defaultValue || "";
}

function closeReadline() {
  if (globalThis.__startAllReadline) {
    globalThis.__startAllReadline.close();
    globalThis.__startAllReadline = undefined;
  }
}

function printGeneratedCredentials(generated) {
  if (generated.seedUserEmail) {
    console.log(`[config] Generated seed user email: ${generated.seedUserEmail}`);
  }
  if (generated.seedUserPassword) {
    console.log(
      `[config] Generated seed user password: ${generated.seedUserPassword}`
    );
  }
  if (generated.schedulerTickSecret) {
    console.log("[config] Generated scheduler tick secret and saved it to .env");
  }
}

async function loadAndWriteConfiguration({ cwd, args }) {
  const envPath = resolve(cwd, ".env");
  const examplePath = resolve(cwd, ".env.example");
  const envText = existsSync(envPath) ? readFileSync(envPath, "utf8") : undefined;
  const exampleText = existsSync(examplePath)
    ? readFileSync(examplePath, "utf8")
    : "";

  const result = await prepareConfiguration({
    envText,
    exampleText,
    args,
    prompt: askQuestion
  });

  writeFileSync(envPath, result.envText, "utf8");
  closeReadline();

  if (result.missing.length > 0) {
    throw new Error(
      `Missing required configuration: ${result.missing.join(", ")}`
    );
  }

  printGeneratedCredentials(result.generated);
  return result.values;
}

async function startServices({ cwd, values }) {
  const services = buildServicePlan(values);
  if (!values.TELEGRAM_BOT_TOKEN?.trim()) {
    console.log("[telegram] TELEGRAM_BOT_TOKEN is empty; Telegram worker skipped.");
  }

  const children = [];
  const state = { stopping: false };
  const stopAll = (exitCode = 0) => {
    if (state.stopping) {
      return;
    }
    state.stopping = true;
    for (const child of children) {
      child.kill("SIGTERM");
    }
    process.exitCode = exitCode;
  };

  state.stopAll = stopAll;

  process.once("SIGINT", () => stopAll(0));
  process.once("SIGTERM", () => stopAll(0));

  for (const service of services) {
    if (service.kind === "scheduler") {
      children.push(startSchedulerLoop(service, { cwd }));
    } else {
      children.push(startProcessService(service, { cwd, ...state }));
    }
  }
}

export async function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const args = parseArgs(argv);
  const values = await loadAndWriteConfiguration({ cwd, args });

  for (const command of getPreparationCommands()) {
    await runCommand(command, { cwd });
  }

  await startServices({ cwd, values });
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  main().catch((error) => {
    closeReadline();
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[start-all] ${message}`);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Add wrapper scripts**

Create `start-all.ps1`:

```powershell
param(
  [switch]$Configure,
  [switch]$Yes
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js is required. Install Node.js 22 or newer, then run this script again."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Error "npm is required. Install Node.js with npm, then run this script again."
}

$ArgsList = @()
if ($Configure) {
  $ArgsList += "--configure"
}
if ($Yes) {
  $ArgsList += "--yes"
}

node "scripts/start-all.mjs" @ArgsList
```

Create `start-all.cmd`:

```bat
@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-all.ps1" %*
endlocal
```

Create `start-all.sh`:

```sh
#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node.js 22 or newer, then run this script again." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required. Install Node.js with npm, then run this script again." >&2
  exit 1
fi

exec node scripts/start-all.mjs "$@"
```

- [ ] **Step 5: Add `start:all` to `package.json`**

Modify the `scripts` block so it includes:

```json
"start:all": "node scripts/start-all.mjs"
```

- [ ] **Step 6: Run the focused test and verify it passes**

Run:

```bash
npm test -- tests/unit/start-all.test.ts
```

Expected: PASS for config, runtime planning, package, and wrapper tests.

- [ ] **Step 7: Commit runtime and wrappers**

Run:

```bash
git add scripts/start-all.mjs start-all.ps1 start-all.cmd start-all.sh package.json tests/unit/start-all.test.ts
git commit -m "feat: add native one-click deployment scripts"
```

## Task 6: README Documentation

**Files:**
- Modify: `README.md`
- Modify: `tests/unit/start-all.test.ts`

- [ ] **Step 1: Add failing README coverage**

Append this test to `tests/unit/start-all.test.ts`:

```ts
describe("native one-click deployment documentation", () => {
  it("documents the native deployment path beside Docker", () => {
    const readme = readFileSync("README.md", "utf8");

    expect(readme).toContain("本机一键部署");
    expect(readme).toContain("start-all.cmd");
    expect(readme).toContain("start-all.ps1");
    expect(readme).toContain("start-all.sh");
    expect(readme).toContain("AMAP_API_KEY");
    expect(readme).toContain("OPENAI_API_KEY");
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails for missing documentation**

Run:

```bash
npm test -- tests/unit/start-all.test.ts
```

Expected: FAIL because README does not contain the native deployment section yet.

- [ ] **Step 3: Add README section**

Add this section before the existing Docker section:

````md
## 本机一键部署

本机一键部署是和 Docker 并列的生产启动方式，适合不想使用容器、但希望一次启动 Web、scheduler 和 Telegram worker 的机器。

Windows：

```powershell
.\start-all.ps1
```

也可以双击 `start-all.cmd`。如果 PowerShell 执行策略拦截脚本，请使用 `start-all.cmd`，它会以 `ExecutionPolicy Bypass` 调用 PowerShell 入口。

Linux：

```bash
chmod +x ./start-all.sh
./start-all.sh
```

首次启动时，脚本会检查并补全 `.env`，然后执行依赖安装、Prisma 生成、数据库迁移、种子账号写入、生产构建和服务启动。高德地图与 AI Agent 配置是必填项：

- `AMAP_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`

`SEED_USER_EMAIL`、`SEED_USER_PASSWORD` 和 `SCHEDULER_TICK_SECRET` 如果留空，脚本会自动生成并写入 `.env`。随机生成的种子账号和密码会在首次生成时打印到控制台。

`TELEGRAM_BOT_TOKEN` 和 SMTP 配置是可选通知能力。未配置 Telegram token 时，脚本会跳过 Telegram worker，但 Web 和 scheduler 会继续启动。

可用参数：

```bash
npm run start:all -- --configure
npm run start:all -- --yes
```

`--configure` 会强制重新进入配置向导。`--yes` 适合自动化环境，缺少必填项时会直接失败并列出缺失配置。
````

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- tests/unit/start-all.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit README update**

Run:

```bash
git add README.md tests/unit/start-all.test.ts
git commit -m "docs: document native one-click deployment"
```

## Task 7: Final Verification

**Files:**
- Verify all touched files

- [ ] **Step 1: Run the focused test suite**

Run:

```bash
npm test -- tests/unit/start-all.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run type checking**

Run:

```bash
npm run lint
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Run the full unit and integration suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Verify non-interactive missing-config behavior without starting services**

Temporarily move the real `.env` aside outside the commit, create a minimal `.env`, and run:

```bash
npm run start:all -- --yes
```

Expected: FAIL before `npm install`, with a message listing `AMAP_API_KEY` and `OPENAI_API_KEY`. Restore the original `.env` immediately after the check.

- [ ] **Step 5: Inspect git status**

Run:

```bash
git status --short
```

Expected: only intentional source, test, wrapper, package, and README changes are present; `.env` remains untracked or unchanged.

- [ ] **Step 6: Final implementation commit if verification required changes**

Run only if verification forced additional tracked edits:

```bash
git add scripts/start-all.mjs start-all.ps1 start-all.cmd start-all.sh package.json README.md tests/unit/start-all.test.ts
git commit -m "fix: stabilize native deployment scripts"
```

## Self-Review

- Spec coverage: the tasks create Windows and Linux entry points, add `npm run start:all`, require AMap and AI Agent settings, generate seed credentials and scheduler secret, skip Telegram when unconfigured, run install/Prisma/seed/build, supervise Web/scheduler/Telegram, and document the deployment mode beside Docker.
- Red-flag scan: the plan contains concrete file paths, commands, code snippets, and expected outcomes; every implementation step is explicit.
- Type consistency: exported helper names used in tests match the implementation tasks: `parseArgs`, `parseDotEnv`, `serializeDotEnv`, `getEnvValue`, `setEnvValue`, `envDocumentToObject`, `applyGeneratedDefaults`, `validateRequiredConfig`, `prepareConfiguration`, `getPreparationCommands`, and `buildServicePlan`.
