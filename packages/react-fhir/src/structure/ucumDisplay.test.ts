import { describe, expect, it } from "vitest";
import { ucumDisplay } from "./ucumDisplay.js";

describe("ucumDisplay", () => {
  it("decodes mapped clinical codes", () => {
    expect(ucumDisplay("mm[Hg]")).toBe("mmHg");
    expect(ucumDisplay("Cel")).toBe("°C");
    expect(ucumDisplay("[degF]")).toBe("°F");
    expect(ucumDisplay("[lb_av]")).toBe("lb");
    expect(ucumDisplay("meq/L")).toBe("mEq/L");
  });

  it("superscripts UCUM exponent notation", () => {
    expect(ucumDisplay("10*9/L")).toBe("10⁹/L");
    expect(ucumDisplay("10*12/L")).toBe("10¹²/L");
    expect(ucumDisplay("10*3/uL")).toBe("10³/µL");
  });

  it("decodes the micro prefix", () => {
    expect(ucumDisplay("ug/dL")).toBe("µg/dL");
    expect(ucumDisplay("umol/L")).toBe("µmol/L");
    expect(ucumDisplay("uIU/mL")).toBe("µIU/mL");
  });

  it("leaves unknown and already-plain codes untouched", () => {
    expect(ucumDisplay("mg/dL")).toBe("mg/dL");
    expect(ucumDisplay("%")).toBe("%");
    expect(ucumDisplay("mmol/L")).toBe("mmol/L");
    // 'u' not acting as a prefix (no letter after / at start) stays put
    expect(ucumDisplay("U/L")).toBe("U/L");
  });

  it("returns empty string only for empty input", () => {
    expect(ucumDisplay(undefined)).toBe("");
    expect(ucumDisplay("")).toBe("");
  });
});
