// 将 CodeWhale /v1/agent-runs 响应映射为 GUI Subagent 模型（v0.8.62 无 /v1/subagents）

import type { SubAgentResult, SubagentsResponse } from "./types";

/** 判断 fetch 错误是否为 HTTP 404 */
export function isHttpNotFound(err: unknown): boolean {
  const msg = (err as Error)?.message ?? "";
  return msg.includes("404") || msg.includes("Not Found");
}

/** TUI AgentWorkerRecord（精简字段，与 runtime_api JSON 对齐） */
export interface AgentWorkerRecordJson {
  spec: {
    worker_id: string;
    run_id?: string;
    session_name?: string | null;
    objective: string;
    role?: string | null;
    agent_type: string | Record<string, unknown>;
    model: string;
    context_mode: string;
    fork_context: boolean;
  };
  status: string;
  result_summary?: string | null;
  error?: string | null;
  steps_taken?: number;
  started_at_ms?: number | null;
  completed_at_ms?: number | null;
}

/** agent-runs 列表响应 */
export interface AgentRunsResponseJson {
  runs: AgentWorkerRecordJson[];
}

/** 运行中状态集合（用于 running_count） */
const RUNNING_STATUSES = new Set([
  "Queued",
  "Starting",
  "Running",
  "WaitingForUser",
  "ModelWait",
  "RunningTool",
]);

/** 单条 agent run → SubAgentResult */
export function mapAgentRunToSubAgent(record: AgentWorkerRecordJson): SubAgentResult {
  const spec = record.spec;
  const agentId = spec.run_id?.trim() ? spec.run_id : spec.worker_id;
  const agentType =
    typeof spec.agent_type === "string" ? spec.agent_type : JSON.stringify(spec.agent_type);
  let durationMs = 0;
  if (record.started_at_ms != null && record.completed_at_ms != null) {
    durationMs = Math.max(0, record.completed_at_ms - record.started_at_ms);
  }
  return {
    name: spec.session_name?.trim() || spec.worker_id,
    agent_id: agentId,
    context_mode: spec.context_mode,
    fork_context: spec.fork_context,
    agent_type: agentType,
    assignment: {
      objective: spec.objective,
      role: spec.role?.trim() || "",
    },
    model: spec.model,
    nickname: spec.session_name ?? null,
    status: record.status,
    result: record.result_summary ?? record.error ?? null,
    steps_taken: record.steps_taken ?? 0,
    duration_ms: durationMs,
  };
}

/** agent-runs 列表 → SubagentsResponse */
export function mapAgentRunsResponse(data: AgentRunsResponseJson): SubagentsResponse {
  const agents = (data.runs ?? []).map(mapAgentRunToSubAgent);
  const running_count = (data.runs ?? []).filter((r) => RUNNING_STATUSES.has(r.status)).length;
  return { agents, running_count, apiSource: "agent-runs" };
}

/** Jobs API 不可用时返回空列表 */
export function emptyJobsResponse(): import("./types").JobsResponse {
  return { jobs: [], running_count: 0, apiAvailable: false };
}

/** RLM API 不可用时返回空列表 */
export function emptyRlmSessionsResponse(): import("./types").RlmSessionsResponse {
  return { sessions: [], open_count: 0, apiAvailable: false };
}
