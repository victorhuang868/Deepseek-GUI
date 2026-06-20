// 运行时 API 的 REST 客户端封装
// 统一处理 base URL、可选鉴权令牌、错误解析

import {
  cancelJobRequest,
  cancelSubagentRequest,
  fetchJobDetail,
  fetchJobsList,
  fetchRlmSession,
  fetchRlmSessions,
  writeJobStdinRequest,
} from "./optionalHttp";
import {
  isHttpNotFound,
  mapAgentRunToSubAgent,
  mapAgentRunsResponse,
  type AgentRunsResponseJson,
  type AgentWorkerRecordJson,
} from "./agentRunsAlign";
import type {
  ApprovalDecision,
  CreateThreadRequest,
  RuntimeInfo,
  StartTurnRequest,
  ThreadDetail,
  ThreadRecord,
  ThreadSummary,
  TurnRecord,
  UsageAggregation,
  TasksResponse,
  JobsResponse,
  ShellJobDetail,
  SubagentsResponse,
  SubAgentResult,
  RlmSessionsResponse,
  RlmSessionSummary,
  SnapshotsResponse,
  RestoreSnapshotResponse,
  NewTaskRequest,
  SkillsResponse,
  McpServersResponse,
  SessionsResponse,
  ResumeSessionResponse,
  SaveSessionResponse,
  PatchUndoResponse,
  UndoTurnResponse,
  RetryTurnResponse,
  FleetRunsResponse,
  FleetRunSummary,
  FleetWorkerDetail,
  WorkspaceStatus,
  McpToolsResponse,
  AutomationRecord,
  AutomationRunRecord,
  CreateAutomationRequest,
  UserInputAnswerPayload,
  SnapshotEntry,
} from "./types";

/** 默认后端地址，与 deepseek serve --http 的默认监听一致 */
export const DEFAULT_BASE_URL = "http://127.0.0.1:7878";

/** 客户端配置 */
export interface ClientConfig {
  baseUrl: string;
  /** 可选鉴权令牌（对应 --auth-token / DEEPSEEK_RUNTIME_TOKEN） */
  token?: string;
}

/** 运行时 API 客户端 */
export class RuntimeClient {
  constructor(private cfg: ClientConfig) {}

  /** 供 optionalHttp 调用的请求绑定（避免 private request 类型泄漏） */
  private readonly httpFetch = <T,>(path: string, init?: RequestInit): Promise<T> =>
    this.request<T>(path, init);

