-- Sprint 3 core: canonical Trip.status values are planning/upcoming/past.
UPDATE trips
SET status = CASE
    WHEN UPPER(status) IN ('DONE', 'PAST', 'COMPLETED') THEN 'past'
    WHEN UPPER(status) IN ('UPCOMING', 'CONFIRMED') THEN 'upcoming'
    WHEN UPPER(status) IN ('PLANNING', 'PLANNED') THEN 'planning'
    ELSE 'planning'
END;
