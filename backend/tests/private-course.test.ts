import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID, createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createSessionService } from "../src/services/authSession.js";
import { createCourtBooking } from "../src/services/courtBooking.js";
import { courtAvailability } from "../src/services/courtAvailability.js";
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
test("badminton private courses: independent availability, concurrency, acceptance and payment", async (t) => {
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
  const otherSession = await sessions.issue(db, other, "database_password", []);
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
  const second = await db.court.create({
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
  const port = 18000 + Math.floor(Math.random() * 1000),
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
  const slot = (hour: number, courtId = court.id) => ({
    date: keyDate,
    courtId,
    time: `${hour}:00 AM — ${hour + 1}:00 ${hour + 1 === 12 ? "PM" : "AM"}`,
  });

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
  const availabilityPath = (changes: Record<string, string | number> = {}) =>
    "/private-courses/availability?" +
    new URLSearchParams(
      Object.entries({ ...input, durationMinutes: 90, ...changes }).map(
        ([k, v]) => [k, String(v)],
      ),
    );
  await t.test("auth, duration, and response privacy", async () => {
    assert.equal(
      (await request(availabilityPath(), "GET", undefined, "")).status,
      401,
    );
    assert.equal(
      (await request(availabilityPath({ date: "2026-02-30" }))).status,
      400,
    );
    assert.equal(
      (await request(availabilityPath({ durationMinutes: 60 }))).status,
      409,
    );
    const result = await request(availabilityPath());
    assert.equal(result.status, 200);
    assert.equal(result.value.price, 50000);
    const selected = result.value.slots.find((s: any) => s.startMinute === 480);
    assert.equal(selected.time, input.time);
    assert.equal(selected.available, true);
    assert.equal(selected.userId, undefined);
    assert.equal(result.value.bookings, undefined);
  });
  await t.test(
    "coach conflict and court conflict are independent",
    async () => {
      const row = await db.booking.create({
        data: {
          userId: user.id,
          kind: "private_course",
          title: "Other lesson",
          code: randomUUID(),
          courtId: second.id,
          coachId: coachProfile.id,
          date: keyDate,
          time: input.time,
          price: 1,
          location: "QA",
          status: "CONFIRMED",
        },
      });
      let result = await request(availabilityPath());
      let selected = result.value.slots.find((s: any) => s.startMinute === 480);
      assert.equal(selected.coachAvailable, false);
      assert.equal(selected.courtAvailable, true);
      assert.equal(selected.available, false);
      assert.equal(
        (await request("/member/private-courses", "POST", input)).status,
        409,
      );
      await db.booking.update({
        where: { id: row.id },
        data: { courtId: court.id, coachId: coachTwo.id },
      });
      result = await request(availabilityPath());
      selected = result.value.slots.find((s: any) => s.startMinute === 480);
      assert.equal(selected.coachAvailable, true);
      assert.equal(selected.courtAvailable, false);
      assert.equal(selected.available, false);
      await db.booking.delete({ where: { id: row.id } });
    },
  );
  await t.test("24-hour court blocks and malformed time", async () => {
    const block = await db.courtBlock.create({
      data: {
        courtId: court.id,
        date: keyDate,
        start: "08:30",
        end: "09:00",
        title: "Training block",
        type: "reserved",
        active: true,
      },
    });
    const result = await request(availabilityPath());
    assert.equal(
      result.value.slots.find((s: any) => s.startMinute === 480).courtAvailable,
      false,
    );
    assert.equal(
      (await request("/member/private-courses", "POST", input)).status,
      409,
    );
    await db.courtBlock.delete({ where: { id: block.id } });
    assert.equal(
      (
        await request("/member/private-courses", "POST", {
          ...input,
          time: "8:99 AM — 10:29 AM",
        })
      ).status,
      400,
    );
  });
  await t.test(
    "a changed server price requires another explicit review",
    async () => {
      const result = await request("/member/private-courses", "POST", {
        ...input,
        expectedPrice: 49999,
      });
      assert.equal(result.status, 409);
      assert.equal(
        await db.booking.count({ where: { kind: "private_course" } }),
        0,
      );
    },
  );
  let bookingId = "";
  await t.test(
    "concurrent requests reserve at most once and notify both accounts",
    async () => {
      const results = await Promise.all([
        request("/member/private-courses", "POST", input),
        request("/member/private-courses", "POST", input),
      ]);
      assert.equal(
        results.filter((r) => r.status === 201).length,
        1,
        JSON.stringify(results),
      );
      bookingId = results.find((r) => r.status === 201)!.value.booking.id;
      assert.equal(
        await db.booking.count({
          where: {
            kind: "private_course",
            status: "PENDING_COACH_CONFIRMATION",
          },
        }),
        1,
      );
      assert.equal(
        await db.notification.count({ where: { entityId: bookingId } }),
        2,
      );
      assert.equal(
        (await request(`/member/private-courses/${bookingId}/pay`, "POST", {}))
          .status,
        409,
      );
    },
  );
  await t.test(
    "acceptance gives 24 hours; payment initiation cannot confirm; ownership is enforced",
    async () => {
      assert.equal(
        (
          await request(
            `/coach/private-courses/${bookingId}/decision`,
            "POST",
            { decision: "accept" },
            coachSession.accessToken,
          )
        ).status,
        200,
      );
      const booking = await db.booking.findUniqueOrThrow({
        where: { id: bookingId },
      });
      assert.equal(booking.status, "AWAITING_PAYMENT");
      assert.equal(
        booking.paymentExpiresAt!.getTime() -
          booking.coachAcceptedAt!.getTime(),
        24 * 60 * 60 * 1000,
      );
      assert.equal(
        (await request(`/member/private-courses/${bookingId}/pay`, "POST", {}))
          .status,
        503,
      );
      assert.equal(
        (await db.booking.findUniqueOrThrow({ where: { id: bookingId } }))
          .status,
        "AWAITING_PAYMENT",
      );
      assert.equal(
        (
          await request(
            `/member/private-courses/${bookingId}/cancel`,
            "POST",
            {},
            otherSession.accessToken,
          )
        ).status,
        404,
      );
    },
  );
  await t.test(
    "expiry releases both resources and prevents late payment",
    async () => {
      await db.booking.update({
        where: { id: bookingId },
        data: {
          paymentExpiresAt: new Date(Date.now() - 1000),
          reservationExpiresAt: new Date(Date.now() - 1000),
        },
      });
      const result = await request(availabilityPath());
      assert.equal(
        result.value.slots.find((s: any) => s.startMinute === 480).available,
        true,
      );
      assert.equal(
        (await db.booking.findUniqueOrThrow({ where: { id: bookingId } }))
          .status,
        "EXPIRED",
      );
      assert.equal(
        (await request(`/member/private-courses/${bookingId}/pay`, "POST", {}))
          .status,
        409,
      );
      assert.ok(
        (await db.notification.count({
          where: { entityId: bookingId, type: "booking" },
        })) > 2,
      );
    },
  );
  await t.test("rejection and cancellation release resources", async () => {
    const requested = await request("/member/private-courses", "POST", input);
    const id = requested.value.booking.id;
    assert.equal(
      (
        await request(
          `/coach/private-courses/${id}/decision`,
          "POST",
          { decision: "decline" },
          coachSession.accessToken,
        )
      ).status,
      200,
    );
    assert.equal(
      (await request(availabilityPath())).value.slots.find(
        (s: any) => s.startMinute === 480,
      ).available,
      true,
    );
    const next = await request("/member/private-courses", "POST", input);
    assert.equal(
      (
        await request(
          `/member/private-courses/${next.value.booking.id}/cancel`,
          "POST",
          {},
        )
      ).status,
      200,
    );
    assert.equal(
      (await request(availabilityPath())).value.slots.find(
        (s: any) => s.startMinute === 480,
      ).available,
      true,
    );
  });
  await t.test(
    "only signed verified payment confirms once; forged callbacks cannot change bookings",
    async () => {
      const requested = await request("/member/private-courses", "POST", input);
      const id = requested.value.booking.id;
      await request(
        `/coach/private-courses/${id}/decision`,
        "POST",
        { decision: "accept" },
        coachSession.accessToken,
      );
      const attempt = await db.paymentAttempt.create({
        data: {
          reference: randomUUID(),
          providerReference: randomUUID(),
          resourceType: "private_course",
          resourceId: id,
          userId: user.id,
          amount: 50000,
          status: "PENDING",
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      const payload = {
        reference: attempt.reference,
        providerReference: attempt.providerReference,
        amount: 50000,
        status: "PAID",
      };
      const callback = async (data: unknown, signed = true) => {
        const body = JSON.stringify(data);
        return fetch(`${origin}/api/payments/kpay/webhook`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-kpay-signature": signed
              ? createHmac("sha256", "private-course-test-secret")
                  .update(body)
                  .digest("hex")
              : "bad-signature",
          },
          body,
        });
      };
      assert.equal((await callback(payload, false)).status, 401);
      assert.equal((await callback({ ...payload, amount: 1 })).status, 409);
      assert.equal(
        (await db.booking.findUniqueOrThrow({ where: { id } })).status,
        "AWAITING_PAYMENT",
      );
      assert.equal((await callback(payload)).status, 200);
      const confirmed = await db.booking.findUniqueOrThrow({ where: { id } });
      assert.equal(confirmed.status, "CONFIRMED");
      assert.equal(confirmed.paymentStatus, "paid");
      assert.equal(confirmed.reservationExpiresAt, null);
      assert.equal((await callback(payload)).status, 200);
      assert.equal(
        await db.transaction.count({
          where: { userId: user.id, paymentMethod: "KPay" },
        }),
        1,
      );
      assert.equal(
        await db.notification.count({
          where: { entityId: id, title: "Private course confirmed" },
        }),
        2,
      );
    },
  );

  await t.test(
    "package activation and concurrent member check-in debit exactly once",
    async () => {
      const pkg = await db.badmintonPackage.create({
        data: {
          title: "Badminton ten",
          categoryId: (await db.badmintonPackageCategory.upsert({ where: { code: "SOCIAL" }, update: {}, create: { name: "Social", code: "SOCIAL" } })).id,
          sessions: 10,
          validity: 30,
          price: 100000,
          description: "QA sessions",
        },
      });
      const activated = await request(
        `/member/badminton-packages/${pkg.id}/purchase`,
        "POST",
        {},
      );
      assert.equal(activated.status, 201);
      const enrollment = activated.value.enrollment;
      const qrStaff = await db.user.create({ data: { name: 'QR desk', email: 'qr-desk@test.local', role: 'badminton_fo' } });
      const qrSession = await sessions.issue(db, qrStaff, 'database_password', []);
      const issued = await request('/check-in/qr', 'POST', { categoryCode: 'SOCIAL' }, qrSession.accessToken);
      assert.equal(issued.status, 201);
      const secondActivation = await request(`/member/badminton-packages/${pkg.id}/purchase`, 'POST', {});
      assert.equal(secondActivation.status, 201);
      assert.notEqual(secondActivation.value.enrollment.id, enrollment.id);
      assert.equal((await db.badmintonEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).sessionsRemaining, 10);
      const renewed = await request(`/badminton/enrollments/${enrollment.id}/renew`, 'POST', { packageId: pkg.id, paymentMethod: 'Cash' }, qrSession.accessToken);
      assert.equal(renewed.status, 200);
      assert.equal((await db.badmintonEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).status, 'active');
      assert.equal(await db.badmintonEnrollment.count({ where: { userId: user.id, status: 'active', categoryCode: 'SOCIAL' } }), 3);
      const qrToken = issued.value.token;
      assert.equal(
        (
          await request(
            "/check-in/scan",
            "POST",
            { token: qrToken },
            otherSession.accessToken,
          )
        ).status,
        409,
      );
      const results = await Promise.all([
        request("/check-in/scan", "POST", { token: qrToken }),
        request("/check-in/scan", "POST", { token: qrToken }),
      ]);
      assert.equal(results.filter((r) => r.status === 201).length, 1);
      assert.equal(
        (
          await db.badmintonEnrollment.findUniqueOrThrow({
            where: { id: enrollment.id },
          })
        ).sessionsRemaining,
        9,
      );
      assert.equal(
        await db.badmintonCheckIn.count({
          where: { enrollmentId: enrollment.id },
        }),
        1,
      );
      assert.equal(
        (
          await request("/check-in/scan", "POST", {
            token: qrToken,
          })
        ).status,
        409,
      );
    },
  );
  await t.test('verified package payment snapshots category and preserves existing active balances', async () => {
    const category = await db.badmintonPackageCategory.create({ data: { name: 'Pathway', code: 'PATHWAY' } });
    const pkg = await db.badmintonPackage.create({ data: { title: 'Paid pathway', categoryId: category.id, price: 100000, sessions: 12, validity: 30, description: '' } });
    const before = await db.badmintonEnrollment.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } });
    const purchase = await db.badmintonPackagePurchase.create({ data: { code: randomUUID(), userId: user.id, packageId: pkg.id, packageName: pkg.title, price: pkg.price, status: 'PENDING' } });
    const attempt = await db.paymentAttempt.create({ data: { reference: randomUUID(), providerReference: randomUUID(), resourceType: 'badminton_package', resourceId: purchase.id, userId: user.id, amount: pkg.price, status: 'PENDING', expiresAt: new Date(Date.now() + 3600000) } });
    const body = JSON.stringify({ reference: attempt.reference, providerReference: attempt.providerReference, amount: pkg.price, status: 'PAID' });
    const notify = () => fetch(`${origin}/api/payments/kpay/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-kpay-signature': createHmac('sha256', 'private-course-test-secret').update(body).digest('hex') }, body });
    assert.equal((await notify()).status, 200); assert.equal((await notify()).status, 200);
    const enrollment = await db.badmintonEnrollment.findUniqueOrThrow({ where: { purchaseId: purchase.id } });
    assert.equal(enrollment.categoryCode, 'PATHWAY'); assert.equal(enrollment.sessionsRemaining, 12);
    assert.equal(await db.badmintonEnrollment.count({ where: { purchaseId: purchase.id } }), 1);
    assert.deepEqual(await db.badmintonEnrollment.findMany({ where: { id: { in: before.map(e => e.id) } }, orderBy: { id: 'asc' } }), before);
  });
  await t.test('admin catalogue review classifies only unresolved history with an actor audit and no balance changes', async () => {
    const admin = await db.user.create({ data: { name: 'Category reviewer', email: 'category-reviewer@test.local', role: 'admin' } });
    const adminToken = (await sessions.issue(db, admin, 'database_password', [])).accessToken;
    const category = await db.badmintonPackageCategory.findUniqueOrThrow({ where: { code: 'SOCIAL' } });
    const pkg = await db.badmintonPackage.create({ data: { title: 'Legacy review', price: 100000, sessions: 10, validity: 30, description: '' } });
    const enrollment = await db.badmintonEnrollment.create({ data: { studentId: user.id, userId: user.id, studentName: user.name, phone: '', packageId: pkg.id, packageName: pkg.title, sessionsTotal: 10, sessionsRemaining: 4, startDate: '2020-01-01', expiryDate: '2099-01-01' } });
    const visit = await db.badmintonCheckIn.create({ data: { enrollmentId: enrollment.id, date: '2020-01-02', time: '09:00' } });
    assert.equal((await request(`/packages/badminton/${pkg.id}/classify-legacy`, 'POST', { reviewed: true })).status, 403);
    assert.equal((await request(`/packages/badminton/categories/${category.id}`, 'PATCH', { code: 'FOUNDATION' }, adminToken)).status, 400);
    assert.equal((await request(`/packages/badminton/${pkg.id}`, 'PATCH', { categoryId: category.id }, adminToken)).status, 200);
    assert.equal((await db.badmintonEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).categoryCode, null);
    const result = await request(`/packages/badminton/${pkg.id}/classify-legacy`, 'POST', { reviewed: true }, adminToken);
    assert.equal(result.status, 200); assert.equal(result.value.enrollments, 1); assert.equal(result.value.checkIns, 1);
    const after = await db.badmintonEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    assert.equal(after.categoryCode, 'SOCIAL'); assert.equal(after.sessionsRemaining, 4);
    assert.equal((await db.badmintonCheckIn.findUniqueOrThrow({ where: { id: visit.id } })).categoryCode, 'SOCIAL');
    assert.equal(await db.attendanceModification.count({ where: { bookingId: `enrollment:${enrollment.id}`, actorId: admin.id } }), 1);
    assert.equal((await request(`/packages/badminton/${pkg.id}/classify-legacy`, 'POST', { reviewed: true }, adminToken)).value.enrollments, 0);
  });
  await t.test(
    "one coach cannot be reserved concurrently on different courts",
    async () => {
      const attempt = { ...input, time: "11:00 AM — 12:30 PM" };
      const results = await Promise.all([
        request("/member/private-courses", "POST", attempt),
        request("/member/private-courses", "POST", {
          ...attempt,
          courtId: second.id,
        }),
      ]);
      assert.equal(results.filter((r) => r.status === 201).length, 1);
      assert.equal(results.filter((r) => r.status === 409).length, 1);
    },
  );
});
