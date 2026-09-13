import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/renderWithProviders";
import { FoundationHome } from "./FoundationHome";

const envelope = (data: unknown) =>
  new Response(
    JSON.stringify({ success: true, data, message: null, meta: {} }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem("cdms.locale");
});

describe("FoundationHome", () => {
  it("presents the daily overview and role shortcuts as clear landmarks", async () => {
    localStorage.setItem("cdms.locale", "en");
    vi.spyOn(window, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/auth/me")) {
        return envelope({
          id: 1,
          name: "Test Director",
          email: "director@hebron.edu",
          roles: ["CLINICAL_DIRECTOR"],
          assigned_levels: [],
          permissions: [
            { code: "distribution.view", scope: "global" },
            { code: "clinical_schedule.view", scope: "global" },
          ],
        });
      }
      if (url.includes("/dashboard/overview")) {
        return envelope({
          profile: {
            name: "Test Director",
            focus: "clinical_leadership",
            roles: ["CLINICAL_DIRECTOR"],
            assigned_levels: [],
            scope_student_count: 206,
          },
          metrics: [
            {
              key: "students_total",
              label_ar: "الطلبة ضمن نطاقك",
              label_en: "Students in scope",
              value: 206,
              unit: null,
              route: "/directory",
            },
          ],
          attention: [],
          activity: [],
          generated_at: "2026-09-13T10:00:00+03:00",
        });
      }
      throw new Error(`Unmocked request: ${url}`);
    });

    renderWithProviders(<FoundationHome />);

    expect(
      await screen.findByRole("main", { name: "Daily workspace" }),
    ).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: "Quick access" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Needs your attention" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Recent updates" }),
    ).toBeVisible();
  });
});
