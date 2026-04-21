import { setIntervalImmediately } from "../../../src/renderer/utils/interval";
import { averageNumArray } from "../../testutils";

const allow_timing_slip_ms = 5;
const timing_intervals = 5;
const interval_ms = Math.round(20 + (200 * Math.random()));

const Timeout = setTimeout(() => {}, 0).constructor;

describe("Test set interval immidiate", () => {
    let Ti = Date.now();
    let time_till_initial: number | undefined = undefined;
    let prev_interval_time = Ti;
    let timings = new Array<number>();
    let interval = setIntervalImmediately(_imm, interval_ms);

    // async lock for tests, resolves once timing tests finish
    let test_lock = true;
    let test_lock_await = new Promise((resolve, reject) => {
        setInterval(() => {
            if(!test_lock) resolve(null);
        }, 100);
    })

    // function called from interval
    // on first run, sets time_till_interval for immidiate call
    // after, collects timings for interval
    function _imm() {
        // if immidiate run, store time till initial call
        // should be instant
        if(typeof time_till_initial !== "number") {
            time_till_initial = Date.now() - Ti;
            return;
        }
        
        // else, add to timings up to timing_intervals
        const now = Date.now()
        timings.push(now - prev_interval_time);
        prev_interval_time = now;
        
        // unlock tests
        if(timings.length >= timing_intervals) test_lock = false;
    }

    // clear the interval so timings stay constant
    test("Assert function return type", async () => {
        await test_lock_await
        expect(interval instanceof Timeout).toBeTruthy();
    })
    
    // time_till_initial should be essentially 0
    test("Assert immidaite call", async () => {
        await test_lock_await;
        expect(time_till_initial).toBeLessThanOrEqual(1);
    })
    
    // other timings should average to interval +- time_slip_ms
    test("Assert interval timings", async () => {
        await test_lock_await;
        expect(Math.abs(interval_ms - averageNumArray(timings))).toBeLessThanOrEqual(allow_timing_slip_ms);
    })
})
