import { describe, expect, it } from "vitest";
import {
  inRequestMemoScope,
  invalidateRequestMemo,
  requestMemo,
  statementMayWrite,
  withRequestMemoScope,
} from "./request-cache";

// The per-request memo (server/request-cache.ts). What it must do: answer a repeated read
// once inside a request, forget everything the moment a write goes out, forget a load that
// failed, and do nothing at all outside a request. The integration test beside this one
// (request-memo-survives-pool.itest.ts) proves the scope survives the session store's
// callback and that a real route issues one user read instead of two.

describe("requestMemo", () => {
  it("runs a loader once per key inside a scope and hands every caller the same value", async () => {
    let loads = 0;
    const load = async () => ({ n: ++loads });
    await withRequestMemoScope(async () => {
      const [a, b] = await Promise.all([requestMemo("k", load), requestMemo("k", load)]);
      const c = await requestMemo("k", load);
      expect(a).toEqual({ n: 1 });
      expect(b).toBe(a);
      expect(c).toBe(a);
      expect(await requestMemo("other", load)).toEqual({ n: 2 });
    });
    expect(loads).toBe(2);
  });

  it("is a pass-through outside a scope: nothing is remembered between calls", async () => {
    let loads = 0;
    const load = async () => ++loads;
    expect(inRequestMemoScope()).toBe(false);
    expect(await requestMemo("k", load)).toBe(1);
    expect(await requestMemo("k", load)).toBe(2);
    expect(inRequestMemoScope()).toBe(false);
  });

  it("does not leak between two scopes", async () => {
    let loads = 0;
    const load = async () => ++loads;
    expect(await withRequestMemoScope(() => requestMemo("k", load))).toBe(1);
    expect(await withRequestMemoScope(() => requestMemo("k", load))).toBe(2);
  });

  it("forgets everything when invalidated, so a read after a write is a fresh read", async () => {
    let value = "before";
    const load = async () => value;
    await withRequestMemoScope(async () => {
      expect(await requestMemo("row", load)).toBe("before");
      value = "after";
      expect(await requestMemo("row", load)).toBe("before");
      invalidateRequestMemo();
      expect(await requestMemo("row", load)).toBe("after");
    });
  });

  it("forgets a load that rejected, so the next caller retries instead of inheriting the error", async () => {
    let attempts = 0;
    const load = async () => {
      attempts++;
      if (attempts === 1) throw new Error("transient");
      return "ok";
    };
    await withRequestMemoScope(async () => {
      await expect(requestMemo("k", load)).rejects.toThrow("transient");
      expect(await requestMemo("k", load)).toBe("ok");
    });
    expect(attempts).toBe(2);
  });
});

describe("statementMayWrite", () => {
  it("classifies every statement shape drizzle, the session store and the raw pool issue", () => {
    for (const write of [
      'update "users" set "name" = $1 where "users"."id" = $2',
      'insert into "workout_logs" ("id") values (default) returning "id"',
      'delete from "workout_log_entries" where "workout_log_id" = $1',
      'UPDATE "session" SET expire = to_timestamp($1) WHERE sid = $2 RETURNING sid',
      'INSERT INTO "session" (sess, expire, sid) SELECT $1, to_timestamp($2), $3 ON CONFLICT (sid) DO UPDATE SET sess=$1',
      "  \n  UPDATE users SET x = 1",
      'with moved as (delete from "a" returning *) insert into "b" select * from moved',
      "TRUNCATE TABLE users RESTART IDENTITY CASCADE",
    ]) {
      expect(statementMayWrite(write), write).toBe(true);
    }
    for (const read of [
      'select "id" from "users" where "users"."id" = $1 limit $2',
      'SELECT sess FROM "session" WHERE sid = $1 AND expire >= to_timestamp($2)',
      "SELECT 1",
      "with ranked as (select 1) select * from ranked",
      'select "id" from "users" for update',
      "begin",
      "commit",
    ]) {
      expect(statementMayWrite(read), read).toBe(false);
    }
  });
});
