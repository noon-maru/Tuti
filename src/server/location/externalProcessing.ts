export type ExternalLocationProcessingMode =
  | "pending"
  | "processor"
  | "third_party";

export class ExternalLocationProcessingPendingError extends Error {
  readonly code = "external_location_processing_pending";

  constructor() {
    super("외부 위치정보 처리 관계를 확인하고 있어요.");
    this.name = "ExternalLocationProcessingPendingError";
  }
}

export function getExternalLocationProcessingMode(): ExternalLocationProcessingMode {
  const value = process.env.LOCATION_EXTERNAL_COORDINATE_MODE?.trim();
  return value === "processor" || value === "third_party"
    ? value
    : "pending";
}

export function requireExternalLocationProcessingMode() {
  const mode = getExternalLocationProcessingMode();
  if (mode !== "processor") {
    throw new ExternalLocationProcessingPendingError();
  }
  return mode;
}
