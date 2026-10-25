/**
 * The launcher's calculator: a small recursive-descent parser (no eval) for
 * + - * / ^ %, parentheses, a few functions and constants. Also understands
 * "20% de 80" / "20% of 80", "×" "÷", and a decimal comma when the input has
 * no dot ("3,5 * 2").
 */

const FUNCTIONS: Record<string, (x: number) => number> = {
	sqrt: Math.sqrt,
	raiz: Math.sqrt,
	abs: Math.abs,
	round: Math.round,
	floor: Math.floor,
	ceil: Math.ceil,
	exp: Math.exp,
	ln: Math.log,
	log: Math.log10,
	sin: Math.sin,
	cos: Math.cos,
	tan: Math.tan,
	asin: Math.asin,
	acos: Math.acos,
	atan: Math.atan
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, π: Math.PI, e: Math.E };

type Token =
	| { kind: "num"; value: number }
	| { kind: "id"; value: string }
	| { kind: "op"; value: string };

function tokenize(input: string): Token[] | null {
	const tokens: Token[] = [];
	let i = 0;
	while (i < input.length) {
		const c = input[i];
		if (/\s/.test(c)) {
			i++;
		} else if (/[0-9.]/.test(c)) {
			const match = input.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i);
			if (!match) return null;
			tokens.push({ kind: "num", value: Number(match[0]) });
			i += match[0].length;
		} else if (/[a-zπ]/i.test(c)) {
			const match = input.slice(i).match(/^[a-zπ]+/i)!;
			tokens.push({ kind: "id", value: match[0].toLowerCase() });
			i += match[0].length;
		} else if ("+-*/^%()×÷".includes(c)) {
			tokens.push({ kind: "op", value: c === "×" ? "*" : c === "÷" ? "/" : c });
			i++;
		} else {
			return null;
		}
	}
	return tokens;
}

class Parser {
	private pos = 0;
	constructor(private tokens: Token[]) {}

	parse(): number | null {
		const value = this.expr();
		return value !== null && this.pos === this.tokens.length ? value : null;
	}

	private peek(): Token | undefined {
		return this.tokens[this.pos];
	}

	private isOp(value: string): boolean {
		const t = this.peek();
		return t?.kind === "op" && t.value === value;
	}

	private expr(): number | null {
		let left = this.term();
		while (left !== null && (this.isOp("+") || this.isOp("-"))) {
			const op = (this.tokens[this.pos++] as { value: string }).value;
			const right = this.term();
			if (right === null) return null;
			left = op === "+" ? left + right : left - right;
		}
		return left;
	}

	private term(): number | null {
		let left = this.unary();
		while (left !== null) {
			if (this.isOp("*") || this.isOp("/")) {
				const op = (this.tokens[this.pos++] as { value: string }).value;
				const right = this.unary();
				if (right === null) return null;
				left = op === "*" ? left * right : left / right;
			} else if (this.peek()?.kind === "id" || this.isOp("(")) {
				// Implicit multiplication: "2pi", "3(4+1)".
				const right = this.unary();
				if (right === null) return null;
				left *= right;
			} else {
				break;
			}
		}
		return left;
	}

	private unary(): number | null {
		if (this.isOp("-")) {
			this.pos++;
			const value = this.unary();
			return value === null ? null : -value;
		}
		if (this.isOp("+")) {
			this.pos++;
			return this.unary();
		}
		return this.power();
	}

	private power(): number | null {
		const base = this.postfix();
		if (base === null) return null;
		if (this.isOp("^")) {
			this.pos++;
			const exponent = this.unary();
			return exponent === null ? null : Math.pow(base, exponent);
		}
		return base;
	}

	private postfix(): number | null {
		let value = this.primary();
		while (value !== null && this.isOp("%")) {
			this.pos++;
			value /= 100;
		}
		return value;
	}

	private primary(): number | null {
		const t = this.peek();
		if (!t) return null;
		if (t.kind === "num") {
			this.pos++;
			return t.value;
		}
		if (t.kind === "id") {
			this.pos++;
			if (t.value in CONSTANTS) return CONSTANTS[t.value];
			const fn = FUNCTIONS[t.value];
			if (!fn) return null;
			const arg = this.isOp("(") ? this.primary() : this.unary();
			return arg === null ? null : fn(arg);
		}
		if (t.value === "(") {
			this.pos++;
			const value = this.expr();
			if (value === null || !this.isOp(")")) return null;
			this.pos++;
			return value;
		}
		return null;
	}
}

/** Evaluates a math expression, or returns null when it isn't one. */
export function evaluate(raw: string): number | null {
	let input = raw.trim().toLowerCase().replace(/^=\s*/, "");
	if (!input) return null;
	if (input.includes(",") && !input.includes(".")) input = input.replace(/,/g, ".");
	// "20% de 80", "20% of 80".
	const percentOf = input.match(/^(.+?)%\s*(?:de|of)\s+(.+)$/);
	if (percentOf) {
		const share = evaluate(percentOf[1]);
		const whole = evaluate(percentOf[2]);
		return share === null || whole === null ? null : (share / 100) * whole;
	}
	const tokens = tokenize(input);
	if (!tokens || tokens.length === 0) return null;
	const value = new Parser(tokens).parse();
	return value !== null && Number.isFinite(value) ? value : null;
}

/**
 * Whether the input looks like something to calculate: a plain number or a
 * lone word ("e", "pi") would otherwise turn every search into a result.
 */
export function looksLikeMath(raw: string): boolean {
	const input = raw.trim().toLowerCase();
	if (!/\d|pi|π/.test(input)) return false;
	return /[+\-*/^%×÷()]|\b(de|of)\b|[a-z]+\s*\(/.test(input) || /^=/.test(input);
}
