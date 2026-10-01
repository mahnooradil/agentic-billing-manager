import { Types } from "mongoose";
import { describe, expect, it, vi, beforeEach, beforeAll, afterAll } from "vitest";

import { env } from "@/config/env";
import { AgentSession } from "@/models/agent-session.model";

const sessionsCreateMock = vi.fn();
const eventsStreamMock = vi.fn();
const eventsSendMock = vi.fn();
const sessionsArchiveMock = vi.fn();
const sessionsRetrieveMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    beta = {
      sessions: {
        create: sessionsCreateMock,
        retrieve: sessionsRetrieveMock,
        archive: sessionsArchiveMock,
        events: { stream: eventsStreamMock, send: eventsSendMock },
      },
    };
  },
}));

// Hoisted above these imports by vitest, so the mocked SDK is what the
// service actually constructs its client from.
import {
  sendAgentMessage,
  resetAgentSession,
  resetAllAgentSessionsForUser,
} from "@/services/agent/managed-agent.service";

/** A minimal async-iterable the service's `for await` loop can consume,
 *  yielding exactly the events a test wants, in order. */
function fakeStream(events: unknown[]): AsyncGenerator<unknown> {
  return (async function* () {
    for (const event of events) yield event;
  })();
}

function toolUseEvent(id: string, name = "unknown_test_tool") {
  return { type: "agent.custom_tool_use", id, name, input: {} };
}

