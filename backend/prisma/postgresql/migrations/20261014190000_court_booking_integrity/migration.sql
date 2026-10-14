CREATE TABLE "BookingSubmission" ("userId" TEXT NOT NULL, "key" TEXT NOT NULL, "payloadHash" TEXT NOT NULL, "bookingIds" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("userId", "key"));

-- Deployment requires btree_gist permission. Conflicting legacy data must be resolved first; this migration fails rather than discard history.
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE FUNCTION zawana_booking_minutes(value TEXT) RETURNS INTEGER LANGUAGE SQL IMMUTABLE STRICT AS $$
 SELECT ((split_part(trim(value), ':', 1)::integer % 12) * 60) + substring(trim(value) from ':([0-9]{2})')::integer + CASE WHEN upper(trim(value)) LIKE '%PM' THEN 720 ELSE 0 END;
$$;
CREATE FUNCTION zawana_booking_span(value TEXT) RETURNS int4range LANGUAGE SQL IMMUTABLE STRICT AS $$
 SELECT int4range(zawana_booking_minutes(split_part(normalized, '—', 1)), zawana_booking_minutes(split_part(normalized, '—', 2)), '[)') FROM (SELECT regexp_replace(value, '\s*(—|–|-|to)\s*', '—', 'gi') normalized) parts;
$$;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_no_overlap" EXCLUDE USING gist ("courtId" WITH =, "date" WITH =, zawana_booking_span("time") WITH &&) WHERE ("courtId" IS NOT NULL AND status IN ('pending','confirmed','CONFIRMED','PENDING_COACH_CONFIRMATION','AWAITING_PAYMENT'));
