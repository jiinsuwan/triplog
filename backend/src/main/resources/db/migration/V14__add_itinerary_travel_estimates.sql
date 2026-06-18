-- S3-TRIP-03(#79): cached travel-time estimate for the leg ending at a stop.
-- The first stop in a day keeps these fields NULL. Later stops store the estimate
-- from the previous stop so itinerary reads do not repeatedly consume provider quota.

ALTER TABLE itinerary_stops
    ADD COLUMN travel_from_stop_id BIGINT NULL AFTER transport,
    ADD COLUMN travel_route_key VARCHAR(255) NULL AFTER travel_from_stop_id,
    ADD COLUMN travel_provider VARCHAR(30) NULL AFTER travel_route_key,
    ADD COLUMN travel_status VARCHAR(30) NULL AFTER travel_provider,
    ADD COLUMN travel_duration_seconds INT NULL AFTER travel_status,
    ADD COLUMN travel_distance_meters INT NULL AFTER travel_duration_seconds,
    ADD COLUMN travel_updated_at DATETIME NULL AFTER travel_distance_meters,
    ADD KEY idx_itinerary_stops_travel_from (travel_from_stop_id);
