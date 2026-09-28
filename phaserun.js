// phaserun.js：按处理预算处理事件，用尽的连着载压账，收尾把账做完
import { joinOf, readyOf } from "./phase.js";

const KINDS = ["join", "arrive", "phase"];

function codes(spec) {
  return {
    badEvent: spec.event_error_code || "E_BAD_EVENT",
    badName: spec.bad_name_code || "E_BAD_NAME",
    dupWorker: spec.dup_worker_code || "E_DUP_WORKER",
    noWorker: spec.no_worker_code || "E_NO_WORKER",
    dupArrive: spec.dup_arrive_code || "E_DUP_ARRIVE",
    empty: spec.empty_code || "E_EMPTY",
    pending: spec.pending_code || "E_PENDING"
  };
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function normalize(state) {
  const src = state || {};
  return {
    workers: (src.workers || []).slice(),
    arrived: (src.arrived || []).slice(),
    rounds: src.rounds || 0,
    ledger: (src.ledger || []).slice(),
    applied: (src.applied || []).slice()
  };
}

function keyOf(entry) {
  return entry && entry.id !== undefined && entry.id !== null ? entry.id : null;
}

function isApplied(state, entry) {
  const key = keyOf(entry);
  return key !== null && state.applied.indexOf(key) >= 0;
}

function markApplied(state, entry) {
  const key = keyOf(entry);
  if (key !== null && state.applied.indexOf(key) < 0) { state.applied.push(key); }
}

// 结构校验：事件形状、名字非空（先校验，不带预算）
function validateShape(entry, code) {
  if (!entry || typeof entry !== "object" || KINDS.indexOf(entry.kind) < 0) {
    fail(code.badEvent, "bad event");
  }
  if (entry.kind === "join" || entry.kind === "arrive") {
    if (typeof entry.worker !== "string" || entry.worker.length === 0) {
      fail(code.badName, "bad name");
    }
  }
}

// 语义校验 + 落状态：按当前名单与本轮已到名单判
function applyEntry(state, entry, code) {
  if (entry.kind === "join") {
    if (state.workers.indexOf(entry.worker) >= 0) { fail(code.dupWorker, "dup worker"); }
    state.workers = joinOf(state.workers, entry.worker);
    return;
  }
  if (entry.kind === "arrive") {
    if (state.workers.indexOf(entry.worker) < 0) { fail(code.noWorker, "no worker"); }
    if (state.arrived.indexOf(entry.worker) >= 0) { fail(code.dupArrive, "dup arrive"); }
    state.arrived.push(entry.worker);
    return;
  }
  if (state.workers.length === 0) { fail(code.empty, "empty"); }
  if (!readyOf(state.workers, state.arrived)) { fail(code.pending, "pending"); }
  state.arrived = [];
  state.rounds += 1;
}

function compact(entry) {
  return [entry.kind, entry.kind === "phase" ? "" : entry.worker];
}

export function step(spec) {
  const code = codes(spec);
  const state = normalize(spec.state);
  const events = (spec.events || []).slice();
  const ledgerBefore = state.ledger.length;
  const bound = events.length + ledgerBefore;
  let budget = spec.budget === undefined || spec.budget === null ? bound : spec.budget;
  if (!Number.isFinite(budget)) { budget = bound; }
  budget = Math.max(0, Math.floor(budget));

  const queue = state.ledger.map(function (entry) {
    return { id: entry.id, kind: entry.kind, worker: entry.worker };
  });
  const fresh = [];
  events.forEach(function (event) {
    validateShape(event, code);
    fresh.push({ id: event.id, kind: event.kind, worker: event.worker });
  });

  const ledger = [];
  let served = 0;
  let judged = 0;
  queue.forEach(function (entry) {
    if (budget > 0) {
      budget -= 1;
      applyEntry(state, entry, code);
      markApplied(state, entry);
      served += 1;
      judged += 1;
    } else {
      ledger.push(entry);
      judged += 1;
    }
  });
  fresh.forEach(function (entry) {
    if (isApplied(state, entry)) { return; }
    if (budget > 0) {
      budget -= 1;
      applyEntry(state, entry, code);
      markApplied(state, entry);
      served += 1;
      judged += 1;
    } else {
      ledger.push(entry);
      judged += 1;
    }
  });

  state.ledger = ledger;
  return {
    state: state,
    served: served,
    ledger_before: ledger.length,
    ledger: ledger.map(compact),
    judged: judged,
    judged_bound: bound
  };
}

export function close(spec) {
  const code = codes(spec);
  const state = normalize(spec.state);
  let catchup = 0;
  state.ledger.forEach(function (entry) {
    validateShape(entry, code);
    if (isApplied(state, entry)) { return; }
    applyEntry(state, entry, code);
    markApplied(state, entry);
    catchup += 1;
  });
  state.ledger = [];
  return { state: state, catchup: catchup };
}
