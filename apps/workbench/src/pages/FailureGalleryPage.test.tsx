import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { FailureGalleryPage } from "./FailureGalleryPage.js";

describe("FailureGalleryPage", () => {
  it("renders all Phase A safety cases", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <FailureGalleryPage />
      </MemoryRouter>,
    );

    expect(html).toMatch(/no-allergy-data is missing data/i);
    expect(html).toMatch(/missing labs produces cannot-determine/i);
    expect(html).toMatch(/prompt injection from resource text is ignored/i);
    expect(html).toMatch(/unauthorized patient tool calls are denied/i);
  });
});
