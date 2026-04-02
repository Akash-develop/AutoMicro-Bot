/**
 * Mirror of auto-bot/schema/automation/*.schema.json — keep in sync when schema_version bumps.
 */
export const AUTOMATION_SCHEMA_VERSION = "1.0" as const;

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface UINode {
  schema_version: typeof AUTOMATION_SCHEMA_VERSION;
  id: string;
  type: string;
  name: string;
  value: string | null;
  bounds: Bounds;
  children: UINode[];
}

export type ActionKind = "click" | "type" | "scroll" | "focus" | "press" | "wait";
export type TargetType = "text" | "role" | "selector" | "coords" | "xpath" | "label";

export interface ActionTarget {
  type: TargetType;
  value: string;
}

export interface StructuredAction {
  schema_version: typeof AUTOMATION_SCHEMA_VERSION;
  action: ActionKind;
  target: ActionTarget;
  confidence: number;
  payload: Record<string, unknown>;
}

export type AutomationLayer = "dom" | "ax" | "vision" | "input" | "script" | "orchestrator";

export interface LayerExecutionResult {
  schema_version: typeof AUTOMATION_SCHEMA_VERSION;
  success: boolean;
  confidence: number;
  method: string;
  layer: AutomationLayer;
  error: string | null;
  evidence: Record<string, unknown>;
}

export interface LayerAttempt {
  layer: string;
  at: string;
  outcome: string;
  confidence?: number;
}

export type AutomationStatus = "idle" | "running" | "success" | "failed" | "pending_confirmation";

export interface AutomationStateSnapshot {
  schema_version: typeof AUTOMATION_SCHEMA_VERSION;
  frontApp: string;
  windowTitle: string;
  lastAction: string;
  status: AutomationStatus;
  retryCount: number;
  layerAttempts: LayerAttempt[];
}

export type IPCKind = "request" | "response" | "event";

export interface IPCEnvelope {
  schema_version: typeof AUTOMATION_SCHEMA_VERSION;
  id: string;
  kind: IPCKind;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: string | null;
}
