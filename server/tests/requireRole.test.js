const test = require("node:test");
const assert = require("node:assert/strict");
const requireRole = require("../middleware/requireRole");

function makeResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("unauthenticated request is rejected", () => {
  const req = {};
  const res = makeResponse();
  let nextCalled = false;

  requireRole("admin")(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test("normal user cannot access admin-only resource", () => {
  const req = { userId: "user-1", userRole: "user" };
  const res = makeResponse();
  let nextCalled = false;

  requireRole("admin")(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 403);
  assert.equal(nextCalled, false);
});

test("admin can access admin-only resource", () => {
  const req = { userId: "admin-1", userRole: "admin" };
  const res = makeResponse();
  let nextCalled = false;

  requireRole("admin")(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test("user can access a resource explicitly allowed for users", () => {
  const req = { userId: "user-1", userRole: "user" };
  const res = makeResponse();
  let nextCalled = false;

  requireRole("user", "admin")(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});
