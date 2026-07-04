export type AgentToolName =
  | "read_settings"
  | "read_memories"
  | "search_poi"
  | "get_poi_detail"
  | "get_weather_reference"
  | "get_transit_route"
  | "get_walking_route"
  | "get_bicycling_route"
  | "create_trip"
  | "create_reminders"
  | "create_notification_log"
  | "read_current_trip"
  | "update_trip_summary"
  | "replace_trip_stops"
  | "replace_trip_legs"
  | "select_route_candidate"
  | "replace_reminder_schedule"
  | "cancel_trip_monitoring"
  | "create_memory_candidate";

export type AgentSessionStatus =
  | "running"
  | "completed"
  | "failed"
  | "timed_out";

export type AgentToolCallStatus = "running" | "completed" | "failed";

export type StartPlanningSessionInput = {
  userId: string;
  prompt: string;
  currentLocation?: {
    name: string;
    lngLat: string;
    city?: string;
  };
};

export type ContinueAgentSessionInput = {
  userId: string;
  sessionId: string;
  message: string;
};

export type PlanningSessionResult = {
  sessionId: string;
  status: AgentSessionStatus;
  tripId: string | null;
};

export type PlanningAttemptResult = {
  tripId: string;
  summary: string;
};
