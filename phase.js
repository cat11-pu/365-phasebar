// phase.js：名单登记与到齐判定

export function joinOf(workers, worker) {
  const list = (workers || []).slice();
  let at = 0;
  while (at < list.length && list[at] < worker) { at += 1; }
  list.splice(at, 0, worker);
  return list;
}

export function readyOf(workers, arrived) {
  const list = workers || [];
  if (list.length === 0) { return false; }
  const here = arrived || [];
  return list.every(function (worker) { return here.indexOf(worker) >= 0; });
}
