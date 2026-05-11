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
