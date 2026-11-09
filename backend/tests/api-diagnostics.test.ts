import test from "node:test";
import assert from "node:assert/strict";
import {
  apiFailureDiagnostic,
  isBookingDatabaseConflict,
} from "../src/utils/apiDiagnostics.js";
const context = {
  requestId: "test-request",
  method: "POST",
  route: "/api/court-blocks",
  operation: "insert_court_block",
};
test('authentication diagnostics retain upstream evidence and reject arbitrary provider metadata', () => {
  const diagnostic = apiFailureDiagnostic({ statusCode: 503, code: 'AUTH_CONFIGURATION', authDiagnostic: {
    operation: 'verify_id_token', category: 'configuration', firebaseCode: 'auth/argument-error',
    configurationReason: 'invalid_private_key', attempt: 1, endpoint: 'certificates',
    transportCode: 'ENOTFOUND', upstreamStatus: 403, message: 'private-secret', stack: 'private-secret',
  } }, context);
  assert.equal(diagnostic.authentication?.transportCode, 'ENOTFOUND');
  assert.equal(diagnostic.authentication?.endpoint, 'certificates');
  assert.equal(diagnostic.authentication?.upstreamStatus, 403);
  assert.equal(diagnostic.authentication?.configurationReason, 'invalid_private_key');
  const unsafe = apiFailureDiagnostic({ authDiagnostic: Object.fromEntries(
    ['operation', 'category', 'firebaseCode', 'configurationReason', 'attempt', 'endpoint', 'transportCode', 'upstreamStatus'].map(key => [key, 'private-secret'])
  ) }, context);
  assert.equal(JSON.stringify([diagnostic, unsafe]).includes('private-secret'), false);
});
test("raw-query failures retain SQLSTATE without SQL, bind values or credentials", () => {
  const error = {
    name: "PrismaClientKnownRequestError",
    code: "P2010",
    message:
      "secret-token customer@example.test postgresql://user:password@host/db",
    meta: {
      code: "42601",
      message: "sensitive SQL and customer values",
      query: "INSERT secret",
      values: ["private-phone"],
    },
  };
  const row = apiFailureDiagnostic(error, context);
  assert.equal(row.status, 500);
  assert.equal(row.sqlState, "42601");
  assert.equal(row.category, "database_sql_syntax");
  assert.equal(row.operation, "insert_court_block");
  const serialized = JSON.stringify(row);
  for (const secret of [
    "secret-token",
    "customer@example.test",
    "password",
    "private-phone",
    "sensitive SQL",
  ])
    assert.ok(!serialized.includes(secret));
});
test("expected booking rejections and database overlap/contention are distinct", () => {
  assert.equal(
    apiFailureDiagnostic(
      {
        code: "BOOKING_CONFLICT",
        statusCode: 409,
        conflicts: [{ courtName: "private" }],
      },
      context,
    ).category,
    "booking_validation_conflict",
  );
  assert.equal(
    apiFailureDiagnostic({ code: "P2010", meta: { code: "23P01" } }, context)
      .category,
    "database_overlap_constraint",
  );
  assert.equal(
    apiFailureDiagnostic({ code: "P2034" }, context).category,
    "database_contention",
  );
  assert.equal(
    isBookingDatabaseConflict({ code: "P2010", meta: { code: "42601" } }),
    false,
  );
  assert.equal(
    isBookingDatabaseConflict({ code: "P2010", meta: { code: "23P01" } }),
    true,
  );
});
test("schema drift is categorized without logging the complete error", () => {
  assert.equal(
    apiFailureDiagnostic(
      { code: "P2021", meta: { modelName: "CourtBlock" } },
      context,
    ).category,
    "database_table_missing",
  );
  assert.equal(
    apiFailureDiagnostic({ code: "P2010", meta: { code: "42703" } }, context)
      .category,
    "database_column_missing",
  );
});
