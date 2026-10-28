import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createSessionService } from "../src/services/authSession.js";

import { today } from "../src/services/courtPolicy.js";

const schema = execFileSync(
  new URL("../node_modules/.bin/prisma", import.meta.url).pathname,
  [
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema-datamodel",
    new URL("../prisma/schema.prisma", import.meta.url).pathname,
    "--script",
  ],
  { encoding: "utf8" },
);
test("staff private course booking, finance and cash custody", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "zawana-courts-")),
    file = join(dir, "test.db");
  const sqlite = new DatabaseSync(file);
  sqlite.exec(schema);
  const migration = readFileSync(
    new URL(
      "../prisma/migrations/20261014190000_court_booking_integrity/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  sqlite.exec(migration.slice(migration.indexOf("-- These guards")));
  sqlite.close();
  const db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  const user = await db.user.create({
    data: {
      name: "Booking QA",
      email: "court-qa@example.test",
      role: "member",
    },
  });
  const other = await db.user.create({
    data: {
      name: "Other QA",
      email: "court-other@example.test",
      role: "member",
    },
  });
  const coach = await db.user.create({
    data: { name: "Coach QA", email: "coach@example.test", role: "coach" },
  });
  const sessions = createSessionService(db);
  const session = await sessions.issue(db, user, "database_password", []);
  await sessions.issue(db, other, "database_password", []);
  const coachSession = await sessions.issue(db, coach, "database_password", []);
  const court = await db.court.create({
    data: {
      name: "QA Court 01",
      price: 20000,
      type: "Standard",
      surface: "Indoor",
      features: ["AC"],
    },
  });
  await db.court.create({
    data: {
      name: "QA Court 02",
      price: 18000,
      type: "Standard",
      surface: "Indoor",
      features: [],
    },
  });
  const date = new Date(`${today()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 2);
  const keyDate = date.toISOString().slice(0, 10);
  const port = 20000 + Math.floor(Math.random() * 1000),
    origin = `http://127.0.0.1:${port}`;
  const child = spawn(
    new URL("../node_modules/.bin/tsx", import.meta.url).pathname,
    ["src/server.ts"],
    {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        DATABASE_URL: `file:${file}`,
        PORT: String(port),
        NODE_ENV: "test",
        KPAY_WEBHOOK_SECRET: "private-course-test-secret",
        KPAY_CHECKOUT_ADAPTER_URL: "",
        KPAY_ADAPTER_API_KEY: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let logs = "";
  child.stdout.on("data", (b) => (logs += b));
  child.stderr.on("data", (b) => (logs += b));
  t.after(async () => {
    child.kill();
    await db.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(logs);
    if (
      await fetch(`${origin}/api/health`)
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    await new Promise((r) => setTimeout(r, 100));
    if (i === 99) throw new Error(logs);
  }
  const request = async (
    path: string,
    method = "GET",
    body?: unknown,
    token = session.accessToken,
    key?: string,
  ) => {
    const response = await fetch(`${origin}/api${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const value = await response.json();
    return { status: response.status, value };
  };
  const coachProfile = await db.coach.create({
    data: {
      name: "Coach QA",
      specialty: "Badminton",
      phone: "",
      email: "",
      department: "Badminton",
      status: "active",
      userId: coach.id,
    },
  });
  const anotherCoachUser = await db.user.create({
    data: { name: "Coach Two", email: "coach-two@example.test", role: "coach" },
  });
  const coachTwo = await db.coach.create({
    data: {
      name: "Coach Two",
      specialty: "Badminton",
      phone: "",
      email: "",
      department: "Badminton",
      status: "active",
      userId: anotherCoachUser.id,
    },
  });
  const course = await db.privateCourse.create({
    data: {
      title: "Private badminton",
      price: 50000,
      duration: 90,
      coaches: { connect: [{ id: coachProfile.id }, { id: coachTwo.id }] },
    },
  });
  const input = {
    courseId: course.id,
    coachId: coachProfile.id,
    courtId: court.id,
    date: keyDate,
    time: "8:00 AM — 9:30 AM",
  };
  const admin = await db.user.create({
    data: { name: "Admin", email: "admin@finance.test", role: "admin" },
  });
  const fo = await db.user.create({
    data: { name: "Desk", email: "desk@finance.test", role: "badminton_fo" },
  });
  const adminToken = (await sessions.issue(db, admin, "database_password", []))
    .accessToken;
  const foToken = (await sessions.issue(db, fo, "database_password", []))
    .accessToken;
  const otherCoachToken = (
    await sessions.issue(db, anotherCoachUser, "database_password", [])
  ).accessToken;
  const base = "/staff/private-courses";
  const payload = (extra = {}) => ({
    ...input,
    memberId: user.id,
    expectedPrice: 50000,
    paymentSource: "UNPAID",
    requestKey: randomUUID(),
    ...extra,
  });
  let foBooking: any, coachBooking: any;
  await t.test(
    "authentication, member search, own eligible catalog",
    async () => {
      assert.equal(
        (await request(`${base}/finance`, "GET", undefined, "")).status,
        401,
      );
      assert.equal((await request(`${base}/finance`)).status, 403);
      const catalog = await request(
        `${base}/catalog`,
        "GET",
        undefined,
        coachSession.accessToken,
      );
      const availability =
        "/private-courses/availability?" +
        new URLSearchParams({
          courseId: course.id,
          coachId: coachProfile.id,
          courtId: court.id,
          date: keyDate,
          durationMinutes: "90",
        });
      assert.equal(
        (
          await request(
            availability,
            "GET",
            undefined,
            coachSession.accessToken,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request(
            availability.replace(coachProfile.id, coachTwo.id),
            "GET",
            undefined,
            coachSession.accessToken,
          )
        ).status,
        403,
      );
      assert.equal(catalog.status, 200);
      assert.equal(catalog.value.courses[0].coaches.length, 1);
      assert.equal(
        (await request(`${base}/members?q=Booking`, "GET", undefined, foToken))
          .value[0].id,
        user.id,
      );
    },
  );
  await t.test(
    "FO paid booking posts once, preserves member and rejects impersonation",
    async () => {
      assert.equal(
        (
          await request(
            `${base}/bookings`,
            "POST",
            { ...payload(), collectedByUserId: coach.id },
            foToken,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            `${base}/bookings`,
            "POST",
            payload({ paymentSource: "COACH" }),
            foToken,
          )
        ).status,
        403,
      );
      const b = payload({ paymentSource: "BADMINTON_FO" });
      const first = await request(`${base}/bookings`, "POST", b, foToken);
      assert.equal(first.status, 201, JSON.stringify(first));
      foBooking = first.value;
      assert.equal(foBooking.userId, user.id);
      assert.equal(foBooking.status, "CONFIRMED");
      assert.equal(foBooking.privateCoursePayment.collectedByUserId, fo.id);
      assert.equal(
        (await request(`${base}/bookings`, "POST", b, foToken)).value.id,
        foBooking.id,
      );
      assert.equal(
        (
          await request(
            `${base}/bookings`,
            "POST",
            { ...b, notes: "changed" },
            foToken,
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await request(
            `${base}/bookings/${foBooking.id}/cash`,
            "POST",
            {},
            foToken,
          )
        ).status,
        200,
      );
      assert.equal(await db.transaction.count(), 1);
    },
  );
  await t.test(
    "admin records own cash and server controls course price",
    async () => {
      assert.equal(
        (
          await request(
            `${base}/bookings`,
            "POST",
            payload({ time: "10:00 AM — 11:30 AM", expectedPrice: 1 }),
            adminToken,
          )
        ).status,
        409,
      );
      const created = await request(
        `${base}/bookings`,
        "POST",
        payload({ time: "10:00 AM — 11:30 AM", paymentSource: "BADMINTON_FO" }),
        adminToken,
      );
      assert.equal(created.status, 201);
      assert.equal(
        created.value.privateCoursePayment.collectedByUserId,
        admin.id,
      );
    },
  );
  await t.test("coach ownership and own cash payment", async () => {
    assert.equal(
      (
        await request(
          `${base}/bookings`,
          "POST",
          payload({ coachId: coachTwo.id, time: "12:00 PM — 1:30 PM" }),
          coachSession.accessToken,
        )
      ).status,
      403,
    );
    const result = await request(
      `${base}/bookings`,
      "POST",
      payload({ time: "12:00 PM — 1:30 PM", paymentSource: "COACH" }),
      coachSession.accessToken,
    );
    assert.equal(result.status, 201, JSON.stringify(result));
    coachBooking = result.value;
    assert.equal(coachBooking.privateCoursePayment.collectedByUserId, coach.id);
    const report = await request(
      `${base}/finance`,
      "GET",
      undefined,
      otherCoachToken,
    );
    assert.equal(report.value.rows.length, 0);
    assert.equal(report.value.summary.coachCash, 0);
    assert.equal(
      (
        await request(
          `${base}/bookings/${coachBooking.id}/cash`,
          "POST",
          {},
          otherCoachToken,
        )
      ).status,
      403,
    );
  });
  await t.test(
    "partial handover reserves cash, requires receiver, never posts revenue",
    async () => {
      const count = await db.transaction.count();
      const p = {
        requestKey: randomUUID(),
        items: [
          { paymentId: coachBooking.privateCoursePayment.id, amount: 20000 },
        ],
      };
      const submitted = await request(
        `${base}/settlements`,
        "POST",
        p,
        coachSession.accessToken,
      );
      assert.equal(submitted.status, 201, JSON.stringify(submitted));
      assert.equal(
        (
          await request(
            `${base}/settlements`,
            "POST",
            p,
            coachSession.accessToken,
          )
        ).value.id,
        submitted.value.id,
      );
      assert.equal(
        (
          await request(
            `${base}/settlements`,
            "POST",
            {
              ...p,
              requestKey: randomUUID(),
              items: [{ ...p.items[0], amount: 40000 }],
            },
            coachSession.accessToken,
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await request(
            `${base}/settlements/${submitted.value.id}/receive`,
            "POST",
            {},
            coachSession.accessToken,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            `${base}/settlements/${submitted.value.id}/receive`,
            "POST",
            {},
            foToken,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request(
            `${base}/settlements/${submitted.value.id}/receive`,
            "POST",
            {},
            foToken,
          )
        ).status,
        200,
      );
      const finance = (
        await request(
          `${base}/finance`,
          "GET",
          undefined,
          coachSession.accessToken,
        )
      ).value;
      assert.equal(finance.summary.cashHeld, 30000);
      assert.equal(finance.summary.received, 20000);
      assert.equal(finance.summary.revenue, 150000);
      assert.equal(finance.summary.personallyCollected, 50000);
      assert.equal(await db.transaction.count(), count);
    },
  );
  await t.test(
    "online option stays unpaid; unverified receipt cannot confirm",
    async () => {
      const result = await request(
        `${base}/bookings`,
        "POST",
        payload({ time: "2:00 PM — 3:30 PM", paymentSource: "ONLINE" }),
        foToken,
      );
      assert.equal(result.status, 201);
      assert.equal(result.value.paymentStatus, "pending");
      assert.equal(result.value.status, "PENDING_COACH_CONFIRMATION");
      const attempt = await db.paymentAttempt.create({
        data: {
          reference: randomUUID(),
          resourceId: result.value.id,
          resourceType: "private_course",
          userId: user.id,
          amount: 50000,
          expiresAt: new Date(Date.now() + 60000),
        },
      });
      assert.equal(
        (
          await request(
            `${base}/bookings/${result.value.id}/reconcile-online`,
            "POST",
            { paymentAttemptId: attempt.id },
            foToken,
          )
        ).status,
        409,
      );
      // Legacy successful callback had already posted its transaction before this feature.
      await db.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: "SUCCEEDED", providerReference: "verified-reference" },
      });
      await db.booking.update({
        where: { id: result.value.id },
        data: { paymentStatus: "paid", status: "CONFIRMED" },
      });
      const count = await db.transaction.count();
      const linked = await request(
        `${base}/bookings/${result.value.id}/reconcile-online`,
        "POST",
        { paymentAttemptId: attempt.id },
        foToken,
      );
      assert.equal(linked.status, 200);
      assert.equal(linked.value.collectedByUserId, null);
      assert.equal(
        (
          await request(
            `${base}/bookings/${result.value.id}/reconcile-online`,
            "POST",
            { paymentAttemptId: attempt.id },
            foToken,
          )
        ).value.id,
        linked.value.id,
      );
      assert.equal(
        (
          await request(
            `${base}/bookings/${foBooking.id}/reconcile-online`,
            "POST",
            { paymentAttemptId: attempt.id },
            foToken,
          )
        ).status,
        409,
      );
      assert.equal(await db.transaction.count(), count);
    },
  );
  await t.test(
    "concurrent staff requests cannot reserve the same court",
    async () => {
      const p = payload({ time: "4:00 PM — 5:30 PM" });
      const results = await Promise.all([
        request(`${base}/bookings`, "POST", p, foToken),
        request(
          `${base}/bookings`,
          "POST",
          { ...p, requestKey: randomUUID() },
          coachSession.accessToken,
        ),
      ]);
      assert.equal(
        results.filter((r) => r.status === 201).length,
        1,
        JSON.stringify(results),
      );
      assert.equal(
        results.filter((r) => r.status === 409).length,
        1,
        JSON.stringify(results),
      );
      const winner = results.find((r) => r.status === 201)!.value;
      const cancelled = await request(
        `${base}/bookings/${winner.id}/cancel`,
        "POST",
        { reason: "Member requested cancellation" },
        adminToken,
      );
      assert.equal(cancelled.status, 200);
      assert.equal(cancelled.value.status, "CANCELLED");
      assert.equal(
        await db.bookingChangeHistory.count({
          where: { bookingId: winner.id, action: "STAFF_CANCEL" },
        }),
        1,
      );
    },
  );
  await t.test(
    "refund is audited, authorized, idempotent and cancels booking",
    async () => {
      const input = {
        reason: "Member requested cancellation",
        evidence: "Cash returned and receipt signed by member",
        reference: "REFUND-001",
      };
      assert.equal(
        (
          await request(
            `${base}/bookings/${foBooking.id}/refund`,
            "POST",
            input,
            foToken,
          )
        ).status,
        403,
      );
      const count = await db.transaction.count();
      assert.equal(
        (
          await request(
            `${base}/bookings/${foBooking.id}/refund`,
            "POST",
            input,
            adminToken,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request(
            `${base}/bookings/${foBooking.id}/refund`,
            "POST",
            input,
            adminToken,
          )
        ).status,
        200,
      );
      const b = await db.booking.findUniqueOrThrow({
        where: { id: foBooking.id },
      });
      assert.equal(b.status, "CANCELLED");
      assert.equal(b.paymentStatus, "refunded");
      assert.equal(await db.transaction.count(), count);
      assert.equal(await db.privateCourseAdjustment.count(), 1);
      assert.equal(
        (
          await request(
            `${base}/bookings/${coachBooking.id}/refund`,
            "POST",
            input,
            adminToken,
          )
        ).status,
        409,
      );
    },
  );
  await t.test(
    "legacy records remain unknown until admin evidence review",
    async () => {
      const b = await db.booking.create({
        data: {
          code: randomUUID(),
          kind: "private_course",
          userId: user.id,
          coachId: coachProfile.id,
          title: "Historical",
          date: "2020-01-01",
          time: input.time,
          location: "QA",
          price: 100,
          paymentStatus: "paid",
          status: "COMPLETED",
        },
      });
      let report = (await request(`${base}/finance`, "GET", undefined, foToken))
        .value;
      assert.equal(
        report.rows.find((r: any) => r.id === b.id).source,
        "LEGACY_UNKNOWN",
      );
      const evidence = {
        reason: "Archived receipt verified",
        evidence: "Bank statement archive 2020 confirmed",
        reference: "ARCHIVE-2020-1",
        method: "Bank Transfer",
      };
      assert.equal(
        (
          await request(
            `${base}/bookings/${b.id}/verify-legacy`,
            "POST",
            evidence,
            foToken,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            `${base}/bookings/${b.id}/verify-legacy`,
            "POST",
            evidence,
            adminToken,
          )
        ).status,
        200,
      );
      report = (await request(`${base}/finance`, "GET", undefined, foToken))
        .value;
      assert.equal(
        report.rows.find((r: any) => r.id === b.id).source,
        "ONLINE",
      );
      assert.equal(
        await db.bookingChangeHistory.count({ where: { bookingId: b.id } }),
        1,
      );
      const refund = {
        reason: evidence.reason,
        evidence: evidence.evidence,
        reference: "LEGACY-REFUND",
      };
      assert.equal(
        (
          await request(
            `${base}/bookings/${b.id}/refund`,
            "POST",
            refund,
            adminToken,
          )
        ).status,
        409,
      );
      const original = await db.transaction.create({
        data: {
          userId: user.id,
          date: "2020-01-01",
          customer: user.name,
          business: "Badminton",
          item: "Private course · Historical",
          amount: 100,
          discount: 0,
          tax: 0,
          finalAmount: 100,
          paymentMethod: "Bank Transfer",
          staff: "Historical",
          status: "paid",
        },
      });
      const linkage = {
        transactionId: original.id,
        reason: evidence.reason,
        evidence: evidence.evidence,
      };
      assert.equal(
        (
          await request(
            `${base}/bookings/${b.id}/link-transaction`,
            "POST",
            linkage,
            foToken,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            `${base}/bookings/${b.id}/link-transaction`,
            "POST",
            linkage,
            adminToken,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request(
            `${base}/bookings/${b.id}/refund`,
            "POST",
            refund,
            adminToken,
          )
        ).status,
        200,
      );
      assert.equal(
        (await db.transaction.findUniqueOrThrow({ where: { id: original.id } }))
          .status,
        "refunded",
      );
    },
  );
});
