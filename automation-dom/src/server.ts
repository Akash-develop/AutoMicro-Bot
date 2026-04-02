/**
 * Stdin/stdout JSON-lines IPC for DOM automation (Puppeteer + CDP).
 * Only connects to http://127.0.0.1 — validates debug port.
 */
import * as readline from "node:readline";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import type { IPCEnvelope, LayerExecutionResult, UINode } from "./schema-types.js";
import { AUTOMATION_SCHEMA_VERSION } from "./schema-types.js";

const SCHEMA = AUTOMATION_SCHEMA_VERSION;
const watches = new Map<string, { selector: string; fired: boolean }>();

let browser: Browser | null = null;
let page: Page | null = null;

function respond(env: IPCEnvelope, result: unknown, error: string | null = null): void {
  const out: IPCEnvelope = {
    schema_version: SCHEMA,
    id: env.id,
    kind: "response",
    result: error ? undefined : result,
    error,
  };
  process.stdout.write(JSON.stringify(out) + "\n");
}

function layerResult(
  success: boolean,
  confidence: number,
  method: string,
  layer: LayerExecutionResult["layer"],
  error: string | null,
  evidence: Record<string, unknown> = {}
): LayerExecutionResult {
  return {
    schema_version: SCHEMA,
    success,
    confidence,
    method,
    layer,
    error,
    evidence,
  };
}

async function ensureBrowser(port: number): Promise<Page> {
  if (port < 1 || port > 65535) throw new Error("invalid port");
  const url = `http://127.0.0.1:${port}`;
  if (!browser) {
    browser = await puppeteer.connect({
      browserURL: url,
      defaultViewport: null,
    });
  }
  const pages = await browser.pages();
  page = pages.find((p) => p.url() && !p.url().startsWith("devtools://")) ?? pages[0] ?? null;
  if (!page) {
    page = await browser.newPage();
  }
  return page;
}

function boundsFromElement(el: { x?: number; y?: number; width?: number; height?: number }): UINode["bounds"] {
  return {
    x: el.x ?? 0,
    y: el.y ?? 0,
    w: el.width ?? 0,
    h: el.height ?? 0,
  };
}

async function domToNode(
  handle: import("puppeteer-core").ElementHandle<Element>,
  idPrefix: string,
  depth: number,
  maxDepth: number
): Promise<UINode> {
  const tag = (await handle.evaluate((el) => el.tagName.toLowerCase())) as string;
  const text = (await handle.evaluate((el) => (el.textContent || "").trim().slice(0, 200))) as string;
  const box = await handle.boundingBox();
  const bid = `${idPrefix}_${depth}_${tag}`;
  const children: UINode[] = [];
  if (depth < maxDepth) {
    const kids = await handle.$$(":scope > *");
    let i = 0;
    for (const k of kids) {
      children.push(await domToNode(k, `${bid}_${i}`, depth + 1, maxDepth));
      i++;
    }
  }
  return {
    schema_version: SCHEMA,
    id: bid,
    type: tag === "button" || tag === "input" ? "button" : tag === "a" ? "link" : "group",
    name: text.slice(0, 120),
    value: null,
    bounds: box ? boundsFromElement(box) : { x: 0, y: 0, w: 0, h: 0 },
    children,
  };
}

async function getDomTree(port: number): Promise<{ root: UINode }> {
  const p = await ensureBrowser(port);
  const body = await p.$("body");
  if (!body) throw new Error("no body");
  const root = await domToNode(body, "root", 0, 8);
  return { root };
}

async function findByLabelOrSelector(
  p: Page,
  selector: string,
  label: string
): Promise<import("puppeteer-core").ElementHandle<Node> | null> {
  if (selector) {
    const hit = await p.$(selector);
    if (hit) return hit;
  }
  const handle = await p.evaluateHandle((lbl: string) => {
    const q = lbl.trim().toLowerCase();
    if (!q) return null;
    const candidates = document.querySelectorAll("button, a, input, [role='button']");
    for (const el of candidates) {
      const t = (el.textContent || "").trim().toLowerCase();
      const v = (el as HTMLInputElement).value?.toLowerCase() || "";
      const aria = (el.getAttribute("aria-label") || "").toLowerCase();
      if (t.includes(q) || v.includes(q) || aria.includes(q)) return el;
    }
    const all = document.querySelectorAll("*");
    for (const el of all) {
      const t = (el.textContent || "").trim().toLowerCase();
      if (t.length > 0 && t.length < 200 && t.includes(q)) return el as HTMLElement;
    }
    return null;
  }, label);
  return handle.asElement();
}

