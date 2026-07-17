/**
 * Human-readable display forms for common UCUM codes (#368).
 *
 * UCUM's canonical symbols are ASCII-only and often unfamiliar on screen
 * (`mm[Hg]`, `10*9/L`, `ug/dL`, `Cel`). This decodes the codes that show up
 * constantly in lab results and vitals into the form a clinician expects,
 * while callers keep the canonical code for the wire. Codes without a known
 * decoding fall back to two generic rules (exponents and the `u` → `µ`
 * micro prefix) and finally to the raw code — never to an empty string.
 */

const UCUM_DISPLAY: Record<string, string> = {
  "mm[Hg]": "mmHg",
  Cel: "°C",
  "[degF]": "°F",
  "[lb_av]": "lb",
  "[oz_av]": "oz",
  "[in_i]": "in",
  "[ft_i]": "ft",
  "[drp]": "drops",
  "{score}": "score",
  "meq/L": "mEq/L",
  "mosm/kg": "mOsm/kg",
};

/** `10*9/L` → `10⁹/L` (UCUM uses `*` for exponentiation, not `^`). */
const SUPERSCRIPTS: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
};

const decodeExponents = (code: string): string =>
  code.replace(/10\*(\d+)/g, (_m, digits: string) =>
    `10${digits.replace(/\d/g, (d) => SUPERSCRIPTS[d] ?? d)}`,
  );

/** `ug/dL` → `µg/dL`, `umol/L` → `µmol/L`, `uIU/mL` → `µIU/mL`. */
const decodeMicro = (code: string): string =>
  code.replace(/(^|\/)u(?=[a-zA-Z])/g, "$1µ");

/**
 * Best-effort display form for a UCUM code. Returns the input unchanged
 * when no decoding applies; returns "" only for empty input.
 */
export function ucumDisplay(code: string | undefined): string {
  if (!code) return "";
  const mapped = UCUM_DISPLAY[code];
  if (mapped) return mapped;
  return decodeMicro(decodeExponents(code));
}
