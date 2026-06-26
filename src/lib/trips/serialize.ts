type JsonBackedTrip = {
  bufferJson: string;
  notificationJson: string;
  routeOptions?: unknown[];
  segments?: unknown[];
  reminderJobs?: unknown[];
  [key: string]: unknown;
};

type JsonBackedMemory = {
  valueJson: string;
  metadataJson?: string;
  [key: string]: unknown;
};

type JsonBackedAgentMessage = {
  metadataJson: string;
  [key: string]: unknown;
};

type JsonBackedAgentToolCall = {
  argumentsJson: string;
  resultJson: string;
  [key: string]: unknown;
};

export function serializeTrip<T extends JsonBackedTrip>(trip: T) {
  return {
    ...trip,
    buffer: safeJson(trip.bufferJson),
    notifications: safeJson(trip.notificationJson),
    routeOptions: trip.routeOptions || [],
    segments: trip.segments || [],
    reminderJobs: trip.reminderJobs || []
  };
}

export function serializeMemory<T extends JsonBackedMemory>(memory: T) {
  return {
    ...memory,
    value: safeJson(memory.valueJson),
    metadata: safeJson(memory.metadataJson || "{}")
  };
}

export function serializeAgentMessage<T extends JsonBackedAgentMessage>(message: T) {
  return {
    ...message,
    metadata: safeJson(message.metadataJson)
  };
}

export function serializeAgentToolCall<T extends JsonBackedAgentToolCall>(toolCall: T) {
  return {
    ...toolCall,
    arguments: safeJson(toolCall.argumentsJson),
    result: safeJson(toolCall.resultJson)
  };
}

export function safeJson(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
