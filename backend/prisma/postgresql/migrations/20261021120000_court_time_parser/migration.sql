-- Forward-only: preserve every booking; fail atomically on invalid/overlapping legacy data.
-- The exclusion index must be rebuilt when its immutable parser changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
LOCK TABLE "Booking" IN ACCESS EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION public.zawana_booking_minutes(value TEXT)
RETURNS INTEGER LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  pieces TEXT[];
  hour_value INTEGER;
  minute_value INTEGER;
BEGIN
  pieces := regexp_match(btrim(value), '^([0-9]{1,2}):([0-9]{2})[[:space:]]*(AM|PM)?$', 'i');
  IF pieces IS NULL THEN
    RAISE EXCEPTION 'INVALID_BOOKING_TIME: expected HH:MM or h:mm AM/PM' USING ERRCODE = '22007';
  END IF;
  hour_value := pieces[1]::INTEGER;
  minute_value := pieces[2]::INTEGER;
  IF minute_value > 59 OR (pieces[3] IS NULL AND hour_value > 23)
     OR (pieces[3] IS NOT NULL AND (hour_value < 1 OR hour_value > 12)) THEN
    RAISE EXCEPTION 'INVALID_BOOKING_TIME: clock component out of range' USING ERRCODE = '22007';
  END IF;
  IF pieces[3] IS NOT NULL THEN
    hour_value := hour_value % 12;
    IF upper(pieces[3]) = 'PM' THEN hour_value := hour_value + 12; END IF;
  END IF;
  RETURN hour_value * 60 + minute_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.zawana_booking_span(value TEXT)
RETURNS int4range LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  pieces TEXT[];
  start_minute INTEGER;
  end_minute INTEGER;
BEGIN
  pieces := regexp_split_to_array(btrim(value), '[[:space:]]*(—|–|-|to)[[:space:]]*', 'i');
  IF array_length(pieces, 1) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'INVALID_BOOKING_TIME: expected one start/end pair' USING ERRCODE = '22007';
  END IF;
  start_minute := public.zawana_booking_minutes(pieces[1]);
  end_minute := public.zawana_booking_minutes(pieces[2]);
  IF end_minute <= start_minute THEN
    RAISE EXCEPTION 'INVALID_BOOKING_TIME: end must follow start' USING ERRCODE = '22007';
  END IF;
  RETURN int4range(start_minute, end_minute, '[)');
END;
$$;

-- No table rewrite or booking updates. Rebuilding validates the full active data set.
-- Real overlaps/invalid active times abort this transaction and retain the previous constraint.
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_no_overlap";
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_no_overlap"
EXCLUDE USING gist (
  "courtId" WITH =,
  "date" WITH =,
  public.zawana_booking_span("time") WITH &&
) WHERE ("courtId" IS NOT NULL AND status IN (
  'pending','confirmed','CONFIRMED','PENDING_COACH_CONFIRMATION','AWAITING_PAYMENT'
));
COMMIT;
