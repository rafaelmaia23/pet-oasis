import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { makeUserData } from "@/__tests__/factories/user.factory";
import { clearDatabase } from "@/__tests__/helpers/database";
import app from "@/app";

afterEach(async () => {
  await clearDatabase();
});

describe("POST /api/v1/auth/signup", () => {
  it("should return 201 and create a new user for valid data", async () => {
    const data = makeUserData();

    const response = await request(app).post("/api/v1/auth/signup").send(data);

    expect(response.status).toBe(201);
  });

  it("should return 409 if email is already in use", async () => {
    const data = makeUserData();

    await request(app).post("/api/v1/auth/signup").send(data);
    const response = await request(app).post("/api/v1/auth/signup").send(data);

    expect(response.status).toBe(409);
  });

  it("should return 400 if name is missing", async () => {
    const data = makeUserData({ name: "" });

    const response = await request(app).post("/api/v1/auth/signup").send(data);

    expect(response.status).toBe(400);
  });

  it("should return 400 if email is invalid", async () => {
    const data = makeUserData({ email: "invalid-email" });

    const response = await request(app).post("/api/v1/auth/signup").send(data);

    expect(response.status).toBe(400);
  });

  it("should return 400 if password does not meet requirements", async () => {
    const data = makeUserData({ password: "weak" });

    const response = await request(app).post("/api/v1/auth/signup").send(data);

    expect(response.status).toBe(400);
  });
});

describe("POST /api/v1/auth/login", () => {
  it("should return a token for valid credentials", async () => {
    const data = makeUserData();

    await request(app).post("/api/v1/auth/signup").send(data);

    const response = await request(app).post("/api/v1/auth/login").send({
      email: data.email,
      password: data.password,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("token");
  });

  it("should return 401 for invalid password", async () => {
    const data = makeUserData();

    await request(app).post("/api/v1/auth/signup").send(data);

    const response = await request(app).post("/api/v1/auth/login").send({
      email: data.email,
      password: "wrongpassword",
    });

    expect(response.status).toBe(401);
  });

  it("should return 401 for non-existing email", async () => {
    const response = await request(app).post("/api/v1/auth/login").send({
      email: "nonexisting@test.com",
      password: "Test@1234",
    });

    expect(response.status).toBe(401);
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("should invalidate the session", async () => {
    const data = makeUserData();

    await request(app).post("/api/v1/auth/signup").send(data);

    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      email: data.email,
      password: data.password,
    });

    const { token } = loginResponse.body;

    const logoutResponse = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${token}`);

    expect(logoutResponse.status).toBe(204);
  });

  it("should return 401 after logout when trying to access protected route", async () => {
    const data = makeUserData();

    await request(app).post("/api/v1/auth/signup").send(data);

    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      email: data.email,
      password: data.password,
    });

    const { token } = loginResponse.body;

    await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${token}`);

    const response = await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
  });
});
