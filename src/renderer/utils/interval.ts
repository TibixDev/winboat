/**
 * Sets an interval but also executes `func` immediately
 */
export function setIntervalImmediately(func: Function, interval: number): NodeJS.Timeout {
  func();
  // @ts-ignore Should be fine
  return setInterval(func, interval);
}