import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "@/app/page";

describe("HomePage", () => {
  it("renderiza o título", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { name: "Finance Manager" })).toBeInTheDocument();
  });
});
