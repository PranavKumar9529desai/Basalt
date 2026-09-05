/**
 * when-parser — compiles `when` clauses into plain evaluator closures.
 *
 * Grammar (a small, typed-value subset of VS Code's when language):
 *
 *   expression ::= or
 *   or         ::= and { '||' and }*
 *   and        ::= term { '&&' term }*
 *   term       ::= '!' term | primary
 *   primary    ::= '(' expression ')' | comparison
 *   comparison ::= key | key '==' value | key '!=' value
 *   value      ::= QUOTED_STRING | NUMBER | 'true' | 'false' | word
 *   key        ::= [A-Za-z0-9_.-]+
 *
 * Bare keys are boolean tests (`editorFocused` ⇔ `context.editorFocused` is
 * true). `==`/`!=` compare against a typed value so a string context can be
 * matched (`viewMode == 'reading'`). Parsing happens once per binding at
 * rebuild; the returned closure is evaluated per keypress.
 *
 * `parseWhen` returns `null` on any syntax error — the caller treats a
 * broken clause as "never match" (safe: it can't fire unexpectedly).
 */
import type { WhenContext } from "./types";

export type WhenEvaluator = (ctx: WhenContext) => boolean;

type Token =
  | { type: "ident" | "string"; value: string }
  | {
      type: "lparen" | "rparen" | "not" | "and" | "or" | "eq" | "neq";
    };

const KEY_CHARS = /[A-Za-z0-9_.-]/;

function tokenize(source: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen" });
      i++;
      continue;
    }
    if (ch === "!") {
      if (source[i + 1] === "=") {
        tokens.push({ type: "neq" });
        i += 2;
        continue;
      }
      tokens.push({ type: "not" });
      i++;
      continue;
    }
    if (ch === "&") {
      if (source[i + 1] === "&") {
        tokens.push({ type: "and" });
        i += 2;
        continue;
      }
      return null;
    }
    if (ch === "|") {
      if (source[i + 1] === "|") {
        tokens.push({ type: "or" });
        i += 2;
        continue;
      }
      return null;
    }
    if (ch === "=") {
      if (source[i + 1] === "=") {
        tokens.push({ type: "eq" });
        i += 2;
        continue;
      }
      return null;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      let value = "";
      while (j < source.length && source[j] !== quote) {
        if (source[j] === "\\" && j + 1 < source.length) {
          value += source[j + 1];
          j += 2;
          continue;
        }
        value += source[j];
        j++;
      }
      if (source[j] !== quote) return null;
      tokens.push({ type: "string", value });
      i = j + 1;
      continue;
    }
    if (KEY_CHARS.test(ch)) {
      let j = i;
      let value = "";
      while (j < source.length && KEY_CHARS.test(source[j])) {
        value += source[j];
        j++;
      }
      tokens.push({ type: "ident", value });
      i = j;
      continue;
    }
    return null;
  }
  return tokens;
}

interface Parser {
  tokens: Token[];
  pos: number;
}

function peek(p: Parser): Token | undefined {
  return p.tokens[p.pos];
}

function consume(p: Parser, type?: Token["type"]): Token | undefined {
  const token = p.tokens[p.pos];
  if (!token) throw new Error("unexpected end of when clause");
  if (type && token.type !== type) throw new Error(`expected "${type}"`);
  p.pos++;
  return token;
}

function coerceValue(token: Token): string | number | boolean {
  if (token.type === "string") return token.value;
  if (token.type === "ident") {
    if (token.value === "true") return true;
    if (token.value === "false") return false;
    if (/^-?\d+(\.\d+)?$/.test(token.value)) return Number(token.value);
    return token.value;
  }
  throw new Error(`expected a value, got "${token.type}"`);
}

function matchesValue(
  ctxValue: WhenContext[string] | undefined,
  expected: string | number | boolean,
): boolean {
  if (ctxValue === undefined || ctxValue === null) return false;
  if (typeof ctxValue === "boolean") {
    if (typeof expected === "boolean") return ctxValue === expected;
    if (expected === "true") return ctxValue === true;
    if (expected === "false") return ctxValue === false;
    return false;
  }
  return ctxValue === expected;
}

function parseComparison(p: Parser): WhenEvaluator {
  const keyToken = consume(p, "ident");
  if (!keyToken || keyToken.type !== "ident") {
    throw new Error("expected a context key");
  }
  const op = peek(p);

  if (op && (op.type === "eq" || op.type === "neq")) {
    consume(p, op.type);
    const valueToken = peek(p);
    if (!valueToken || (valueToken.type !== "ident" && valueToken.type !== "string")) {
      throw new Error("expected value after comparison operator");
    }
    consume(p);
    const expected = coerceValue(valueToken);
    return (ctx) => {
      const ok = matchesValue(ctx[keyToken.value], expected);
      return op.type === "eq" ? ok : !ok;
    };
  }

  return (ctx) => ctx[keyToken.value] === true;
}

function parsePrimary(p: Parser): WhenEvaluator {
  const token = peek(p);
  if (!token) throw new Error("expected expression");

  if (token.type === "lparen") {
    consume(p, "lparen");
    const inner = parseOr(p);
    consume(p, "rparen");
    return inner;
  }

  return parseComparison(p);
}

function parseUnary(p: Parser): WhenEvaluator {
  if (peek(p)?.type === "not") {
    consume(p, "not");
    const inner = parseUnary(p);
    return (ctx) => !inner(ctx);
  }
  return parsePrimary(p);
}

function parseAnd(p: Parser): WhenEvaluator {
  let left = parseUnary(p);
  while (peek(p)?.type === "and") {
    consume(p, "and");
    const right = parseUnary(p);
    const lhs = left;
    left = (ctx) => lhs(ctx) && right(ctx);
  }
  return left;
}

function parseOr(p: Parser): WhenEvaluator {
  let left = parseAnd(p);
  while (peek(p)?.type === "or") {
    consume(p, "or");
    const right = parseAnd(p);
    const lhs = left;
    left = (ctx) => lhs(ctx) || right(ctx);
  }
  return left;
}

/**
 * Compile a `when` clause string into an evaluator closure.
 * Returns `null` for an empty clause (callers treat it as unconditional)
 * or for a syntax error (callers treat it as never-matching).
 */
export function parseWhen(source: string): WhenEvaluator | null {
  if (!source.trim()) return null;
  const tokens = tokenize(source);
  if (!tokens || tokens.length === 0) return null;

  const parser: Parser = { tokens, pos: 0 };
  try {
    const evaluator = parseOr(parser);
    if (parser.pos !== tokens.length) return null;
    return evaluator;
  } catch {
    return null;
  }
}