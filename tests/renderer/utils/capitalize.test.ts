import { capitalizeFirstLetter } from "../../../src/renderer/utils/capitalize";
import { generateRandomLowercase } from "../../testutils";

const num_tests = 10;
const strlen = 10;

describe("Test capitalizeFirstLetter", () => {
    test("Empty String", () => {
        expect(capitalizeFirstLetter('')).toBe('');
    })

    // should not change
    test("Numerical Strings", () => {
        let tests = new Array(num_tests).fill("").map(()=>Math.random().toString().slice(2, strlen));
        for(const t of tests) {
            expect(capitalizeFirstLetter(t)).toBe(t);
        }
    });

    // should change first letter
    test("Lowercase Strings", () => {
        let tests = new Array(num_tests).fill("").map(()=>generateRandomLowercase(strlen));
        for(const t of tests) {
            expect(capitalizeFirstLetter(t)[0]).toBe(t[0].toLocaleUpperCase());
            expect(capitalizeFirstLetter(t).slice(1)).toBe(t.slice(1));
        }
    })
})