async function performClick(port: number, selector: string, label: string): Promise<LayerExecutionResult> {
  const p = await ensureBrowser(port);
  const el = (await findByLabelOrSelector(p, selector, label)) as
    | import("puppeteer-core").ElementHandle<Element>
    | null;
  if (!el) return layerResult(false, 0.2, "DOM", "dom", `not found for label: ${label}`);
  await el.click();
  return layerResult(true, 0.92, "DOM", "dom", null, { label });
}

async function performType(
  port: number,
  selector: string,
  label: string,
  text: string
): Promise<LayerExecutionResult> {
  const p = await ensureBrowser(port);
  const el = (await findByLabelOrSelector(p, selector, label)) as
    | import("puppeteer-core").ElementHandle<Element>
    | null;
  if (!el) return layerResult(false, 0.2, "DOM", "dom", `not found for label: ${label}`);
  await el.click({ clickCount: 1 });
  await p.keyboard.type(text, { delay: 15 });
  return layerResult(true, 0.9, "DOM", "dom", null, { label, chars: text.length });
}

async function performScroll(port: number, delta: number): Promise<LayerExecutionResult> {
  const p = await ensureBrowser(port);
  await p.evaluate((dy) => window.scrollBy(0, dy), delta);
  return layerResult(true, 0.85, "DOM", "dom", null, { delta });
}

async function handleExecute(params: Record<string, unknown>): Promise<LayerExecutionResult> {
  const port = Number(params.port ?? 9222);
  const action = (params.action ?? {}) as {
    action?: string;
    target?: { type?: string; value?: string };
    payload?: { text?: string; delta?: number };
  };
  const resolved = (params.resolved ?? {}) as { selector_hint?: string; label?: string };
  const act = action.action ?? "click";
  const label = resolved.label || action.target?.value || "";
  const selector =
    resolved.selector_hint && resolved.selector_hint.startsWith("[") ? resolved.selector_hint : "";

  if (act === "click") {
    return performClick(port, selector, label);
  }
  if (act === "type") {
    const t = action.payload?.text ?? "";
    return performType(port, selector, label, String(t));
  }
  if (act === "scroll") {
    const d = Number(action.payload?.delta ?? action.target?.value ?? 240);
    return performScroll(port, d);
  }
  return layerResult(false, 0, "DOM", "dom", `unsupported action ${act}`);
}

async function dispatch(env: IPCEnvelope): Promise<void> {
  const method = env.method ?? "";
  const params = (env.params ?? {}) as Record<string, unknown>;
  try {
    if (method === "health") {
      respond(env, { ok: true, service: "automation-dom" });
      return;
    }
    if (method === "getDomTree") {
      const port = Number(params.port ?? 9222);
      const tree = await getDomTree(port);
      respond(env, tree);
      return;
    }
    if (method === "execute") {
      const r = await handleExecute(params);
      respond(env, r);
      return;
    }
    if (method === "watchDom") {
      const sel = String(params.selector ?? "body");
      const jobId = `w_${Date.now()}`;
      watches.set(jobId, { selector: sel, fired: false });
      const p = await ensureBrowser(Number(params.port ?? 9222));
      await p.exposeFunction("__automicroPing", () => {
        const w = watches.get(jobId);
        if (w) w.fired = true;
      });
      await p.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) return;
        const obs = new MutationObserver(() => {
          (window as unknown as { __automicroPing?: () => void }).__automicroPing?.();
        });
        obs.observe(el, { subtree: true, childList: true, attributes: true });
      }, sel);
      respond(env, { jobId });
      return;
    }
    if (method === "pollWatch") {
      const jobId = String(params.jobId ?? "");
      const w = watches.get(jobId);
      const fired = w?.fired ?? false;
      if (w) w.fired = false;
      respond(env, { fired });
      return;
    }
    respond(env, null, `unknown method: ${method}`);
  } catch (e) {
    respond(env, null, e instanceof Error ? e.message : String(e));
  }
}

function main(): void {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    void (async () => {
      try {
        const env = JSON.parse(line) as IPCEnvelope;
        if (env.schema_version !== SCHEMA) {
          throw new Error(`schema_version mismatch: ${env.schema_version}`);
        }
        await dispatch(env);
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        process.stdout.write(
          JSON.stringify({
            schema_version: SCHEMA,
            id: "unknown",
            kind: "response",
            error: err,
          }) + "\n"
        );
      }
    })();
  });
}

main();
