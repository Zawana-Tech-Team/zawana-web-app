/** Safe diagnostics: never serialize Error.message, stack, SQL, bind values or requests. */
type RecordValue = Record<string, unknown>;
const record = (v: unknown): RecordValue =>
  typeof v === "object" && v !== null ? (v as RecordValue) : {};
function sqlState(error: unknown): string | null {
  let current = record(error);
  for (let depth = 0; depth < 4; depth++) {
    const meta = record(current.meta);
    for (const code of [meta.code, current.sqlState, current.code])
      if (
        typeof code === "string" &&
        /^[0-9A-Z]{5}$/.test(code) &&
        !/^P\d{4}$/.test(code)
      )
        return code;
    current = record(current.cause);
  }
  return null;
}
export function isBookingDatabaseConflict(error: unknown) {
  const e = record(error);
  return (
    ["P2034", "P1008"].includes(String(e.code)) ||
    ["23P01", "40001", "40P01"].includes(sqlState(error) ?? "") ||
    /COURT_OVERLAP|Booking_no_overlap|23P01|SQLITE_BUSY|database is locked/i.test(
      String(e.message ?? ""),
    )
  );
}
export function apiFailureDiagnostic(
  error: unknown,
  context: {
    requestId: string;
    method: string;
    route: string;
    operation?: unknown;
  },
) {
  const e = record(error),
    meta = record(e.meta);
  const code =
    typeof e.code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(e.code)
      ? e.code
      : null;
  const status =
    e.name === "ZodError"
      ? 400
      : code === "P2025"
        ? 404
        : ["P2002", "P2003"].includes(code ?? "") ||
            isBookingDatabaseConflict(error)
          ? 409
          : typeof e.statusCode === "number" &&
              Number.isInteger(e.statusCode) &&
              e.statusCode >= 400 &&
              e.statusCode <= 599
            ? e.statusCode
            : 500;
  const state = sqlState(error);
  return {
    event: "api_request_failed",
    timestamp: new Date().toISOString(),
    requestId: context.requestId,
    method: context.method,
    route: context.route,
    status,
    operation:
      typeof context.operation === "string" &&
      /^[a-z_]{1,64}$/.test(context.operation)
        ? context.operation
        : null,
    code,
    sqlState: state,
    errorClass:
      typeof e.name === "string" && /^[A-Za-z]{1,80}$/.test(e.name)
        ? e.name
        : "Error",
    model: [
      "CourtBlock",
      "Court",
      "Booking",
      "BookingSubmission",
      "CourtDateOverride",
      "HolidayRate",
      "Notification",
    ].includes(String(meta.modelName))
      ? meta.modelName
      : null,
    category:
      state === "42601"
        ? "database_sql_syntax"
        : state === "42P01" || code === "P2021"
          ? "database_table_missing"
          : state === "42703" || code === "P2022"
            ? "database_column_missing"
            : state === "23P01"
              ? "database_overlap_constraint"
              : code === "BOOKING_CONFLICT"
                ? "booking_validation_conflict"
                : isBookingDatabaseConflict(error)
                  ? "database_contention"
                  : "request_failure",
    conflictCount: Array.isArray(e.conflicts) ? e.conflicts.length : 0,
  };
}
