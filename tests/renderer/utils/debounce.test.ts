import { debounce } from "../../../src/renderer/utils/debounce";

const range = [10, 1000];
const num_tests = 10;
const allow_miss_ms = 10;
const args_len = 3;

describe("Test debounce", () => {

    // test delay of function calling
    test("Test Delay", async () => {
        const tests = new Array(num_tests)
            .fill(0)
            .map(() =>
                Math.round(range[0] + (Math.random() * (range[1] - range[0])))
            );
    
        await Promise.all(
            tests.map(async (delay) => {
                const T_i = Date.now();
    
                const T_f = await new Promise<number>((resolve) => {
                    debounce(() => {
                        resolve(Date.now());
                    }, delay)();
                });
    
                const T_diff = T_f - T_i;
                expect(Math.abs(T_diff - delay)).toBeLessThanOrEqual(allow_miss_ms);
            })
        );
    }, 3000);

    // test arguments passthrough
    test("Test debounce argument passthrough", async() => {
        let args = new Array(args_len).fill(0).map((i)=>Math.random());

        let res = await new Promise((resolve,reject) => {
            debounce((..._args) => {
                resolve(_args);
            }, 10)(...args);
        });

        expect(res).toEqual(args);
    })
})