import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ColumnPicker } from "./ColumnPicker.js";

const options = [
  { path: "name", label: "Name" },
  { path: "gender", label: "Gender" },
  { path: "birthDate", label: "Birth Date" },
];

describe("ColumnPicker", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("opens a panel listing every column when the trigger is clicked", async () => {
    const user = userEvent.setup();
    render(<ColumnPicker options={options} onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: /columns/i }));
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Gender")).toBeInTheDocument();
    expect(screen.getByLabelText("Birth Date")).toBeInTheDocument();
  });

  it("toggling a checkbox emits the new selection (uncontrolled, preserving option order)", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ColumnPicker options={options} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /columns/i }));

    await user.click(screen.getByLabelText("Gender"));
    expect(onChange).toHaveBeenLastCalledWith(["name", "birthDate"]);

    await user.click(screen.getByLabelText("Gender"));
    expect(onChange).toHaveBeenLastCalledWith(["name", "gender", "birthDate"]);
  });

  it("persists the selection to localStorage when storageKey is set", async () => {
    const user = userEvent.setup();
    render(
      <ColumnPicker
        options={options}
        onChange={() => {}}
        storageKey="patients-columns"
      />,
    );
    await user.click(screen.getByRole("button", { name: /columns/i }));
    await user.click(screen.getByLabelText("Birth Date"));

    expect(JSON.parse(window.localStorage.getItem("patients-columns")!)).toEqual([
      "name",
      "gender",
    ]);
  });

  it("rehydrates the selection from localStorage on mount", async () => {
    window.localStorage.setItem(
      "patients-columns",
      JSON.stringify(["gender"]),
    );
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ColumnPicker
        options={options}
        onChange={onChange}
        storageKey="patients-columns"
      />,
    );
    await user.click(screen.getByRole("button", { name: /columns/i }));
    expect((screen.getByLabelText("Gender") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Name") as HTMLInputElement).checked).toBe(false);
  });

  it("ignores persisted entries that no longer exist in options", async () => {
    window.localStorage.setItem(
      "patients-columns",
      JSON.stringify(["gender", "deletedField"]),
    );
    const user = userEvent.setup();
    render(
      <ColumnPicker
        options={options}
        onChange={() => {}}
        storageKey="patients-columns"
      />,
    );
    await user.click(screen.getByRole("button", { name: /columns/i }));
    expect((screen.getByLabelText("Gender") as HTMLInputElement).checked).toBe(true);
  });

  it("Esc closes the open panel", async () => {
    const user = userEvent.setup();
    render(<ColumnPicker options={options} onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: /columns/i }));
    expect(screen.getByRole("group", { name: /visible columns/i })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: /visible columns/i })).not.toBeInTheDocument();
  });

  it("ArrowDown / ArrowUp move focus between checkboxes", async () => {
    const user = userEvent.setup();
    render(<ColumnPicker options={options} onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: /columns/i }));

    const name = screen.getByLabelText("Name") as HTMLInputElement;
    name.focus();

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByLabelText("Gender"));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByLabelText("Birth Date"));
    await user.keyboard("{ArrowDown}");
    // Wraps back to Name
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(screen.getByLabelText("Birth Date"));
  });

  it("syncs the parent with its initial selection on mount (no localStorage)", () => {
    const onChange = vi.fn();
    render(
      <ColumnPicker
        options={options}
        defaultSelected={["name", "gender"]}
        onChange={onChange}
        storageKey="patients-columns"
      />,
    );
    expect(onChange).toHaveBeenCalledWith(["name", "gender"]);
  });

  it("syncs the parent with the persisted selection on mount", () => {
    window.localStorage.setItem(
      "patients-columns",
      JSON.stringify(["birthDate"]),
    );
    const onChange = vi.fn();
    render(
      <ColumnPicker
        options={options}
        defaultSelected={["name", "gender"]}
        onChange={onChange}
        storageKey="patients-columns"
      />,
    );
    expect(onChange).toHaveBeenCalledWith(["birthDate"]);
  });

  it("renders a search input once the picker has more than 10 options", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      path: `field${i}`,
      label: i === 0 ? "Marital Status" : i === 1 ? "General Practitioner" : `Field ${i}`,
    }));
    const user = userEvent.setup();
    render(<ColumnPicker options={many} onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: /columns/i }));

    const search = screen.getByRole("searchbox");
    expect(search).toBeInTheDocument();
    // Auto-focused on open.
    expect(document.activeElement).toBe(search);
  });

  it("filters the option list by case-insensitive substring on label or path", async () => {
    const many = [
      { path: "name", label: "Name" },
      { path: "gender", label: "Gender" },
      { path: "maritalStatus", label: "Marital Status" },
      { path: "generalPractitioner", label: "General Practitioner" },
      { path: "deceasedBoolean", label: "Deceased" },
      { path: "address.city", label: "City" },
      { path: "address.state", label: "State" },
      { path: "address.postalCode", label: "Postal Code" },
      { path: "telecom", label: "Telecom" },
      { path: "identifier", label: "Identifier" },
      { path: "birthDate", label: "Birth Date" },
      { path: "active", label: "Active" },
    ];
    const user = userEvent.setup();
    render(<ColumnPicker options={many} onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: /columns/i }));

    const search = screen.getByRole("searchbox");
    await user.type(search, "marit");

    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Marital Status")).toBeInTheDocument();
    // Path-substring match: typing the JSON-key prefix should also hit.
    await user.clear(search);
    await user.type(search, "address");
    expect(screen.getByLabelText("City")).toBeInTheDocument();
    expect(screen.getByLabelText("State")).toBeInTheDocument();
    expect(screen.queryByLabelText("Telecom")).not.toBeInTheDocument();
  });

  it("shows a 'no matches' hint when the filter has zero hits", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      path: `field${i}`,
      label: `Field ${i}`,
    }));
    const user = userEvent.setup();
    render(<ColumnPicker options={many} onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: /columns/i }));
    await user.type(screen.getByRole("searchbox"), "xyzzy");
    expect(screen.getByTestId("column-picker-empty")).toBeInTheDocument();
  });

  it("resets the filter when the panel closes", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      path: `field${i}`,
      label: `Field ${i}`,
    }));
    const user = userEvent.setup();
    render(<ColumnPicker options={many} onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: /columns/i }));
    await user.type(screen.getByRole("searchbox"), "Field 1");
    expect(screen.queryByLabelText("Field 2")).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    // Reopen — the filter should be cleared.
    await user.click(screen.getByRole("button", { name: /columns/i }));
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
    expect(screen.getByLabelText("Field 2")).toBeInTheDocument();
  });

  it("ArrowDown from the search input jumps focus to the first filtered checkbox", async () => {
    const many = [
      { path: "name", label: "Name" },
      { path: "gender", label: "Gender" },
      { path: "maritalStatus", label: "Marital Status" },
      { path: "generalPractitioner", label: "General Practitioner" },
      { path: "deceasedBoolean", label: "Deceased" },
      { path: "address.city", label: "City" },
      { path: "address.state", label: "State" },
      { path: "telecom", label: "Telecom" },
      { path: "identifier", label: "Identifier" },
      { path: "birthDate", label: "Birth Date" },
      { path: "active", label: "Active" },
      { path: "language", label: "Language" },
    ];
    const user = userEvent.setup();
    render(<ColumnPicker options={many} onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: /columns/i }));
    await user.type(screen.getByRole("searchbox"), "marit");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByLabelText("Marital Status"));
  });

  it("toggling a checkbox while the filter is active does not re-include filtered-out paths", async () => {
    const onChange = vi.fn();
    const many = [
      { path: "name", label: "Name" },
      { path: "gender", label: "Gender" },
      { path: "maritalStatus", label: "Marital Status" },
      { path: "generalPractitioner", label: "General Practitioner" },
      { path: "deceasedBoolean", label: "Deceased" },
      { path: "address.city", label: "City" },
      { path: "address.state", label: "State" },
      { path: "telecom", label: "Telecom" },
      { path: "identifier", label: "Identifier" },
      { path: "birthDate", label: "Birth Date" },
      { path: "active", label: "Active" },
      { path: "language", label: "Language" },
    ];
    const user = userEvent.setup();
    render(
      <ColumnPicker
        options={many}
        defaultSelected={["name"]}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: /columns/i }));
    await user.type(screen.getByRole("searchbox"), "marit");
    await user.click(screen.getByLabelText("Marital Status"));
    // "Marital Status" is added; the prior single selection ("name") is preserved
    // even though it's currently filtered out of the visible list.
    expect(onChange).toHaveBeenLastCalledWith(["name", "maritalStatus"]);
  });

  it("respects `searchable: false` even when there are many options", async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      path: `field${i}`,
      label: `Field ${i}`,
    }));
    const user = userEvent.setup();
    render(<ColumnPicker options={many} onChange={() => {}} searchable={false} />);
    await user.click(screen.getByRole("button", { name: /columns/i }));
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("panel has data-testid column-picker-panel when open", async () => {
    const user = userEvent.setup();
    render(<ColumnPicker options={options} onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: /columns/i }));
    expect(screen.getByTestId("column-picker-panel")).toBeInTheDocument();
  });

  it("applies a positive translateX when the panel's left edge is inside the viewport left boundary", async () => {
    // Simulate mobile: panel renders with left edge at -8px (clipped 8px off-screen).
    // The layout effect should compute a shift of 8 + 8 = 16px to bring it to ≥ 8px.
    const user = userEvent.setup();
    render(<ColumnPicker options={options} onChange={() => {}} />);

    const panel = () => screen.queryByTestId("column-picker-panel");

    // Mock getBoundingClientRect on the panel element to simulate a left-clipped position.
    // We spy before the click so the ref is populated after the panel mounts.
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      if ((this as HTMLElement).dataset.testid === "column-picker-panel") {
        return { left: -8, right: 216, top: 40, bottom: 304, width: 224, height: 264, x: -8, y: 40, toJSON: () => ({}) };
      }
      return originalGetBoundingClientRect.call(this);
    };

    await user.click(screen.getByRole("button", { name: /columns/i }));

    // After open, useLayoutEffect fires and sets panelShift = 8 + 8 = 16.
    expect(panel()).toBeInTheDocument();
    expect(panel()?.style.transform).toBe("translateX(16px)");

    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  it("does not apply a translateX when the panel is already fully within the viewport", async () => {
    const user = userEvent.setup();
    render(<ColumnPicker options={options} onChange={() => {}} />);

    // Simulate desktop: panel renders well inside the viewport (left = 900px).
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      if ((this as HTMLElement).dataset.testid === "column-picker-panel") {
        return { left: 900, right: 1124, top: 40, bottom: 304, width: 224, height: 264, x: 900, y: 40, toJSON: () => ({}) };
      }
      return originalGetBoundingClientRect.call(this);
    };

    await user.click(screen.getByRole("button", { name: /columns/i }));
    const panel = screen.getByTestId("column-picker-panel");
    // No transform is applied when left edge is well inside the viewport.
    expect(panel.style.transform).toBeFalsy();

    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  it("respects the controlled `selected` prop", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <ColumnPicker options={options} selected={["name"]} onChange={onChange} />,
    );
    await user.click(screen.getByRole("button", { name: /columns/i }));
    expect((screen.getByLabelText("Name") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Gender") as HTMLInputElement).checked).toBe(false);

    await user.click(screen.getByLabelText("Gender"));
    expect(onChange).toHaveBeenCalledWith(["name", "gender"]);

    // Until the parent re-renders with the new `selected`, the displayed
    // selection still reflects the prop.
    expect((screen.getByLabelText("Gender") as HTMLInputElement).checked).toBe(false);

    rerender(
      <ColumnPicker options={options} selected={["name", "gender"]} onChange={onChange} />,
    );
    expect((screen.getByLabelText("Gender") as HTMLInputElement).checked).toBe(true);
  });
});