describe("sendAgentMessage (WP-7 — MAX_ITERATIONS + org-scoped sessions)", () => {
  // Same cross-file leak risk as stripe-subscription.test.ts's identical
  // fix — `env`'s properties are mutated directly (not via vi.stubEnv), so
  // they must be explicitly restored or every test file that runs after
  // this one in the same worker inherits these fake values.
  const original = {
    anthropicApiKey: env.anthropicApiKey,
    anthropicAgentId: env.anthropicAgentId,
    anthropicEnvironmentId: env.anthropicEnvironmentId,
  };

  beforeAll(() => {
    (env as unknown as { anthropicApiKey: string }).anthropicApiKey = "sk-ant-test";
    (env as unknown as { anthropicAgentId: string }).anthropicAgentId = "agent_test";
    (env as unknown as { anthropicEnvironmentId: string }).anthropicEnvironmentId = "env_test";
  });

  afterAll(() => {
    (env as unknown as { anthropicApiKey: string }).anthropicApiKey = original.anthropicApiKey;
    (env as unknown as { anthropicAgentId: string }).anthropicAgentId = original.anthropicAgentId;
    (env as unknown as { anthropicEnvironmentId: string }).anthropicEnvironmentId =
      original.anthropicEnvironmentId;
  });

  beforeEach(() => {
    sessionsCreateMock.mockReset();
    eventsStreamMock.mockReset();
    eventsSendMock.mockReset();
    sessionsArchiveMock.mockReset();
    sessionsRetrieveMock.mockReset();
    sessionsCreateMock.mockResolvedValue({ id: `sesn_${Math.random()}` });
    eventsSendMock.mockResolvedValue(undefined);
  });

  it("stops calling the model's requested tools after the soft limit, and still returns a reply", async () => {
    // 10 tool-use events in a row (over the 8-call soft limit) followed by
    // a final text reply and termination.
    const events = [
      ...Array.from({ length: 10 }, (_, i) => toolUseEvent(`call_${i}`)),
      { type: "agent.message", content: [{ type: "text", text: "Here's what I found." }] },
      { type: "session.status_terminated" },
    ];
    eventsStreamMock.mockResolvedValue(fakeStream(events));

    const userId = new Types.ObjectId();
    const orgId = new Types.ObjectId();
    const result = await sendAgentMessage(userId, orgId, "do a lot of things");

    expect(result.reply).toBe("Here's what I found.");
    // Calls 1-8 get a normal tool_result send; calls 9-10 get the
    // "limit reached" decline send — both go through events.send, so the
    // call count itself should be 10 (one send per tool-use event, limit
    // or not) plus the original user.message send = 11.
    expect(eventsSendMock).toHaveBeenCalledTimes(11);
    const declineSends = eventsSendMock.mock.calls.filter((call) => {
      const payload = call[1] as { events: Array<{ content?: Array<{ text?: string }> }> };
      return payload.events[0]?.content?.[0]?.text?.includes("Tool call limit reached");
    });
    expect(declineSends).toHaveLength(2); // calls 9 and 10 (over the soft limit of 8)
  });

  it("the hard limit forces the loop to stop even if the model keeps calling tools indefinitely", async () => {
    // Far more tool-use events than even the hard limit (12) — a model
    // that never stops. The stream itself has 30 events queued up; the
    // service must never consume anywhere near all of them.
    const events = [
      ...Array.from({ length: 30 }, (_, i) => toolUseEvent(`call_${i}`)),
      { type: "agent.message", content: [{ type: "text", text: "should never be reached" }] },
    ];
    eventsStreamMock.mockResolvedValue(fakeStream(events));

    const userId = new Types.ObjectId();
    const orgId = new Types.ObjectId();

    // No text reply is ever produced (the loop breaks before reaching the
    // trailing agent.message), so this surfaces as the existing
    // "didn't return a response" error — the important assertion is that
    // the call actually RESOLVES (rejects) in finite time at all, proving
    // the loop terminated rather than consuming all 30 events.
    await expect(sendAgentMessage(userId, orgId, "loop forever")).rejects.toThrow();

    // At most 12 (hard limit) + 1 (the initial user.message) sends — proof
    // the loop stopped well short of all 30 tool-use events.
    expect(eventsSendMock.mock.calls.length).toBeLessThanOrEqual(13);
  });

  it("two different organizations for the same user get two independent session rows", async () => {
    const userId = new Types.ObjectId();
    const orgA = new Types.ObjectId();
    const orgB = new Types.ObjectId();

    sessionsCreateMock
      .mockResolvedValueOnce({ id: "sesn_org_a" })
      .mockResolvedValueOnce({ id: "sesn_org_b" });
    eventsStreamMock.mockImplementation(() =>
      Promise.resolve(
        fakeStream([
          { type: "agent.message", content: [{ type: "text", text: "ok" }] },
          { type: "session.status_terminated" },
        ])
      )
    );

    await sendAgentMessage(userId, orgA, "hello from org A");
    await sendAgentMessage(userId, orgB, "hello from org B");

    const sessions = await AgentSession.find({ user: userId }).sort({ organization: 1 });
    expect(sessions).toHaveLength(2);
    const sessionIds = sessions.map((s) => s.sessionId).sort();
    expect(sessionIds).toEqual(["sesn_org_a", "sesn_org_b"].sort());
  });

  it("resetAgentSession only clears the one organization's session, not the user's other organizations", async () => {
    const userId = new Types.ObjectId();
    const orgA = new Types.ObjectId();
    const orgB = new Types.ObjectId();
    await AgentSession.create({ user: userId, organization: orgA, sessionId: "sesn_a" });
    await AgentSession.create({ user: userId, organization: orgB, sessionId: "sesn_b" });
    sessionsArchiveMock.mockResolvedValue(undefined);

    await resetAgentSession(userId, orgA);

    const remaining = await AgentSession.find({ user: userId });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.organization.toString()).toBe(orgB.toString());
  });

  it("resetAllAgentSessionsForUser clears every organization's session for that user", async () => {
    const userId = new Types.ObjectId();
    await AgentSession.create({ user: userId, organization: new Types.ObjectId(), sessionId: "sesn_a" });
    await AgentSession.create({ user: userId, organization: new Types.ObjectId(), sessionId: "sesn_b" });
    sessionsArchiveMock.mockResolvedValue(undefined);

    await resetAllAgentSessionsForUser(userId);

    const remaining = await AgentSession.find({ user: userId });
    expect(remaining).toHaveLength(0);
    expect(sessionsArchiveMock).toHaveBeenCalledTimes(2);
  });
});
