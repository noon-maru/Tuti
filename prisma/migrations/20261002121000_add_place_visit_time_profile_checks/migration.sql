ALTER TABLE "place_visit_time_profiles"
  ADD CONSTRAINT "place_visit_time_profiles_stay_source_check" CHECK (
    "stay_source" IN ('llm_parsed', 'type_default', 'manual_override')
  ),
  ADD CONSTRAINT "place_visit_time_profiles_stay_flexibility_check" CHECK (
    "stay_flexibility" IN ('flexible', 'fixed', 'scheduled')
  ),
  ADD CONSTRAINT "place_visit_time_profiles_parking_availability_check" CHECK (
    "parking_availability" IN ('onsite', 'nearby', 'none', 'unknown')
  ),
  ADD CONSTRAINT "place_visit_time_profiles_car_suitability_check" CHECK (
    "car_suitability" IN ('good', 'possible', 'difficult', 'unavailable')
  ),
  ADD CONSTRAINT "place_visit_time_profiles_entry_process_check" CHECK (
    "entry_process" IN ('open', 'ticket', 'checkin', 'equipment')
  ),
  ADD CONSTRAINT "place_visit_time_profiles_reservation_requirement_check" CHECK (
    "reservation_requirement" IN ('none', 'recommended', 'required')
  ),
  ADD CONSTRAINT "place_visit_time_profiles_access_constraint_check" CHECK (
    "access_constraint" IN ('none', 'ferry', 'cablecar', 'long_walk', 'restricted')
  );
