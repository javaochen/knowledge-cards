// 用 DeepSeek 的环境变量把 knowledge-cards/SKILL.md 注入为系统提示词，观察输出形状。
// 密钥只从环境变量读取，不写盘、不打印。
//
// 用法：
//   node experiments/deepseek-inject.mjs "你的问题"
//   node experiments/deepseek-inject.mjs --with-skill "你的问题"
//   node experiments/deepseek-inject.mjs --compare "你的问题"
//
// 环境变量：
//   DEEPSEEK_API_KEY   必填
//   DEEPSEEK_MODEL     可选，默认 deepseek-chat
//   DEEPSEEK_BASE_URL  可选，默认 https://api.deepseek.com/chat/completions

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const skillPath = join(here, "..", "knowledge-cards", "SKILL.md");

const DEFAULT_QUESTION =
  "我在学泛函分析，Riesz 表示定理和“有界线性算子”这两个东西老是分不清，帮我理一理。";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const question = args.filter((a) => !a.startsWith("--")).join(" ") || DEFAULT_QUESTION;

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error("缺少 DEEPSEEK_API_KEY 环境变量。");
  process.exit(1);
}

const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const endpoint =
  process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/chat/completions";

const skill = await readFile(skillPath, "utf8");

async function ask(withSkill) {
  const messages = [];
  if (withSkill) messages.push({ role: "system", content: skill });
  messages.push({ role: "user", content: question });

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.7 }),
    signal: AbortSignal.timeout(180_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = await res.json();
  const usage = data.usage ?? {};
  return {
    text: data.choices?.[0]?.message?.content ?? "(空响应)",
    usage,
  };
}

async function run(label, withSkill) {
  const started = Date.now();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${label}（${model}，${withSkill ? "注入 SKILL.md" : "裸模型"}）`);
  console.log("=".repeat(60));
  try {
    const { text, usage } = await ask(withSkill);
    console.log(text);
    console.log(
      `\n-- ${((Date.now() - started) / 1000).toFixed(1)}s，` +
        `输入 ${usage.prompt_tokens ?? "?"} / 输出 ${usage.completion_tokens ?? "?"} tokens`,
    );
  } catch (err) {
    console.log(`调用失败：${err.message}`);
  }
}

if (flags.has("--compare")) {
  await run("基线", false);
  await run("实验组", true);
} else if (flags.has("--with-skill")) {
  await run("实验组", true);
} else {
  await run("基线", false);
}
