declare module "@lhncbc/ucum-lhc" {
  export interface UcumValidationResult {
    status: "valid" | "invalid" | "error";
    ucumCode: string | null;
    msg?: string[];
  }

  export interface UcumLhcUtilsInstance {
    validateUnitString(code: string, suggest?: boolean): UcumValidationResult;
  }

  export const UcumLhcUtils: {
    getInstance(): UcumLhcUtilsInstance;
  };
}
