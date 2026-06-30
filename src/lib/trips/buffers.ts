import type {
  BufferComponentInput,
  NormalizedBufferComponent,
} from "@/lib/trips/types";

function normalizeMinutes(component: BufferComponentInput) {
  return Math.max(0, Math.round(component.minutes));
}

export function normalizeBufferComponents(
  components: BufferComponentInput[]
): NormalizedBufferComponent[] {
  return components.map((component, index) => ({
    order: index,
    category: component.category,
    label: component.label,
    minutes: normalizeMinutes(component),
    reason: component.reason,
    source: component.source ?? "agent_inference",
  }));
}
