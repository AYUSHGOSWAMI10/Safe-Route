const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const request = require("supertest");

require("dotenv").config({ path: `${__dirname}/../.env` });

const { app } = require("../server");
const User = require("../models/User");
const RouteHistory = require("../models/RouteHistory");

test("route history enforces per-user ownership", async (t) => {
  if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
    throw new Error("Test database URI and JWT_SECRET are required.");
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const suffix = `${Date.now()}-${process.pid}`;
  const emails = [
    `idor-a-${suffix}@example.com`,
    `idor-b-${suffix}@example.com`,
  ];

  let userA;
  let userB;
  let historyA;
  let historyB;

  try {
    userA = await User.create({
      name: "IDOR Test A",
      email: emails[0],
      passwordHash: "test-only-not-used",
      role: "user",
    });

    userB = await User.create({
      name: "IDOR Test B",
      email: emails[1],
      passwordHash: "test-only-not-used",
      role: "user",
    });

    // Login tokens are generated with the same secret as the app.
    const jwt = require("jsonwebtoken");
    const tokenA = jwt.sign(
      { sub: userA._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: "5m" }
    );
    const tokenB = jwt.sign(
      { sub: userB._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: "5m" }
    );

    const payload = {
      source: "Central Park",
      destination: "City Library",
      preference: "balanced",
      selectedRoute: "Route A",
      distance: 3.2,
      estimatedTime: 12,
      safetyScore: 85,
    };

    const createA = await request(app)
      .post("/api/history")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(payload);

    assert.equal(createA.status, 201);
    historyA = createA.body.history._id;

    const createB = await request(app)
      .post("/api/history")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ ...payload, source: "University" });

    assert.equal(createB.status, 201);
    historyB = createB.body.history._id;

    await t.test("User A can read their own history", async () => {
      const response = await request(app)
        .get(`/api/history/${historyA}`)
        .set("Authorization", `Bearer ${tokenA}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.history.userId, userA._id.toString());
    });

    await t.test("User A cannot read User B history", async () => {
      const response = await request(app)
        .get(`/api/history/${historyB}`)
        .set("Authorization", `Bearer ${tokenA}`);

      assert.equal(response.status, 404);
    });

    await t.test("history listing only returns the current user's records", async () => {
      const response = await request(app)
        .get("/api/history")
        .set("Authorization", `Bearer ${tokenA}`);

      assert.equal(response.status, 200);
      assert.ok(
        response.body.history.every(
          (item) => item.userId.toString() === userA._id.toString()
        )
      );
    });

    await t.test("invalid history ID returns 404", async () => {
      const response = await request(app)
        .get("/api/history/not-an-object-id")
        .set("Authorization", `Bearer ${tokenA}`);

      assert.equal(response.status, 404);
    });
  } finally {
    if (userA) {
      await RouteHistory.deleteMany({ userId: userA._id });
      await User.deleteOne({ _id: userA._id });
    }
    if (userB) {
      await RouteHistory.deleteMany({ userId: userB._id });
      await User.deleteOne({ _id: userB._id });
    }
    await mongoose.disconnect();
  }
});
