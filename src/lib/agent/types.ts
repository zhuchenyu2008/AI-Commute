export type AgentToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AgentToolAction = {
  tool: string;
  arguments: Record<string, unknown>;
  reason?: string;
  id?: string;
};

export type AgentModelMessage = {
  role: "assistant";
  content?: string | null;
  tool_calls?: Array<{
    id?: string;
    type?: string;
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
};

export type AgentModelRequest = {
  sessionId: string;
  userText: string;
  tools: AgentToolDefinition[];
  context?: AgentTurnContext;
};

export type AgentModelResponse = {
  message: AgentModelMessage;
  supportsNativeTools: boolean;
};

export type AgentTurnContext = {
  tripId?: string | null;
  scheduled?: boolean;
  jobId?: string;
  payload?: Record<string, unknown>;
};

export type AgentToolContext = AgentTurnContext & {
  sessionId: string;
  userText: string;
};

export type AgentTurnResult = {
  assistantMessage: string;
  toolCalls: Array<{
    id?: string;
    toolName: string;
    status: string;
    reason?: string | null;
    arguments: Record<string, unknown>;
    result: unknown;
  }>;
  tripId: string | null;
};
