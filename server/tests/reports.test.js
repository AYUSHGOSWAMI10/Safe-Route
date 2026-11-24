const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const request = require("supertest");
const jwt = require("jsonwebtoken");

require("dotenv").config({ path: `${__dirname}/../.env` });

const { app } = require("../server");
const User = require("../models/User");
const SafetyReport = require("../models/SafetyReport");

if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
  throw new Error("Test database URI and JWT_SECRET are required.");
}

const VALID_REPORT = {
  category: "Poor lighting",
  location: "Main Street near Central Park",
  description: "The streetlight at this corner has been out for over a week, making the area dark and unsafe for pedestrians at night.",
};

function makeToken(userId) {
  return jwt.sign({ sub: userId.toString() }, process.env.JWT_SECRET, { expiresIn: "5m" });
}

test("safety reports: authentication, ownership, and admin moderation", async (t) => {
  await mongoose.connect(process.env.MONGODB_URI);

  let reporterA;
  let reporterB;
  let adminUser;
  let reportByA;
  let reportByB;

  try {
    const suffix = `${Date.now()}-${process.pid}`;
    reporterA = await User.create({
      name: "Reports Tester A",
      email: `reports-a-${suffix}@example.com`,
      passwordHash: "test-only-not-used",
      role: "user",
    });
    reporterB = await User.create({
      name: "Reports Tester B",
      email: `reports-b-${suffix}@example.com`,
      passwordHash: "test-only-not-used",
      role: "user",
    });
    adminUser = await User.create({
      name: "Reports Admin",
      email: `reports-admin-${suffix}@example.com`,
      passwordHash: "test-only-not-used",
      role: "admin",
    });

    const tokenA = makeToken(reporterA._id);
    const tokenB = makeToken(reporterB._id);
    const tokenAdmin = makeToken(adminUser._id);
    const demoToken = jwt.sign({ sub: "demo-user" }, process.env.JWT_SECRET, { expiresIn: "5m" });

    await t.test("unauthenticated users cannot access reports", async () => {
      const createResp = await request(app)
        .post("/api/reports")
        .send(VALID_REPORT);
      assert.equal(createResp.status, 401);

      const listResp = await request(app).get("/api/reports");
      assert.equal(listResp.status, 401);

      const adminListResp = await request(app).get("/api/admin/reports");
      assert.equal(adminListResp.status, 401);

      const moderateResp = await request(app)
        .patch("/api/admin/reports/000000000000000000000000")
        .send({ status: "approved" });
      assert.equal(moderateResp.status, 401);
    });

    await t.test("demo users cannot submit persistent reports", async () => {
      const resp = await request(app)
        .post("/api/reports")
        .set("Authorization", `Bearer ${demoToken}`)
        .send(VALID_REPORT)
        .expect(403);
      assert.ok(resp.body.error.includes("Demo accounts cannot submit persistent reports"));
    });

    await t.test("authenticated users can submit valid reports", async () => {
      const resp = await request(app)
        .post("/api/reports")
        .set("Authorization", `Bearer ${tokenA}`)
        .send(VALID_REPORT)
        .expect(201);

      assert.ok(resp.body.report);
      assert.equal(resp.body.report.category, "Poor lighting");
      assert.equal(resp.body.report.location, VALID_REPORT.location);
      assert.equal(resp.body.report.status, "pending");
      assert.ok(resp.body.report.id);
      assert.ok(resp.body.report.createdAt);
    });

    await t.test("users can list only their own reports", async () => {
      reportByA = await request(app)
        .post("/api/reports")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ ...VALID_REPORT, category: "Isolated area" });
      assert.equal(reportByA.status, 201);

      reportByB = await request(app)
        .post("/api/reports")
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ ...VALID_REPORT, category: "Suspicious activity" });
      assert.equal(reportByB.status, 201);

      const listA = await request(app)
        .get("/api/reports")
        .set("Authorization", `Bearer ${tokenA}`)
        .expect(200);

      const idsA = listA.body.reports.map((r) => r.id);
      assert.ok(idsA.includes(reportByA.body.report.id), "user A should see their own report");
      assert.ok(!idsA.includes(reportByB.body.report.id), "user A must not see user B's report");
      assert.ok(
        listA.body.reports.every((r) => r.status === "pending"),
        "fresh reports should be pending"
      );

      const listB = await request(app)
        .get("/api/reports")
        .set("Authorization", `Bearer ${tokenB}`)
        .expect(200);
      assert.ok(listB.body.reports.some((r) => r.id === reportByB.body.report.id));
    });

    await t.test("users cannot access or moderate other users' reports", async () => {
      const adminListAsUser = await request(app)
        .get("/api/admin/reports")
        .set("Authorization", `Bearer ${tokenA}`);
      assert.equal(adminListAsUser.status, 403);

      const moderateBReportAsUser = await request(app)
        .patch(`/api/admin/reports/${reportByB.body.report.id}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ status: "approved", moderationNote: "Unauthorized attempt" });
      assert.equal(moderateBReportAsUser.status, 403);

      const moderateOwnReportAsUser = await request(app)
        .patch(`/api/admin/reports/${reportByA.body.report.id}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ status: "rejected" });
      assert.equal(moderateOwnReportAsUser.status, 403);
    });

    await t.test("invalid payloads are rejected", async () => {
      const invalidCases = [
        { body: { ...VALID_REPORT, category: "Dangerous zone" }, label: "invalid category" },
        { body: { ...VALID_REPORT, location: "" }, label: "empty location" },
        { body: { ...VALID_REPORT, location: "x".repeat(201) }, label: "overlong location" },
        { body: { ...VALID_REPORT, description: "too short" }, label: "short description" },
        { body: { ...VALID_REPORT, description: "x".repeat(1001) }, label: "overlong description" },
        { body: {}, label: "empty payload" },
      ];

      for (const { body, label } of invalidCases) {
        const resp = await request(app)
          .post("/api/reports")
          .set("Authorization", `Bearer ${tokenA}`)
          .send(body);
        assert.equal(resp.status, 400, `expected 400 for ${label}`);
        assert.ok(resp.body.error, `expected error message for ${label}`);
      }
    });

    await t.test("invalid report IDs are handled correctly", async () => {
      const invalidIdResp = await request(app)
        .patch("/api/admin/reports/not-a-report-id")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ status: "approved" });
      assert.equal(invalidIdResp.status, 400);
      assert.ok(invalidIdResp.body.error.includes("Invalid report ID"));

      const missingIdResp = await request(app)
        .patch("/api/admin/reports/000000000000000000000000")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ status: "approved" });
      assert.equal(missingIdResp.status, 404);
      assert.ok(missingIdResp.body.error.includes("Report not found"));

      const badStatusResp = await request(app)
        .patch(`/api/admin/reports/${reportByB.body.report.id}`)
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ status: "archived" });
      assert.equal(badStatusResp.status, 400);
    });

    await t.test("only admins can list all reports", async () => {
      const allReports = await request(app)
        .get("/api/admin/reports")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .expect(200);

      assert.ok(Array.isArray(allReports.body.reports));
      assert.ok(
        allReports.body.reports.some((r) => r.id === reportByB.body.report.id),
        "admin list should include other users' reports"
      );
      assert.ok(
        allReports.body.reports.every((r) => r.user),
        "admin list should include user details"
      );
    });

    await t.test("admins can approve and reject reports with moderation notes", async () => {
      const reportId = reportByB.body.report.id;

      const approved = await request(app)
        .patch(`/api/admin/reports/${reportId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({
          status: "approved",
          moderationNote: "Verified with municipal lighting records.",
        })
        .expect(200);

      assert.equal(approved.body.report.status, "approved");
      assert.equal(
        approved.body.report.moderationNote,
        "Verified with municipal lighting records."
      );

      const reloaded = await request(app)
        .get("/api/admin/reports")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .expect(200);
      const persisted = reloaded.body.reports.find((r) => r.id === reportId);
      assert.equal(persisted.status, "approved");
      assert.equal(persisted.moderationNote, "Verified with municipal lighting records.");

      const rejected = await request(app)
        .patch(`/api/admin/reports/${reportId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ status: "rejected", moderationNote: "Duplicate report." })
        .expect(200);
      assert.equal(rejected.body.report.status, "rejected");
      assert.equal(rejected.body.report.moderationNote, "Duplicate report.");

      const clearedNote = await request(app)
        .patch(`/api/admin/reports/${reportId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ status: "approved", moderationNote: "" })
        .expect(200);
      assert.equal(clearedNote.body.report.status, "approved");
      assert.equal(clearedNote.body.report.moderationNote, "");

      const longNoteResp = await request(app)
        .patch(`/api/admin/reports/${reportId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ status: "approved", moderationNote: "x".repeat(501) });
      assert.equal(longNoteResp.status, 400);
    });
  } finally {
    if (reporterA) await SafetyReport.deleteMany({ userId: reporterA._id });
    if (reporterB) await SafetyReport.deleteMany({ userId: reporterB._id });
    if (reporterA) await User.deleteOne({ _id: reporterA._id });
    if (reporterB) await User.deleteOne({ _id: reporterB._id });
    if (adminUser) await User.deleteOne({ _id: adminUser._id });
    await mongoose.disconnect();
  }
});