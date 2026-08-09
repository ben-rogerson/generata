// Parsing for the money/percent strings Simply Wall St renders.
// The UI abbreviates aggressively ("AU$1.2k", "US$3.4m", "12.3%"), so every
// parsed Amount carries a `precision`: the absolute uncertainty introduced by
// display rounding (half the unit of the last rendered digit). Comparisons
// must honour it — "1.2k" can legitimately mean anything in [1150, 1250).

export interface Amount {
  value: number;
  /** Absolute uncertainty from display rounding. */
  precision: number;
}

const SUFFIX_MULTIPLIERS: Record<string, number> = {
  k: 1e3,
  m: 1e6,
  b: 1e9,
  t: 1e12,
};

const MONEY_RE = /^(-)?(?:[A-Z]{1,3}\$?|[$€£¥₹])?\s*(-)?([\d,]+(?:\.\d+)?)\s*([kmbt])?$/i;

/**
 * Parse a rendered money string, e.g. "AU$1.2k", "$1,234.56", "-US$3.4m",
 * "(AU$500)". Returns null when the text isn't a money value.
 */
export function parseMoney(text: string): Amount | null {
  let cleaned = text.trim();
  let negative = false;
  const parens = /^\((.*)\)$/.exec(cleaned);
  if (parens?.[1] !== undefined) {
    negative = true;
    cleaned = parens[1].trim();
  }
  const match = MONEY_RE.exec(cleaned);
  if (!match) return null;
  const [, sign1, sign2, digits, suffix] = match;
  if (sign1 || sign2) negative = true;
  if (digits === undefined) return null;
  const multiplier = suffix ? (SUFFIX_MULTIPLIERS[suffix.toLowerCase()] ?? 1) : 1;
  const bare = digits.replaceAll(",", "");
  const decimals = bare.includes(".") ? bare.split(".")[1]!.length : 0;
  const value = Number(bare) * multiplier * (negative ? -1 : 1);
  if (!Number.isFinite(value)) return null;
  const precision = (10 ** -decimals / 2) * multiplier;
  return { value, precision };
}

/** Parse a rendered percentage, e.g. "12.3%", "-0.5%", "+8%". */
export function parsePercent(text: string): Amount | null {
  const match = /^([+-])?\s*([\d,]+(?:\.\d+)?)\s*%$/.exec(text.trim());
  if (!match) return null;
  const [, sign, digits] = match;
  if (digits === undefined) return null;
  const bare = digits.replaceAll(",", "");
  const decimals = bare.includes(".") ? bare.split(".")[1]!.length : 0;
  const value = Number(bare) * (sign === "-" ? -1 : 1);
  if (!Number.isFinite(value)) return null;
  return { value, precision: 10 ** -decimals / 2 };
}

/** An exact number treated as an Amount with zero rounding uncertainty. */
export function exact(value: number): Amount {
  return { value, precision: 0 };
}

/**
 * True when two amounts agree within their combined display-rounding
 * precision plus a relative tolerance (percent of the larger magnitude).
 */
export function amountsAgree(a: Amount, b: Amount, relTolerancePct: number): boolean {
  const slack =
    a.precision +
    b.precision +
    (relTolerancePct / 100) * Math.max(Math.abs(a.value), Math.abs(b.value));
  return Math.abs(a.value - b.value) <= slack;
}

/** Sum amounts, accumulating rounding uncertainty. */
export function sumAmounts(amounts: Amount[]): Amount {
  return amounts.reduce(
    (acc, a) => ({ value: acc.value + a.value, precision: acc.precision + a.precision }),
    exact(0),
  );
}

export function formatAmount(a: Amount): string {
  const rounded = Math.abs(a.value) >= 100 ? a.value.toFixed(0) : a.value.toFixed(2);
  return a.precision > 0 ? `${rounded} (±${a.precision})` : rounded;
}
