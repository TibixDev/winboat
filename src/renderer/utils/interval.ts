/**
 * Sets an interval but also executes `func` immediately
 */
export function setIntervalImmediately(func: () => void, interval: number): NodeJS.Timeout {
    func();
    return setInterval(() => func(), interval);
}