  /** 组装请求头，按需附加鉴权令牌 */
  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json", ...extra };
    if (this.cfg.token) {
      // 后端同时支持 Authorization 与自定义头，这里用 Bearer
      h["Authorization"] = `Bearer ${this.cfg.token}`;
    }
    return h;
  }

  /** 统一的请求执行与错误处理 */
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.cfg.baseUrl}${path}`, {
      ...init,
      headers: this.headers(init?.headers as Record<string, string>),
    });
    if (!res.ok) {
      let detail = "";
      try {
        detail = await res.text();
      } catch {
        // 忽略读取失败
      }
      throw new Error(`HTTP ${res.status} ${res.statusText}${detail ? `: ${detail}` : ""}`);
    }
    // 部分接口可能无返回体
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /** 健康检查 */
  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.cfg.baseUrl}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  /** 运行时信息 */
  runtimeInfo(): Promise<RuntimeInfo> {
    return this.request<RuntimeInfo>("/v1/runtime/info");
  }

  /** 列出线程 */
  listThreads(includeArchived = false): Promise<ThreadRecord[]> {
    return this.request<ThreadRecord[]>(
      `/v1/threads?limit=100&include_archived=${includeArchived}`,
    );
  }

  /** 搜索线程摘要（标题/预览模糊匹配） */
  searchThreads(search?: string, limit = 30): Promise<ThreadSummary[]> {
    const q = new URLSearchParams();
    q.set("limit", String(limit));
    q.set("include_archived", "true");
    if (search) q.set("search", search);
    return this.request<ThreadSummary[]>(`/v1/threads/summary?${q.toString()}`);
  }

  /** 新建线程 */
  createThread(body: CreateThreadRequest): Promise<ThreadRecord> {
    return this.request<ThreadRecord>("/v1/threads", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /** 获取线程详情（含历史 turns 与 items） */
  getThread(id: string): Promise<ThreadDetail> {
    return this.request<ThreadDetail>(`/v1/threads/${id}`);
  }

  /** 预加载线程引擎（转向/续聊前确保后端已加载会话） */
  resumeThread(id: string): Promise<ThreadRecord> {
    return this.request<ThreadRecord>(`/v1/threads/${id}/resume`, {
      method: "POST",
    });
  }

  /** 归档/取消归档等部分更新 */
  patchThread(id: string, patch: Record<string, unknown>): Promise<ThreadRecord> {
    return this.request<ThreadRecord>(`/v1/threads/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }

  /** 发送消息（发起一个回合） */
  startTurn(threadId: string, body: StartTurnRequest): Promise<{ thread: ThreadRecord; turn: TurnRecord }> {
    return this.request(`/v1/threads/${threadId}/turns`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /** 转向（向进行中的回合追加指令） */
  steerTurn(threadId: string, turnId: string, prompt: string): Promise<TurnRecord> {
    return this.request(`/v1/threads/${threadId}/turns/${turnId}/steer`, {
      method: "POST",
      body: JSON.stringify({ prompt }),
    });
  }

  /** 打断回合 */
  interruptTurn(threadId: string, turnId: string): Promise<TurnRecord> {
    return this.request(`/v1/threads/${threadId}/turns/${turnId}/interrupt`, {
      method: "POST",
    });
  }

  /** 获取用量统计（默认按线程聚合，便于汇总会话总量） */
  getUsage(): Promise<UsageAggregation> {
    return this.request<UsageAggregation>("/v1/usage?group_by=thread");
  }

  /** 压缩上下文（/compact）：发起一次压缩回合 */
  compactThread(id: string, reason?: string): Promise<unknown> {
    return this.request(`/v1/threads/${id}/compact`, {
      method: "POST",
      body: JSON.stringify({ reason: reason ?? null }),
    });
  }

  /** 复刻会话（/fork）：基于当前会话创建副本，返回新会话 */
  forkThread(id: string): Promise<ThreadRecord> {
    return this.request<ThreadRecord>(`/v1/threads/${id}/fork`, {
      method: "POST",
    });
  }

  /** 撤销上一回合（/undo）：fork 出不含最近回合的新线程 */
  undoThread(id: string, depth = 0): Promise<UndoTurnResponse> {
    return this.request(`/v1/threads/${id}/undo`, {
      method: "POST",
      body: JSON.stringify({ depth }),
    });
  }

  /**
   * Patch 撤销（对齐 TUI /undo 主路径）：回滚工作区快照并 fork 去掉上一回合。
   */
  patchUndoThread(id: string, depth = 0): Promise<PatchUndoResponse> {
    return this.request(`/v1/threads/${id}/patch-undo`, {
      method: "POST",
      body: JSON.stringify({ depth }),
    });
  }

  /** 重试上一回合（/retry 服务端路径，与重发 user 消息互补） */
  retryThread(id: string): Promise<RetryTurnResponse> {
    return this.request(`/v1/threads/${id}/retry`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  /** 列出后台任务（含各状态计数） */
  listTasks(limit = 50): Promise<TasksResponse> {
    return this.request<TasksResponse>(`/v1/tasks?limit=${limit}`);
  }

  /** 新建后台任务（自主运行） */
  createTask(req: NewTaskRequest): Promise<unknown> {
    return this.request("/v1/tasks", {
      method: "POST",
      body: JSON.stringify(req),
    });
  }

  /** 取消队列中或运行中的任务 */
  cancelTask(id: string): Promise<unknown> {
    return this.request(`/v1/tasks/${id}/cancel`, { method: "POST" });
  }

  /** 列出后台 Shell 作业；v0.8.62 无 jobs HTTP 时返回空列表 */
  async listJobs(opts?: { status?: string; limit?: number }): Promise<JobsResponse> {
    const q = new URLSearchParams();
    if (opts?.status) q.set("status", opts.status);
    if (opts?.limit != null) q.set("limit", String(opts.limit));
    const qs = q.toString() ? `?${q.toString()}` : "";
    return fetchJobsList(this.httpFetch, qs);
  }

  /** 获取 Shell 作业详情（无 jobs API 时抛错） */
  getJob(id: string): Promise<ShellJobDetail> {
    return fetchJobDetail(this.httpFetch, id);
  }

  /** 取消 Shell 作业 */
  cancelJob(id: string): Promise<unknown> {
    return cancelJobRequest(this.httpFetch, id);
  }

  /** 向 Shell 作业写入 stdin */
  writeJobStdin(id: string, input: string, close = false): Promise<void> {
    return writeJobStdinRequest(this.httpFetch, id, input, close);
  }

  /**
   * 列出 Subagent 状态（对齐 TUI v0.8.62：GET /v1/agent-runs）。
   */
  async listSubagents(opts?: { includeArchived?: boolean; limit?: number }): Promise<SubagentsResponse> {
    void opts;
    const data = await this.request<AgentRunsResponseJson>("/v1/agent-runs");
    return mapAgentRunsResponse(data);
  }

  /** 获取单个 Subagent（GET /v1/agent-runs/{run_id}） */
  async getSubagent(agentId: string): Promise<SubAgentResult> {
    try {
      const record = await this.request<AgentWorkerRecordJson>(
        `/v1/agent-runs/${encodeURIComponent(agentId)}`,
      );
      return mapAgentRunToSubAgent(record);
    } catch (e) {
      if (!isHttpNotFound(e)) throw e;
      const data = await this.request<AgentRunsResponseJson>("/v1/agent-runs");
      const hit = mapAgentRunsResponse(data).agents.find((a) => a.agent_id === agentId);
      if (!hit) throw new Error(`agent run '${agentId}' not found`);
      return hit;
    }
  }

  /** 取消运行中的 Subagent（仅新版 sidecar 有 HTTP；404 时提示不可用） */
  async cancelSubagent(agentId: string): Promise<SubAgentResult> {
    try {
      return await cancelSubagentRequest(this.httpFetch, agentId);
    } catch (e) {
      if (isHttpNotFound(e)) {
        throw new Error("Subagent cancel HTTP API not available in v0.8.62 sidecar");
      }
      throw e;
    }
  }

  /** 列出 RLM 会话；v0.8.62 无 HTTP 时返回空（RLM 仅在运行时内存） */
  listRlmSessions(): Promise<RlmSessionsResponse> {
    return fetchRlmSessions(this.httpFetch);
  }

  /** 获取单个 RLM 会话 */
  getRlmSession(name: string): Promise<RlmSessionSummary> {
    return fetchRlmSession(this.httpFetch, name);
  }

  /** 列出工作区快照（TUI v0.8.62：GET /v1/snapshots，threadId 保留兼容） */
  async listSnapshots(_threadId: string, limit = 50): Promise<SnapshotsResponse> {
    const snapshots = await this.request<SnapshotEntry[]>(`/v1/snapshots?limit=${limit}`);
    return {
      workspace: "",
      snapshots: Array.isArray(snapshots) ? snapshots : [],
    };
  }

  /** 还原工作区到指定快照（POST /v1/snapshots/{id}/restore） */
  async restoreSnapshot(_threadId: string, snapshotId?: string): Promise<RestoreSnapshotResponse> {
    if (!snapshotId?.trim()) {
      throw new Error("snapshot_id required");
    }
    const r = await this.request<{ restored: string }>(
      `/v1/snapshots/${encodeURIComponent(snapshotId)}/restore`,
      { method: "POST" },
    );
    return { restored: r.restored, safety_snapshot: null };
  }

  /** 提交 request_user_input 工具的用户答案 */
  submitUserInput(
    threadId: string,
    inputId: string,
    answers: UserInputAnswerPayload[],
  ): Promise<{ ok: boolean; input_id: string; delivered: boolean }> {
    return this.request(`/v1/user-input/${encodeURIComponent(threadId)}/${encodeURIComponent(inputId)}`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    });
  }

  /** 列出技能（含启用状态、技能目录与告警） */
  listSkills(): Promise<SkillsResponse> {
    return this.request<SkillsResponse>("/v1/skills");
  }

  /** 启用/禁用某个技能 */
  setSkillEnabled(name: string, enabled: boolean): Promise<unknown> {
    return this.request(`/v1/skills/${encodeURIComponent(name)}`, {
      method: "POST",
      body: JSON.stringify({ enabled }),
    });
  }

  /** 列出已配置的 MCP 服务器及其连接/工具状态 */
  listMcpServers(): Promise<McpServersResponse> {
    return this.request<McpServersResponse>("/v1/apps/mcp/servers");
  }

  /** 列出历史会话（可搜索） */
  listSessions(search?: string, limit = 50): Promise<SessionsResponse> {
    const q = new URLSearchParams();
    q.set("limit", String(limit));
    if (search) q.set("search", search);
    return this.request<SessionsResponse>(`/v1/sessions?${q.toString()}`);
  }

  /** 将历史会话恢复为一个新线程 */
  resumeSession(id: string, body?: { model?: string; mode?: string }): Promise<ResumeSessionResponse> {
    return this.request<ResumeSessionResponse>(`/v1/sessions/${id}/resume-thread`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  }

  /** 删除历史会话 */
  deleteSession(id: string): Promise<unknown> {
    return this.request(`/v1/sessions/${id}`, { method: "DELETE" });
  }

  /**
   * 保存当前线程引擎快照为历史会话（PUT /v1/sessions，对齐 TUI /save）。
   */
  saveSession(body?: { thread_id?: string; session_id?: string }): Promise<SaveSessionResponse> {
    return this.request<SaveSessionResponse>("/v1/sessions", {
      method: "PUT",
      body: JSON.stringify(body ?? {}),
    });
  }

  /** 线程摘要列表（调试 / 搜索） */
  listThreadsSummary(limit = 50): Promise<ThreadSummary[]> {
    return this.request<ThreadSummary[]>(`/v1/threads/summary?limit=${limit}`);
  }

  /** Fleet 运行列表（GET /v1/fleet/runs） */
  listFleetRuns(): Promise<FleetRunsResponse> {
    return this.request<FleetRunsResponse>("/v1/fleet/runs");
  }

  /** Fleet 单次运行详情 */
  getFleetRun(runId: string): Promise<FleetRunSummary & Record<string, unknown>> {
    return this.request(`/v1/fleet/runs/${encodeURIComponent(runId)}`);
  }

  /** Fleet 运行下的 Worker 列表 */
  listFleetRunWorkers(runId: string): Promise<{ run_id: string; workers: FleetWorkerDetail[] }> {
    return this.request(`/v1/fleet/runs/${encodeURIComponent(runId)}/workers`);
  }

  /** 停止 Fleet 运行 */
  stopFleetRun(runId: string): Promise<unknown> {
    return this.request(`/v1/fleet/runs/${encodeURIComponent(runId)}/stop`, { method: "POST" });
  }

  /** 中断 Fleet Worker */
  interruptFleetWorker(workerId: string): Promise<unknown> {
    return this.request(`/v1/fleet/workers/${encodeURIComponent(workerId)}/interrupt`, {
      method: "POST",
    });
  }

  /** 重启 Fleet Worker */
  restartFleetWorker(workerId: string): Promise<unknown> {
    return this.request(`/v1/fleet/workers/${encodeURIComponent(workerId)}/restart`, {
      method: "POST",
    });
  }

  /** 回应审批请求 */
  decideApproval(approvalId: string, decision: ApprovalDecision): Promise<unknown> {
    return this.request(`/v1/approvals/${approvalId}`, {
      method: "POST",
      body: JSON.stringify(decision),
    });
  }

  /** 获取 Git 工作区状态 */
  getWorkspaceStatus(): Promise<WorkspaceStatus> {
    return this.request<WorkspaceStatus>("/v1/workspace/status");
  }

  /** 列出 MCP 工具（可选按 server 过滤） */
  listMcpTools(server?: string): Promise<McpToolsResponse> {
    const q = server ? `?server=${encodeURIComponent(server)}` : "";
    return this.request<McpToolsResponse>(`/v1/apps/mcp/tools${q}`);
  }

  /** 列出定时自动化 */
  listAutomations(): Promise<AutomationRecord[]> {
    return this.request<AutomationRecord[]>("/v1/automations");
  }

  /** 新建定时自动化 */
  createAutomation(body: CreateAutomationRequest): Promise<AutomationRecord> {
    return this.request<AutomationRecord>("/v1/automations", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /** 删除自动化 */
  deleteAutomation(id: string): Promise<unknown> {
    return this.request(`/v1/automations/${id}`, { method: "DELETE" });
  }

  /** 立即运行自动化 */
  runAutomation(id: string): Promise<unknown> {
    return this.request(`/v1/automations/${id}/run`, { method: "POST" });
  }

  /** 暂停自动化 */
  pauseAutomation(id: string): Promise<unknown> {
    return this.request(`/v1/automations/${id}/pause`, { method: "POST" });
  }

  /** 恢复自动化 */
  resumeAutomation(id: string): Promise<unknown> {
    return this.request(`/v1/automations/${id}/resume`, { method: "POST" });
  }

  /** 列出自动化运行记录 */
  listAutomationRuns(id: string, limit = 10): Promise<AutomationRunRecord[]> {
    return this.request<AutomationRunRecord[]>(`/v1/automations/${id}/runs?limit=${limit}`);
  }
}

/**
 * 轮询等待后端就绪（切换工作目录重启后端后使用）。
 * @returns 是否在超时前检测到健康
 */
export async function waitForBackend(
  client: RuntimeClient,
  opts?: { timeoutMs?: number; intervalMs?: number },
): Promise<boolean> {
  const timeoutMs = opts?.timeoutMs ?? 30000;
  const intervalMs = opts?.intervalMs ?? 400;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await client.health()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}
