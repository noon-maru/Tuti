export function isUserAiProfilingEnabled(
  value = process.env.TUTI_USER_AI_PROFILING_ENABLED,
) {
  return value?.trim().toLowerCase() === "true";
}

export type PersonalizationMode = "off" | "shadow" | "active";

export function getPersonalizationMode(
  configuredValue = process.env.TUTI_PERSONALIZATION_MODE,
): PersonalizationMode {
  const value = configuredValue?.trim().toLowerCase();
  return value === "active" || value === "shadow" ? value : "off";
}
