export const DEFAULT_PLANNING_MODEL = "gpt-4o-mini";
export const TRAVEL_PLANNING_MODEL = "deepseek-v4-flash";

export const PLANNING_MODEL_OPTIONS = [
  ["gpt-4o-mini", "GPT-4o mini"],
  ["deepseek-v4-flash", "DeepSeek V4 Flash"],
  ["deepseek-v4-pro", "DeepSeek V4 Pro"],
] as const;

const SUPPORTED_PLANNING_MODELS: Set<string> = new Set(
  PLANNING_MODEL_OPTIONS.map(([value]) => value)
);

export function isSupportedPlanningModel(value: string) {
  return SUPPORTED_PLANNING_MODELS.has(value);
}
