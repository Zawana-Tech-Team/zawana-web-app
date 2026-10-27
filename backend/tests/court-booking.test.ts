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
test("real HTTP court journey, integrity, ownership and retry recovery", async (t) => {
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
  await t.test(
    "court blocks retrieve date/court/weekly filters and preserve the courtName alias",
    async () => {
      const day = new Date(`${keyDate}T12:00:00Z`).getUTCDay();
      const weekly = await db.courtBlock.create({
        data: {
          courtId: court.id,
          date: "",
          dayOfWeek: day,
          start: "18:00",
          end: "19:00",
          title: "Weekly QA",
        },
      });
      const dated = await db.courtBlock.create({
        data: {
          courtId: second.id,
          date: keyDate,
          start: "10:00",
          end: "11:00",
          title: "Date QA",
        },
      });
      const inactive = await db.courtBlock.create({
        data: {
          courtId: court.id,
          date: "",
          dayOfWeek: day,
          start: "20:00",
          end: "21:00",
          title: "Inactive QA",
          active: false,
        },
      });
      try {
        let result = await request(
          `/court-blocks?date=${keyDate}&courtId=${court.id}`,
        );
        assert.equal(result.status, 200);
        assert.deepEqual(
          result.value.map((b: any) => b.id),
          [weekly.id],
        );
        assert.equal(result.value[0].courtName, court.name);
        result = await request(`/court-blocks?date=${keyDate}`);
        assert.equal(result.value.length, 2);
        assert.equal((await request("/court-blocks?date=invalid")).status, 400);
        await db.courtDateOverride.create({
          data: { date: keyDate, type: "open", title: "Open QA" },
        });
        assert.equal(
          (await request(`/court-blocks?date=${keyDate}&courtId=${court.id}`))
            .value.length,
          0,
        );
        assert.equal(
          (await request(`/court-blocks?date=${keyDate}&courtId=${second.id}`))
            .value[0].id,
          dated.id,
        );
      } finally {
        await db.courtDateOverride.deleteMany({ where: { date: keyDate } });
        await db.courtBlock.deleteMany({
          where: { id: { in: [weekly.id, dated.id, inactive.id] } },
        });
      }
    },
  );
  await t.test(
    "staff can create and update court blocks through the real routes",
    async () => {
      const staff = await db.user.create({
        data: {
          name: "Block QA",
          email: "blocks@example.test",
          role: "badminton_fo",
        },
      });
      const token = (await sessions.issue(db, staff, "database_password", []))
        .accessToken;
      const response = await request(
        "/court-blocks",
        "POST",
        {
          courtId: court.id,
          dayOfWeek: 1,
          start: "18:00",
          end: "19:00",
          title: "Class QA",
        },
        token,
      );
      assert.equal(response.status, 201, JSON.stringify(response.value));
      assert.equal(response.value.end, "19:00");
      assert.equal(response.value.courtName, court.name);
      const updated = await request(
        `/court-blocks/${response.value.id}`,
        "PATCH",
        { end: "20:00", start: "19:00" },
        token,
      );
      assert.equal(updated.status, 200);
      assert.equal(updated.value.end, "20:00");
      assert.equal(
        (
          await request("/court-blocks", "POST", {
            courtId: court.id,
            dayOfWeek: 1,
            start: "19:00",
            end: "20:00",
            title: "Forbidden",
          })
        ).status,
        403,
      );
      await db.courtBlock.delete({ where: { id: response.value.id } });
    },
  );
  await t.test(
    "authenticated server-generated availability and date validation",
    async () => {
      assert.equal(
        (
          await request(
            `/court-booking/availability?date=${keyDate}`,
            "GET",
            undefined,
            "",
          )
        ).status,
        401,
      );
      assert.equal(
        (await request("/court-booking/availability?date=2026-02-30")).status,
        400,
      );
      const response = await request(
        `/court-booking/availability?date=${keyDate}`,
      );
      assert.equal(response.status, 200);
      assert.equal(response.value.slots.length, 30);
      assert.equal(response.value.currency, "MMK");
      assert.equal(response.value.slots[0].price, 20000);
      assert.equal(response.value.slots[9].price, 25000);
    },
  );
  await t.test(
    "availability distinguishes booked, reserved and released backend statuses",
    async () => {
      for (const [status, expected] of [
        ["confirmed", "booked"],
        ["CONFIRMED", "booked"],
        ["pending", "reserved"],
        ["PENDING_COACH_CONFIRMATION", "reserved"],
        ["AWAITING_PAYMENT", "reserved"],
        ["cancelled", "available"],
        ["completed", "available"],
        ["EXPIRED", "available"],
      ] as const) {
        const booking = await db.booking.create({
          data: {
            userId: user.id,
            kind: "court",
            title: "QA status",
            code: randomUUID(),
            ...slot(6),
            price: 20000,
            location: "QA",
            status,
            paymentStatus: "pending",
          },
        });
        try {
          const response = await request(
            `/court-booking/availability?date=${keyDate}`,
          );
          const actual = response.value.slots.find(
            (s: { courtId: string; startMinute: number }) =>
              s.courtId === court.id && s.startMinute === 360,
          );
          assert.equal(actual.status, expected, status);
          assert.equal(actual.available, expected === "available", status);
          assert.equal(
            actual.reason,
            expected === "available"
              ? null
              : expected === "booked"
                ? "Booked"
                : "Reserved",
          );
          assert.equal(actual.userId, undefined);
          assert.equal(actual.paymentStatus, undefined);
          if (expected !== "available") {
            const count = await db.booking.count();
            const conflict = await request("/bookings", "POST", {
              kind: "court",
              bookings: [slot(6)],
            });
            assert.equal(conflict.status, 409, status);
            assert.equal(
              await db.booking.count(),
              count,
              "Unavailable slot must not create another reservation",
            );
          }
        } finally {
          await db.booking.delete({ where: { id: booking.id } });
        }
      }
    },
  );
  await t.test("maintenance and elapsed slots cannot be booked", async () => {
    await db.court.update({
      where: { id: court.id },
      data: { status: "maintenance" },
    });
    try {
      const response = await request(
        `/court-booking/availability?date=${keyDate}`,
      );
      assert.ok(
        response.value.slots
          .filter((s: { courtId: string }) => s.courtId === court.id)
          .every(
            (s: { status: string; available: boolean }) =>
              s.status === "maintenance" && !s.available,
          ),
      );
      assert.equal(
        (
          await request("/bookings", "POST", {
            kind: "court",
            bookings: [slot(6)],
          })
        ).status,
        409,
      );
    } finally {
      await db.court.update({
        where: { id: court.id },
        data: { status: "available" },
      });
    }
    const previous = new Date(`${today()}T12:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    const yesterday = previous.toISOString().slice(0, 10);
    const expired = await request(
      `/court-booking/availability?date=${yesterday}`,
    );
    assert.ok(
      expired.value.slots.every(
        (s: { status: string; available: boolean }) =>
          s.status === "expired" && !s.available,
      ),
    );
    assert.equal(
      (
        await request("/bookings", "POST", {
          kind: "court",
          bookings: [{ ...slot(6), date: yesterday }],
        })
      ).status,
      400,
    );
  });
  let ids: string[] = [];
  const retryKey = randomUUID();
  const input = {
    kind: "court",
    bookings: [slot(8), slot(9, second.id)],
    meta: "QA request",
    paymentStatus: "paid",
    price: 1,
  };
  await t.test(
    "atomic persisted unpaid reservation and safe replay",
    async () => {
      const response = await request(
        "/bookings",
        "POST",
        input,
        session.accessToken,
        retryKey,
      );
      assert.equal(response.status, 201, JSON.stringify(response.value));
      ids = response.value.bookings.map((b: { id: string }) => b.id);
      assert.equal(ids.length, 2);
      assert.equal(response.value.totalPrice, 38000);
      for (const id of ids) {
        const b = await db.booking.findUniqueOrThrow({ where: { id } });
        assert.equal(b.userId, user.id);
        assert.equal(b.status, "CONFIRMED");
        assert.equal(b.paymentStatus, "pending");
        assert.equal(b.meta, "QA request");
      }
      assert.equal(await db.transaction.count(), 0);
      assert.equal(await db.notification.count(), 6);
      const recovered = await request(`/court-booking/submissions/${retryKey}`);
      assert.equal(recovered.status, 200);
      assert.deepEqual(
        recovered.value.bookings.map((b: { id: string }) => b.id),
        ids,
      );
      const replay = await request(
        "/bookings",
        "POST",
        input,
        session.accessToken,
        retryKey,
      );
      assert.equal(replay.status, 201);
      assert.deepEqual(
        replay.value.bookings.map((b: { id: string }) => b.id),
        ids,
      );
      assert.equal(
        (
          await request(
            "/bookings",
            "POST",
            { kind: "court", bookings: [slot(10)] },
            session.accessToken,
            retryKey,
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await request(
            `/court-booking/submissions/${retryKey}`,
            "GET",
            undefined,
            otherSession.accessToken,
          )
        ).status,
        404,
      );
    },
  );
  await t.test(
    "weekly block creation respects uppercase confirmed bookings",
    async () => {
      const staff = await db.user.findUniqueOrThrow({
        where: { email: "blocks@example.test" },
      });
      const token = (await sessions.issue(db, staff, "database_password", []))
        .accessToken;
      const response = await request(
        "/court-blocks",
        "POST",
        {
          courtId: court.id,
          dayOfWeek: new Date(`${keyDate}T12:00:00Z`).getUTCDay(),
          start: "08:00",
          end: "09:00",
          title: "Must not hide a confirmed booking",
        },
        token,
      );
      assert.equal(response.status, 409);
      assert.equal(
        await db.courtBlock.count({ where: { courtId: court.id } }),
        0,
      );
    },
  );
  await t.test("calendar, ownership and authorisation", async () => {
    const list = await request("/bookings?kind=court");
    assert.equal(list.value.length, 2);
    const staff = await db.user.findUniqueOrThrow({ where: { email: "blocks@example.test" } });
    const staffToken = (await sessions.issue(db, staff, "database_password", [])).accessToken;
    const bypass = await request(`/bookings/${ids[0]}`, "PATCH", { date: keyDate, time: "12:00 PM — 1:00 PM" }, staffToken);
    assert.equal(bypass.status, 409);
    assert.equal(bypass.value.code, "DEDICATED_WORKFLOW_REQUIRED");
    const unrelated = await db.booking.create({ data: { userId: other.id, kind: "recovery", title: "Private clinic record", date: keyDate, time: "10:00 AM — 11:00 AM", code: randomUUID(), location: "Clinic", price: 10000 } });
    try {
      const scoped = await request("/bookings?kind=recovery", "GET", undefined, staffToken);
      assert.equal(scoped.status, 200); assert.deepEqual(scoped.value, []);
    } finally { await db.booking.delete({ where: { id: unrelated.id } }); }
    assert.equal(
      (await request(`/court-booking/bookings/${ids[0]}`)).status,
      200,
    );
    assert.equal(
      (
        await request(
          `/court-booking/bookings/${ids[0]}`,
          "GET",
          undefined,
          otherSession.accessToken,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          `/bookings/${ids[0]}/status`,
          "PATCH",
          { status: "cancelled" },
          otherSession.accessToken,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          "/bookings",
          "POST",
          { kind: "court", bookings: [slot(10)] },
          coachSession.accessToken,
        )
      ).status,
      403,
    );
    const available = await request(
      `/court-booking/availability?date=${keyDate}`,
    );
    assert.equal(
      available.value.slots.find(
        (s: { courtId: string; startMinute: number }) =>
          s.courtId === court.id && s.startMinute === 480,
      ).available,
      false,
    );
    assert.equal(
      (await request(`/court-booking/month?month=${keyDate.slice(0, 7)}`))
        .status,
      200,
    );
  });
  await t.test(
    "24-hour weekly blocks match web availability and reject every court payload shape",
    async () => {
      await db.courtBlock.create({
        data: {
          courtId: second.id,
          date: "",
          dayOfWeek: new Date(`${keyDate}T12:00:00Z`).getUTCDay(),
          start: "18:00",
          end: "20:00",
          title: "QA weekly class",
        },
      });
      const availability = await request(
        `/court-booking/availability?date=${keyDate}`,
      );
      const sessions = availability.value.slots.filter(
        (s: { courtId: string }) => s.courtId === second.id,
      );
      for (const minute of [1080, 1140]) {
        const blocked = sessions.find(
          (s: { startMinute: number }) => s.startMinute === minute,
        );
        assert.equal(blocked.status, "blocked");
        assert.equal(blocked.available, false);
        assert.equal(blocked.reason, "Class");
      }
      assert.equal(
        sessions.find((s: { startMinute: number }) => s.startMinute === 1200)
          .available,
        true,
      );
      const web = await request(
        `/bookings/month-availability?month=${keyDate.slice(0, 7)}`,
      );
      assert.equal(web.status, 200);
      assert.ok(
        web.value.blocks.some(
          (b: { courtId: string; start: string; end: string }) =>
            b.courtId === second.id && b.start === "18:00" && b.end === "20:00",
        ),
      );
      const time = "6:00 PM — 7:00 PM",
        before = await db.booking.count();
      for (const input of [
        { date: keyDate, courtId: second.id, time },
        { date: keyDate, slots: [{ courtId: second.id, time }] },
        { bookings: [{ date: keyDate, courtId: second.id, time }] },
      ])
        assert.equal(
          (await request("/bookings", "POST", { kind: "court", ...input }))
            .status,
          409,
        );
      assert.equal(await db.booking.count(), before);
    },
  );
  await t.test(
    "invalid slots, facility blocks, closure and holiday pricing",
    async () => {
      for (const time of [
        "9:60 AM — 10:60 AM",
        "0:00 AM — 1:00 AM",
        "9:30 AM — 10:30 AM",
        "8:00 AM — 10:00 AM",
      ])
        assert.equal(
          (
            await request("/bookings", "POST", {
              kind: "court",
              bookings: [{ date: keyDate, courtId: court.id, time }],
            })
          ).status,
          409,
        );
      assert.equal(
        (
          await request("/bookings", "POST", {
            kind: "court",
            bookings: [{ ...slot(10), date: "2026-02-30" }],
          })
        ).status,
        400,
      );
      await db.courtBlock.create({
        data: {
          courtId: court.id,
          date: keyDate,
          start: "10:00",
          end: "11:00",
          title: "QA facility block",
          type: "reservation",
        },
      });
      assert.equal(
        (
          await request("/bookings", "POST", {
            kind: "court",
            bookings: [slot(10)],
          })
        ).status,
        409,
      );
      await db.courtDateOverride.create({
        data: { date: keyDate, type: "closed" },
      });
      const closed = (await courtAvailability(db, keyDate)).slots;
      assert.ok(closed.every((s) => s.status === "closed" && !s.available));
      assert.equal(
        (
          await request("/bookings", "POST", {
            kind: "court",
            bookings: [slot(11)],
          })
        ).status,
        409,
      );
      await db.courtDateOverride.update({
        where: { date: keyDate },
        data: { type: "open" },
      });
      await db.holidayRate.create({
        data: { date: keyDate, title: "QA holiday", price: 32000 },
      });
      const a = await courtAvailability(db, keyDate);
      assert.equal(a.slots[0].price, 32000);
      const blocked = a.slots.find(
        (s) => s.courtId === court.id && s.startMinute === 600,
      )!;
      assert.equal(blocked.status, "blocked");
      assert.equal(blocked.reason, "Reserved");
      assert.equal(blocked.available, false);
      assert.equal(
        a.slots.find((s) => s.courtId === second.id && s.startMinute === 1080)!
          .available,
        true,
        "Explicit open overrides still release weekly blocks, as on web",
      );
    },
  );
  await t.test(
    "multi-selection conflicts roll back every row and receipt",
    async () => {
      const before = await db.booking.count(),
        key = randomUUID();
      const response = await request(
        "/bookings",
        "POST",
        { kind: "court", bookings: [slot(11), slot(8)] },
        session.accessToken,
        key,
      );
      assert.equal(response.status, 409);
      assert.equal(await db.booking.count(), before);
      assert.equal(await db.bookingSubmission.count({ where: { key } }), 0);
    },
  );
  await t.test(
    "two concurrent HTTP clients cannot take the same slot",
    async () => {
      const responses = await Promise.all([
        request(
          "/bookings",
          "POST",
          { kind: "court", bookings: [slot(11)] },
          session.accessToken,
          randomUUID(),
        ),
        request(
          "/bookings",
          "POST",
          { kind: "court", bookings: [slot(11)] },
          otherSession.accessToken,
          randomUUID(),
        ),
      ]);
      assert.equal(
        responses.filter((r) => r.status === 201).length,
        1,
        JSON.stringify(responses),
      );
      assert.equal(responses.filter((r) => r.status === 409).length, 1);
      assert.equal(
        await db.booking.count({
          where: { date: keyDate, courtId: court.id, time: slot(11).time },
        }),
        1,
      );
    },
  );
  await t.test(
    "concurrent duplicate requests reuse one committed receipt",
    async () => {
      const key = randomUUID(),
        body = { kind: "court", bookings: [slot(7)] };
      const responses = await Promise.all([
        request("/bookings", "POST", body, session.accessToken, key),
        request("/bookings", "POST", body, session.accessToken, key),
      ]);
      const receipt = await request(`/court-booking/submissions/${key}`);
      assert.equal(receipt.status, 200);
      assert.equal(
        await db.booking.count({
          where: { date: keyDate, courtId: court.id, time: slot(7).time },
        }),
        1,
      );
      assert.ok(responses.every((r) => [201, 409].includes(r.status)));
    },
  );
  await t.test(
    "database protects alternate writers, aliases and status reactivation",
    async () => {
      const base = {
        userId: user.id,
        kind: "court" as const,
        title: "QA direct write",
        date: keyDate,
        courtId: court.id,
        time: "08:00 AM - 09:00 AM",
        price: 20000,
        location: "QA",
        status: "CONFIRMED" as const,
      };
      await assert.rejects(
        db.booking.create({ data: { ...base, code: randomUUID() } }),
      );
      await assert.rejects(
        db.booking.create({
          data: {
            ...base,
            kind: "private_course",
            time: "8:30 AM — 9:30 AM",
            code: randomUUID(),
          },
        }),
      );
      const cancelled = await db.booking.create({
        data: { ...base, status: "cancelled", code: randomUUID() },
      });
      await assert.rejects(
        db.booking.update({
          where: { id: cancelled.id },
          data: { status: "CONFIRMED" },
        }),
      );
    },
  );
  await t.test(
    "cancellation releases availability and is repeatable",
    async () => {
      assert.equal(
        (
          await request(`/bookings/${ids[0]}/status`, "PATCH", {
            status: "cancelled",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await request(`/bookings/${ids[0]}/status`, "PATCH", {
            status: "cancelled",
          })
        ).status,
        200,
      );
      assert.equal(
        (await courtAvailability(db, keyDate)).slots.find(
          (s) => s.courtId === court.id && s.startMinute === 480,
        )?.available,
        true,
      );
      await db.booking.update({
        where: { id: ids[1] },
        data: { paymentStatus: "paid" },
      });
      assert.equal(
        (
          await request(`/bookings/${ids[1]}/status`, "PATCH", {
            status: "cancelled",
          })
        ).status,
        409,
      );
    },
  );
  await t.test(
    "service supports legacy single/slots inputs without a retry header",
    async () => {
      const result = await createCourtBooking(db, user, {
        date: keyDate,
        slots: [{ courtId: second.id, time: "6:00 AM - 7:00 AM" }],
      });
      assert.equal(result.booking.time, "6:00 AM — 7:00 AM");
      assert.equal(result.booking.paymentStatus, "pending");
    },
  );
});
