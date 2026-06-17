-- S3-TRIP-03(#79): cached provider route geometry for map polylines.
-- Stored on the destination stop, alongside the travel-time estimate from the previous stop.

ALTER TABLE itinerary_stops
    ADD COLUMN travel_geometry_json LONGTEXT NULL AFTER travel_distance_meters;
