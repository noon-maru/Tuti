ALTER TABLE "place_visit_time_profiles"
  ADD CONSTRAINT "place_visit_time_profiles_source_fingerprint_check" CHECK (
    "source_fingerprint" ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT "place_visit_time_profiles_model_check" CHECK (
    btrim("model") <> ''
  ),
  ADD CONSTRAINT "place_visit_time_profiles_profile_version_check" CHECK (
    btrim("profile_version") <> ''
  ),
  ADD CONSTRAINT "place_visit_time_profiles_evidence_check" CHECK (
    array_position("evidence", '') IS NULL
  );
