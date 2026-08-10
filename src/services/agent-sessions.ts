import { randomUUID } from 'crypto';
import type { AgentScenarioKey } from './agent-scenarios';
import {
  createAgentRuntime,
  getAgentTranscript,
  type AgentProviderName,
  type AgentRuntime,
  type AgentTranscriptEntry,
} from './pi-agent';

/**
 * In-memory store for multi-turn agent chat sessions. Each session wraps a pi
 * core Agent that keeps the full conversation transcript, so follow-up
 * messages continue the same conversation.
 *
 * Sessions are process-local: they expire after an idle TTL and the store is
 * capped, with the oldest idle sessions evicted first.
 */

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes idle
const MAX_SESSIONS = 100;

export interface AgentSession {
  sessionId: string;
  runtime: AgentRuntime;
  createdAt: number;
  lastActivityAt: number;
}

export interface AgentSessionInfo {
  sessionId: string;
  provider: AgentProviderName;
  model: string;
  scenario: AgentScenarioKey;
  createdAt: string;
  lastActivityAt: string;
  messages: AgentTranscriptEntry[];
}

const sessions = new Map<string, AgentSession>();

function sweepExpiredSessions(): void {
  const now = Date.now();
  for (const [sessionId, session] of sessions) {
    if (now - session.lastActivityAt > SESSION_TTL_MS && !session.runtime.agent.state.isStreaming) {
      sessions.delete(sessionId);
    }
  }

  // Cap the store; evict the longest-idle sessions that are not mid-run
  if (sessions.size > MAX_SESSIONS) {
    const idleSessions = [...sessions.values()]
      .filter((session) => !session.runtime.agent.state.isStreaming)
      .sort((a, b) => a.lastActivityAt - b.lastActivityAt);
    for (const session of idleSessions.slice(0, sessions.size - MAX_SESSIONS)) {
      sessions.delete(session.sessionId);
    }
  }
}

export interface CreateSessionOptions {
  provider: AgentProviderName;
  model: string;
  scenario?: AgentScenarioKey;
  systemPrompt?: string;
}

export function createAgentSession(options: CreateSessionOptions): AgentSession {
  sweepExpiredSessions();
  const session: AgentSession = {
    sessionId: randomUUID(),
    runtime: createAgentRuntime(options),
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };
  sessions.set(session.sessionId, session);
  return session;
}

export function getAgentSession(sessionId: string): AgentSession | undefined {
  sweepExpiredSessions();
  const session = sessions.get(sessionId);
  if (session) {
    session.lastActivityAt = Date.now();
  }
  return session;
}

export function deleteAgentSession(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  if (session.runtime.agent.state.isStreaming) {
    session.runtime.agent.abort();
  }
  return sessions.delete(sessionId);
}

export function getAgentSessionInfo(session: AgentSession): AgentSessionInfo {
  return {
    sessionId: session.sessionId,
    provider: session.runtime.provider,
    model: session.runtime.model,
    scenario: session.runtime.scenario,
    createdAt: new Date(session.createdAt).toISOString(),
    lastActivityAt: new Date(session.lastActivityAt).toISOString(),
    messages: getAgentTranscript(session.runtime),
  };
}
