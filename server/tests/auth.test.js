const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../server");
const jwt = require("jsonwebtoken");
require("dotenv").config({ path: `${__dirname}/../.env` });

const TEST_JWT_SECRET = "test-jwt-secret-key-for-demo-purposes-only";

test("demo login with valid credentials", async () => {
  const response = await request(app)
    .post("/api/auth/demo-login")
    .send({ email: "demo@saferoute.local", password: "SafeRouteDemo123" })
    .expect(200);

  assert.ok(response.body.success);
  assert.ok(response.body.token);
  assert.ok(response.body.user);
  assert.equal(response.body.user.id, "demo-user");
  assert.equal(response.body.user.email, "demo@saferoute.local");

  // Verify the token payload
  const payload = jwt.verify(response.body.token, TEST_JWT_SECRET);
  assert.equal(payload.sub, "demo-user");
});

test("demo login with invalid credentials", async () => {
  const response = await request(app)
    .post("/api/auth/demo-login")
    .send({ email: "demo@saferoute.local", password: "wrongpassword" })
    .expect(401);

  assert.ok(response.body.success === false);
  assert.ok(response.body.message.includes("Invalid"));
});

test("demo login disabled in production mode", async () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const response = await request(app)
      .post("/api/auth/demo-login")
      .send({ email: "demo@saferoute.local", password: "SafeRouteDemo123" })
      .expect(403);

    assert.ok(response.body.success === false);
    assert.ok(response.body.message.includes("disabled"));
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

test("demo login disabled when DEMO_LOGIN_ENABLED is not true", async () => {
  const originalEnv = process.env.DEMO_LOGIN_ENABLED;
  process.env.DEMO_LOGIN_ENABLED = "false";
  try {
    const response = await request(app)
      .post("/api/auth/demo-login")
      .send({ email: "demo@saferoute.local", password: "SafeRouteDemo123" })
      .expect(403); // Should be disabled

    assert.ok(response.body.success === false);
  } finally {
    process.env.DEMO_LOGIN_ENABLED = originalEnv;
  }
});

test("valid demo JWT grants access to protected routes", async () => {
  // First login as demo
  const loginResp = await request(app)
    .post("/api/auth/demo-login")
    .send({ email: "demo@saferoute.local", password: "SafeRouteDemo123" });

  assert.ok(loginResp.body.token);

  // Use the token to access /api/me
  const meResp = await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${loginResp.body.token}`)
    .expect(200);

  assert.ok(meResp.body.success);
  assert.equal(meResp.body.user.id, "demo-user");
  assert.equal(meResp.body.user.role, "user");
});

test("demo token sets req.userId and req.userRole correctly", async () => {
  const loginResp = await request(app)
    .post("/api/auth/demo-login")
    .send({ email: "demo@saferoute.local", password: "SafeRouteDemo123" });

  const meResp = await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${loginResp.body.token}`)
    .expect(200);

  assert.equal(meResp.body.user.id, "demo-user");
  assert.equal(meResp.body.user.role, "user");
});

test("invalid demo credentials return 401", async () => {
  const response = await request(app)
    .post("/api/auth/demo-login")
    .send({ email: "wrong@saferoute.local", password: "SafeRouteDemo123" })
    .expect(401);

  assert.ok(response.body.success === false);
  assert.ok(response.body.message.includes("Invalid"));
});

test("normal authentication still works with real users", async () => {
  // This test verifies that normal auth is unaffected
  // We can't test full login without a real user in DB,
  // but we can verify the route exists and requires auth
  const response = await request(app).get("/api/auth/me");
  assert.equal(response.status, 401); // No token = 401
});

test("demo user is not an admin", async () => {
  const loginResp = await request(app)
    .post("/api/auth/demo-login")
    .send({ email: "demo@saferoute.local", password: "SafeRouteDemo123" });

  const meResp = await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${loginResp.body.token}`);

  assert.equal(meResp.status, 200);
  assert.equal(meResp.body.user.role, "user"); // Demo user should be "user", not "admin"
});