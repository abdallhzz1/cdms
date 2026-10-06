import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  it("places role-scoped charts immediately after the welcome and removes the KPI cards", async () => {
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
          charts: [
            { key: 'attendance_status', type: 'donut', title_ar: 'حالات الحضور', title_en: 'Attendance status', items: [
              { label_ar: 'حاضر', label_en: 'Present', value: 10 },
              { label_ar: 'غائب', label_en: 'Absent', value: 2 },
            ] },
            { key: 'absence_trend', type: 'line', title_ar: 'اتجاه الغياب', title_en: 'Absence trend', items: [
              { label_ar: 'أيلول', label_en: 'September', value: 1 },
              { label_ar: 'تشرين الأول', label_en: 'October', value: 2 },
            ] },
            { key: 'students_by_level', type: 'bar', title_ar: 'الطلبة حسب الدفعة', title_en: 'Students by cohort', items: [
              { label_ar: 'الرابعة', label_en: 'Fourth year', value: 206 },
            ] },
            { key: 'grade_workflow', type: 'bar', title_ar: 'العلامات', title_en: 'Grades', items: [] },
          ],
          attention: [],
          activity: [],
          generated_at: "2026-09-13T10:00:00+03:00",
        });
      }
      throw new Error(`Unmocked request: ${url}`);
    });

    renderWithProviders(<FoundationHome />);

    const main = await screen.findByRole("main", { name: "Daily workspace" });
    expect(main).toBeVisible();
    expect(screen.queryByRole('navigation', { name: 'Quick access' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Key metrics' })).not.toBeInTheDocument();
    expect(within(main).getAllByRole('region').map((region) => region.getAttribute('aria-label'))).toEqual([
      'Dashboard charts', 'Needs your attention', 'Recent updates',
    ]);
    expect(screen.getByRole('region', { name: 'Needs your attention' })).toHaveTextContent('Nothing in your scope needs action right now.');
    expect(screen.getByRole('region', { name: 'Recent updates' })).toHaveTextContent('There are no recent updates in your scope.');
    const tabs = screen.getByRole('tablist', { name: 'Chart areas' });
    expect(within(tabs).getByRole('tab', { name: 'Attendance' })).toHaveAttribute('aria-selected', 'true');
    expect(within(tabs).queryByRole('tab', { name: 'Assessments and grades' })).not.toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: 'Attendance' })).toHaveTextContent('Attendance status');
    expect(screen.getByRole('tabpanel', { name: 'Attendance' })).toHaveTextContent('Absence trend');
    await userEvent.click(within(tabs).getByRole('tab', { name: 'Students and placements' }));
    expect(screen.getByRole('tabpanel', { name: 'Students and placements' })).toHaveTextContent('Students by cohort');
    expect(screen.queryByText('Absence trend')).not.toBeInTheDocument();
  });

  it('shows the administrative assistant only the chart areas present in their dashboard data', async () => {
    localStorage.setItem('cdms.locale', 'en');
    vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope({ id: 2, name: 'Assistant', roles: ['ADMIN_ASSISTANT', 'BASIC_ATTENDANCE_LECTURER'], permissions: [] });
      if (url.includes('/dashboard/overview')) return envelope({
        profile: { name: 'Assistant', focus: 'operations', roles: ['BASIC_ATTENDANCE_LECTURER', 'ADMIN_ASSISTANT'], assigned_levels: [], scope_student_count: 209 },
        metrics: [{ key: 'students_total', label_ar: 'الطلبة', label_en: 'Students', value: 209, unit: null, route: '/directory' }],
        charts: [
          { key: 'students_by_level', type: 'bar', title_ar: 'الدفعات', title_en: 'Students by cohort', items: [{ label_ar: 'الرابعة', label_en: 'Fourth year', value: 209 }] },
          { key: 'correspondence_status', type: 'donut', title_ar: 'المراسلات', title_en: 'Mail status', items: [{ label_ar: 'مرسل', label_en: 'Sent', value: 3 }] },
        ],
        attention: [{ key: 'minutes_pending', label_ar: 'محاضر بانتظار الاعتماد', label_en: 'Minutes awaiting approval', count: 1, route: '/meetings', severity: 'review' }],
        activity: [{ key: 'mail-1', type: 'correspondence', title: 'Clinical update', subtitle_ar: 'مراسلة', subtitle_en: 'Mail', at: '2026-10-06T09:00:00+03:00', route: '/inbox' }],
        generated_at: '2026-10-06T10:00:00+03:00',
      });
      throw new Error(`Unmocked request: ${url}`);
    });

    renderWithProviders(<FoundationHome />);
    expect(await screen.findByText('Administrative assistant')).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Students and placements' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Attendance' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Daily operations' }));
    expect(screen.getByRole('tabpanel', { name: 'Daily operations' })).toHaveTextContent('Mail status');
    expect(screen.getByRole('region', { name: 'Needs your attention' })).toHaveTextContent('Minutes awaiting approval');
    expect(screen.getByRole('region', { name: 'Recent updates' })).toHaveTextContent('Clinical update');
    expect(screen.getByRole('region', { name: 'Needs your attention' }).parentElement).toHaveClass('lg:grid-cols-2');
  });
});
