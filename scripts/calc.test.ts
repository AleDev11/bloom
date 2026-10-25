import { expect, test } from "bun:test";
import { evaluate, looksLikeMath } from "../src/launcher/calc";

test("follows operator precedence", () => {
	expect(evaluate("12*3+5")).toBe(41);
	expect(evaluate("2+3*4^2")).toBe(50);
	expect(evaluate("(2+3)*4")).toBe(20);
	expect(evaluate("-2^2")).toBe(-4);
	expect(evaluate("2^3^2")).toBe(512);
});

test("handles percentages and Spanish input", () => {
	expect(evaluate("20% de 80")).toBe(16);
	expect(evaluate("20% of 80")).toBe(16);
	expect(evaluate("50%")).toBe(0.5);
	expect(evaluate("3,5 * 2")).toBe(7);
	expect(evaluate("10 × 3 ÷ 2")).toBe(15);
});

test("knows functions and constants", () => {
	expect(evaluate("sqrt(16)")).toBe(4);
	expect(evaluate("raiz 9")).toBe(3);
	expect(evaluate("2pi")).toBeCloseTo(2 * Math.PI);
	expect(evaluate("log(1000)")).toBe(3);
});

test("rejects what isn't math", () => {
	expect(evaluate("spotify")).toBeNull();
	expect(evaluate("2+")).toBeNull();
	expect(evaluate("1/0")).toBeNull();
	expect(evaluate("alert(1)")).toBeNull();
});

test("only offers a result for expressions", () => {
	expect(looksLikeMath("12*3")).toBe(true);
	expect(looksLikeMath("20% de 80")).toBe(true);
	expect(looksLikeMath("sqrt(2)")).toBe(true);
	expect(looksLikeMath("2026")).toBe(false);
	expect(looksLikeMath("informe 2026")).toBe(false);
	expect(looksLikeMath("chrome")).toBe(false);
});
