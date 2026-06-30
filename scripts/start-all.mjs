import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";

const GENERATED_DEFAULTS = {
  DATABASE_URL: "file:./data/commute.db",
  DEFAULT_CITY: "宁波",
  DEFAULT_TIMEZONE: "Asia/Shanghai",
  OPENAI_BASE_URL: "https://api.openai.com/v1",
  OPENAI_MODEL: "gpt-4o-mini"
};

const REQUIRED_KEYS = [
  "DATABASE_URL",
  "DEFAULT_CITY",
  "DEFAULT_TIMEZONE",
  "AMAP_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL"
];

const INTERACTIVE_PROMPT_KEYS = [
  "AMAP_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL"
];

const SENSITIVE_KEYS = new Set([
  "AMAP_API_KEY",
  "OPENAI_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "SMTP_PASS",
  "SMTP_PASSWORD"
]);

export function parseArgs(argv) {
  return {
    configure: argv.includes("--configure"),
    yes: argv.includes("--yes")
  };
}

export function parseDotEnv(text) {
  const lines = text.split(/\r?\n/);

  return {
    lines: lines.map((raw) => {
      const match = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);

      if (!match) {
        return { type: "raw", raw };
      }

      return {
        type: "entry",
        key: match[1],
        value: match[2]
      };
    })
  };
}

export function serializeDotEnv(document) {
  return document.lines
    .map((line) => {
      if (line.type !== "entry") {
        return line.raw;
      }

      return `${line.key}=${line.value}`;
    })
    .join("\n");
}

export function getEnvValue(document, key) {
  const line = findLastEnvEntry(document.lines, key);

  return line?.value;
}

export function setEnvValue(document, key, value) {
  const lines = [...document.lines];
  const index = findLastEnvEntryIndex(lines, key);

  if (index === -1) {
    const insertAt = isTrailingBlankRawLine(lines)
      ? lines.length - 1
      : lines.length;
    lines.splice(insertAt, 0, { type: "entry", key, value });
  } else {
    lines[index] = { ...lines[index], value };
  }

  return { lines };
}

export function envDocumentToObject(document) {
  return document.lines.reduce((values, line) => {
    if (line.type === "entry") {
      values[line.key] = line.value;
    }

    return values;
  }, {});
}

export function createRandomGenerator() {
  return {
    token(bytes) {
      return randomBytes(bytes).toString("base64url");
    }
  };
}

export function applyGeneratedDefaults(
  values,
  generator = createRandomGenerator()
) {
  const nextValues = { ...values };
  const generated = {};

  for (const [key, value] of Object.entries(GENERATED_DEFAULTS)) {
    if (isEmpty(nextValues[key])) {
      nextValues[key] = value;
    }
  }

  if (isEmpty(nextValues.SEED_USER_EMAIL)) {
    nextValues.SEED_USER_EMAIL = `user-${generator.token(6)}@example.local`;
    generated.seedUserEmail = nextValues.SEED_USER_EMAIL;
  }

  if (isEmpty(nextValues.SEED_USER_PASSWORD)) {
    nextValues.SEED_USER_PASSWORD = generator.token(18);
    generated.seedUserPassword = nextValues.SEED_USER_PASSWORD;
  }

  if (isEmpty(nextValues.SCHEDULER_TICK_SECRET)) {
    nextValues.SCHEDULER_TICK_SECRET = generator.token(24);
    generated.schedulerTickSecret = nextValues.SCHEDULER_TICK_SECRET;
  }

  return { values: nextValues, generated };
}

export function validateRequiredConfig(values) {
  return REQUIRED_KEYS.filter((key) => isEmpty(values[key]));
}

async function promptForKey({ key, currentValue, prompt }) {
  const defaultValue = currentValue?.trim() || GENERATED_DEFAULTS[key] || "";
  const displayValue =
    defaultValue && SENSITIVE_KEYS.has(key) ? "configured" : defaultValue;
  const suffix = displayValue ? ` [${displayValue}]` : "";
  const answer = await prompt(`${key}${suffix}: `, defaultValue);

  return answer.trim() || defaultValue;
}

function shouldPromptForKey({ key, args, values }) {
  if (args.yes) {
    return false;
  }

  if (args.configure) {
    return true;
  }

  return isEmpty(values[key]);
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
  const originalValues = { ...values };
  const generatedResult = applyGeneratedDefaults(values, generator);
  values = generatedResult.values;

  for (const [key, value] of Object.entries(values)) {
    document = setEnvValue(document, key, value);
  }

  const promptKeys = args.configure ? REQUIRED_KEYS : INTERACTIVE_PROMPT_KEYS;

  for (const key of promptKeys) {
    if (shouldPromptForKey({ key, args, values: originalValues })) {
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

function isEmpty(value) {
  return value === undefined || value.trim() === "";
}

function findLastEnvEntry(lines, key) {
  const index = findLastEnvEntryIndex(lines, key);

  if (index === -1) {
    return undefined;
  }

  return lines[index];
}

function findLastEnvEntryIndex(lines, key) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];

    if (line.type === "entry" && line.key === key) {
      return index;
    }
  }

  return -1;
}

function isTrailingBlankRawLine(lines) {
  const lastLine = lines.at(-1);

  return lastLine?.type === "raw" && lastLine.raw === "";
}

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
