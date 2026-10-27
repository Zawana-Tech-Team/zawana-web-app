import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createSessionService } from "../src/services/authSession.js";
import { today } from "../src/services/courtPolicy.js";

const testUrl = process.env.COURT_POSTGRES_TEST_URL;
test(
  "real PostgreSQL court API and multi-connection booking concurrency",
  { skip: !testUrl },
  async (t) => {
    const url = new URL(testUrl!);
    // Never run integration writes against a remote or ambiguously named database.
    assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
    assert.equal(url.pathname, "/zawana_court_test");
    const db = new PrismaClient({ datasources: { db: { url: testUrl } } });
    const suffix = randomUUID();
    const member = await db.user.create({
      data: {
        name: "Court Test",
        email: `${suffix}@example.test`,
        role: "member",
      },
    });
    const staff = await db.user.create({
      data: {
        name: "Court Staff Test",
        email: `staff-${suffix}@example.test`,
        role: "badminton_fo",
      },
    });
    const court = await db.court.create({
      data: {
        name: `Court ${suffix}`,
        type: "Standard",
        surface: "2nd Floor",
        price: 20000,
        features: [],
      },
    });
    const sessions = createSessionService(db);
    const memberToken = (
      await sessions.issue(db, member, "database_password", [])
    ).accessToken;
    const staffToken = (
      await sessions.issue(db, staff, "database_password", [])
    ).accessToken;
    const date = new Date(`${today()}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 2);
    const dateKey = date.toISOString().slice(0, 10),
      port = 19000 + Math.floor(Math.random() * 1000),
      origin = `http://127.0.0.1:${port}`;
    const child = spawn(
      new URL("../node_modules/.bin/tsx", import.meta.url).pathname,
      ["src/server.ts"],
      {
        cwd: new URL("..", import.meta.url),
        env: {
          ...process.env,
          DATABASE_URL: testUrl,
          DIRECT_URL: testUrl,
          AUTH_MODE: "firebase",
          NODE_ENV: "test",
          PORT: String(port),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (b) => (output += b));
    child.stderr.on("data", (b) => (output += b));
    t.after(async () => {
      child.kill();
      await db.courtBlock.deleteMany({ where: { courtId: court.id } });
      await db.authSession.deleteMany({
        where: { userId: { in: [member.id, staff.id] } },
      });
      await db.bookingCancellationRequest.deleteMany({ where: { booking: { userId: { in: [member.id, staff.id] } } } });
      await db.bookingChangeHistory.deleteMany({ where: { booking: { userId: { in: [member.id, staff.id] } } } });
      await db.user.deleteMany({
        where: { id: { in: [member.id, staff.id] } },
      });
      await db.court.delete({ where: { id: court.id } });
      await db.$disconnect();
    });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null)
        throw new Error(
          "Test API failed to start; inspect isolated test logs.",
        );
      if (
        await fetch(`${origin}/api/health`)
          .then((r) => r.ok)
          .catch(() => false)
      )
        break;
      await new Promise((r) => setTimeout(r, 100));
      if (i === 99) throw new Error("Test API startup timed out.");
    }
    const request = async (
      path: string,
      method = "GET",
      body?: unknown,
      token = memberToken,
    ) => {
      const response = await fetch(`${origin}/api${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return {
        status: response.status,
        value: await response.json(),
        requestId: response.headers.get("x-request-id"),
      };
    };
    const book = (time: string) =>
      request("/bookings", "POST", {
        kind: "court",
        bookings: [{ courtId: court.id, date: dateKey, time }],
      });
    await t.test(
      "POST court blocks quotes end; GET preserves fields, filtering and aliases",
      async () => {
        const created = await request(
          "/court-blocks",
          "POST",
          {
            courtId: court.id,
            dayOfWeek: date.getUTCDay(),
            start: "18:00",
            end: "19:00",
            title: "Class Test",
          },
          staffToken,
        );
        assert.equal(created.status, 201, JSON.stringify(created.value));
        assert.equal(created.value.end, "19:00");
        const listed = await request(
          `/court-blocks?courtId=${court.id}&date=${dateKey}`,
        );
        assert.equal(listed.status, 200);
        assert.equal(listed.value.length, 1);
        assert.equal(listed.value[0].courtName, court.name);
        assert.equal((await request("/court-blocks?date=invalid")).status, 400);
        const blocked = await book("6:00 PM — 7:00 PM");
        assert.equal(blocked.status, 409);
        assert.equal(blocked.value.code, "BOOKING_CONFLICT");
        assert.ok(blocked.requestId);
        await db.courtBlock.delete({ where: { id: created.value.id } });
      },
    );
    await t.test(
      "legacy 24-hour data cannot falsely block morning; adjacent/cancelled slots work",
      async () => {
        await db.booking.create({
          data: {
            userId: member.id,
            courtId: court.id,
            date: dateKey,
            time: "18:00 — 19:00",
            kind: "court",
            title: "Legacy Test",
            location: "QA",
            price: 20000,
            code: randomUUID(),
            status: "CONFIRMED",
          },
        });
        assert.equal((await book("6:00 AM — 7:00 AM")).status, 201);
        const overlap = await book("6:00 PM — 7:00 PM");
        assert.equal(overlap.status, 409);
        assert.equal(overlap.value.code, "BOOKING_CONFLICT");
        assert.equal((await book("7:00 PM — 8:00 PM")).status, 201);
        const cancelled = await book("8:00 AM — 9:00 AM");
        assert.equal(cancelled.status, 201);
        assert.equal(
          (
            await request(
              `/bookings/${cancelled.value.booking.id}/status`,
              "PATCH",
              { status: "cancelled" },
            )
          ).status,
          200,
        );
        assert.equal((await book("8:00 AM — 9:00 AM")).status, 201);
      },
    );
    await t.test(
      "two simultaneous requests commit at most one reservation",
      async () => {
        const results = await Promise.all([
          book("11:00 AM — 12:00 PM"),
          book("11:00 AM — 12:00 PM"),
        ]);
        assert.equal(results.filter((r) => r.status === 201).length, 1);
        assert.equal(results.filter((r) => r.status === 409).length, 1);
        assert.equal(
          await db.booking.count({
            where: {
              courtId: court.id,
              date: dateKey,
              time: "11:00 AM — 12:00 PM",
              status: "CONFIRMED",
            },
          }),
          1,
        );
      },
    );
    assert.ok(output.includes("Zawana API running"));
  },
);
