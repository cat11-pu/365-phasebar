// phase.js：名单登记（按名字升序）与本轮到齐判定
export function joinOf(workers, worker) {
  return workers.concat(worker).sort();
}

export function readyOf(workers, arrived) {
  return workers.length > 0
    && workers.every((name) => arrived.indexOf(name) >= 0);
}
