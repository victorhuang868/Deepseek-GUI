// 可选 HTTP 端点：TUI v0.8.62 未注册，仅在新版 sidecar 可用时调用（404 则降级）
// 与 client.ts 分离，避免 compare-gap 误报为 TUI 路由缺失

import type {
  JobsResponse,
  RlmSessionSummary,
  RlmSessionsResponse,
  ShellJobDetail,
  SubAgentResult,
} from "./types";
import { emptyJobsResponse, emptyRlmSessionsResponse, isHttpNotFound } from "./agentRunsAlign";

/** 内部 HTTP 请求函数（由 RuntimeClient 注入） */
export type HttpFetch = <T>(path: string, init?: RequestInit) => Promise<T>;

/** 列出 Shell Jobs（无 API 时返回空） */
export async function fetchJobsList(fetch: HttpFetch, qs: string): Promise<JobsResponse> {
  try {
    const res = await fetch<JobsResponse>(`/v1/jobs${qs}`);
    return { ...res, apiAvailable: true };
  } catch (e) {
    if (isHttpNotFound(e)) return emptyJobsResponse();
    throw e;
  }
}

/** 获取 Job 详情 */
export function fetchJobDetail(fetch: HttpFetch, id: string): Promise<ShellJobDetail> {
  return fetch<ShellJobDetail>(`/v1/jobs/${encodeURIComponent(id)}`);
}

/** 取消 Job */
export function cancelJobRequest(fetch: HttpFetch, id: string): Promise<unknown> {
  return fetch(`/v1/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}

/** 写入 Job stdin */
export function writeJobStdinRequest(
  fetch: HttpFetch,
  id: string,
  input: string,
  close: boolean,
): Promise<void> {
  return fetch(`/v1/jobs/${encodeURIComponent(id)}/stdin`, {
    method: "POST",
    body: JSON.stringify({ input, close }),
  });
}

/** 列出 RLM 会话（无 API 时返回空） */
export async function fetchRlmSessions(fetch: HttpFetch): Promise<RlmSessionsResponse> {
  try {
    const res = await fetch<RlmSessionsResponse>("/v1/rlm/sessions");
    return { ...res, apiAvailable: true };
  } catch (e) {
    if (isHttpNotFound(e)) return emptyRlmSessionsResponse();
    throw e;
  }
}

/** 获取单个 RLM 会话 */
export function fetchRlmSession(fetch: HttpFetch, name: string): Promise<RlmSessionSummary> {
  return fetch<RlmSessionSummary>(`/v1/rlm/sessions/${encodeURIComponent(name)}`);
}

/** 取消 Subagent（新版 sidecar 才有；404 时抛错由调用方处理） */
export function cancelSubagentRequest(fetch: HttpFetch, agentId: string): Promise<SubAgentResult> {
  return fetch<SubAgentResult>(`/v1/subagents/${encodeURIComponent(agentId)}/cancel`, {
    method: "POST",
  });
}
