// phaserun.js：按共用处理预算跑事件，用尽就连着压账，收尾不限预算清账
import { joinOf, readyOf } from "./phase.js";

const DEFAULT_CODES = {
  bad_name_code: "E_BAD_NAME",
  dup_worker_code: "E_DUP_WORKER",
  no_worker_code: "E_NO_WORKER",
  dup_arrive_code: "E_DUP_ARRIVE",
  empty_code: "E_EMPTY",
  pending_code: "E_PENDING",
  event_error_code: "E_BAD_EVENT"
};

const KINDS = ["join", "arrive", "phase"];

function fail(spec, key, message) {
  const code = (spec && spec[key]) || DEFAULT_CODES[key];
  const error = new Error(message);
  error.code = code;
  throw error;
}

// 状态一律拷副本，绝不改入参；账上每条是 [kind, worker]（phase 的 worker 为 ""），
// id 挂成不可枚举属性：JSON 看不见，清账时仍能认出原事件。
function cloneState(state) {
  return {
    workers: state.workers.slice(),
    arrived: state.arrived.slice(),
    rounds: state.rounds,
    ledger: state.ledger.map((row) => {
      const copy = [row[0], row[1]];
      if (Object.prototype.hasOwnProperty.call(row, "id")) {
        Object.defineProperty(copy, "id", {
          value: row.id, enumerable: false, configurable: true, writable: true
        });
      }
      return copy;
    }),
    applied: state.applied.slice()
  };
}

// 先结构（E_BAD_EVENT），再空名（E_BAD_NAME）；都在业务判定之前。
function validate(spec, event) {
  if (!event || typeof event !== "object" || KINDS.indexOf(event.kind) < 0) {
    fail(spec, "event_error_code", "非法事件");
  }
  if (event.kind === "join" || event.kind === "arrive") {
    if (typeof event.worker !== "string") {
      fail(spec, "event_error_code", "事件缺少工作者名字");
    }
    if (event.worker.length === 0) {
      fail(spec, "bad_name_code", "工作者名字为空");
    }
  }
}

// 按当前名单与本轮已到名单判业务错误，合法才落状态。
function applyOne(spec, state, kind, worker) {
  if (kind === "join") {
    if (state.workers.indexOf(worker) >= 0) {
      fail(spec, "dup_worker_code", "工作者重复登记：" + worker);
    }
    state.workers = joinOf(state.workers, worker);
  } else if (kind === "arrive") {
    if (state.workers.indexOf(worker) < 0) {
      fail(spec, "no_worker_code", "工作者尚未登记：" + worker);
    }
    if (state.arrived.indexOf(worker) >= 0) {
      fail(spec, "dup_arrive_code", "工作者本轮已到：" + worker);
    }
    state.arrived = state.arrived.concat(worker).sort();
  } else {
    if (state.workers.length === 0) {
      fail(spec, "empty_code", "名单为空，不能推进轮次");
    }
    if (!readyOf(state.workers, state.arrived)) {
      fail(spec, "pending_code", "还有工作者本轮未到，不能推进");
    }
    state.arrived = [];
    state.rounds += 1;
  }
}

function rowOf(event) {
  const kind = event && typeof event === "object" && typeof event.kind === "string"
    ? event.kind : "";
  const worker = event && typeof event === "object" && typeof event.worker === "string"
    ? event.worker : "";
  const row = [kind, worker];
  if (event && typeof event === "object" && Object.prototype.hasOwnProperty.call(event, "id")) {
    Object.defineProperty(row, "id", {
      value: event.id, enumerable: false, configurable: true, writable: true
    });
  }
  return row;
}

export function step(spec) {
  const state = cloneState(spec.state);
  const events = spec.events || [];
  const ledgerStart = state.ledger.length;
  let budget = Number.isFinite(spec.budget) ? Math.max(0, Math.trunc(spec.budget)) : 0;
  let served = 0;
  let judged = 0;

  // 先还旧账：账上事件同样花共用预算。
  while (budget > 0 && state.ledger.length > 0) {
    const row = state.ledger.shift();
    judged += 1;
    applyOne(spec, state, row[0], row[1]);
    state.applied.push(Object.prototype.hasOwnProperty.call(row, "id") ? row.id : row);
    budget -= 1;
    served += 1;
  }

  for (const event of events) {
    // 重放已处理事件：直接跳过，不花预算、不新增处理。
    if (event && typeof event === "object"
        && Object.prototype.hasOwnProperty.call(event, "id")
        && state.applied.indexOf(event.id) >= 0) {
      continue;
    }
    judged += 1;
    if (budget > 0) {
      validate(spec, event);
      const worker = typeof event.worker === "string" ? event.worker : "";
      applyOne(spec, state, event.kind, worker);
      state.applied.push(event.id);
      budget -= 1;
      served += 1;
    } else {
      // 预算用尽：剩下的事件连着压账，不再校验（随预算可能撞不上）。
      state.ledger.push(rowOf(event));
    }
  }

  return {
    state,
    served,
    ledger_before: state.ledger.length,
    ledger: state.ledger,
    judged,
    judged_bound: ledgerStart + events.length
  };
}

export function close(spec) {
  const state = cloneState(spec.state);
  let catchup = 0;
  while (state.ledger.length > 0) {
    const row = state.ledger.shift();
    applyOne(spec, state, row[0], row[1]);
    state.applied.push(Object.prototype.hasOwnProperty.call(row, "id") ? row.id : row);
    catchup += 1;
  }
  return { state, catchup };
}
