import assert from "node:assert";
import { joinOf, readyOf } from "../phase.js";
import { step, close } from "../phaserun.js";
import { render } from "../app.js";

const base = {
  budget: 1,
  state: { workers: [], arrived: [], rounds: 0, ledger: [], applied: [] },
  events: [{ id: 1, kind: "join", worker: "a" }],
  bad_name_code: "E_BAD_NAME", dup_worker_code: "E_DUP_WORKER",
  no_worker_code: "E_NO_WORKER", dup_arrive_code: "E_DUP_ARRIVE",
  empty_code: "E_EMPTY", pending_code: "E_PENDING",
  event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("joinOf returns a list", () => {
  assert.ok(Array.isArray(joinOf([], "a")));
});

check("readyOf returns a boolean", () => {
  assert.strictEqual(typeof readyOf([], []), "boolean");
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count_events, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
