import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BasicMonthlyReportPanel, eligibleForWarning, warningTier, type MonthlyStudent } from './BasicMonthlyReportPanel';

const student = (id: number, absences = 0): MonthlyStudent => ({
  id, name: `Student ${id}`, university_number: `2600${String(id).padStart(3, '0')}`,
  email: `student${id}@example.edu`, photo_url: null, sessions: 3, present: 3 - absences,
  absent: absences, excused: 0, incomplete: 0, late: 0, total_absent: absences,
  is_enrolled: true, notifications: {},
});

beforeEach(() => localStorage.setItem('cdms.locale', 'en'));
afterEach(() => localStorage.removeItem('cdms.locale'));

it('shows a short paginated student list without KPI cards', async () => {
  const students = Array.from({ length: 25 }, (_, index) => student(index + 1));
  const view = render(<BasicMonthlyReportPanel summary={{ month: '2026-10', finalized_sessions: 3, students }} busy={false} canNotify={false} onWarn={vi.fn()} onBulk={vi.fn()} />);
  expect(view.container.querySelectorAll('.md\\:hidden details')).toHaveLength(12);
  expect(screen.queryByText('Finalized lectures')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  await userEvent.type(screen.getByRole('searchbox', { name: 'Search name or university number' }), 'Student 25');
  expect(view.container.querySelectorAll('.md\\:hidden details')).toHaveLength(1);
});

it('separates two-absence and three-absence actions and excludes sent or invalid email', async () => {
  const onBulk = vi.fn();
  const students = [student(1, 2), student(2, 3), student(3, 4), { ...student(4, 2), notifications: { '2': '2026-10-01' } }, { ...student(5, 3), email: 'invalid' }];
  expect(warningTier(students[0])).toBe(2);
  expect(warningTier(students[2])).toBe(3);
  expect(eligibleForWarning(students[4], 3)).toBe(false);
  const view = render(<BasicMonthlyReportPanel summary={{ month: '2026-10', finalized_sessions: 4, students }} busy={false} canNotify onWarn={vi.fn()} onBulk={onBulk} />);
  await userEvent.click(screen.getByRole('button', { name: 'Warn 1 students at 2 absences' }));
  expect(onBulk).toHaveBeenCalledWith(2, [students[0]]);
  await userEvent.click(screen.getByRole('button', { name: 'Request a meeting for 2 students at 3 absences' }));
  expect(onBulk).toHaveBeenCalledWith(3, [students[1], students[2]]);
  const rows = view.container.querySelectorAll('.md\\:hidden details');
  await userEvent.click(within(rows[1] as HTMLElement).getByText('Student 2'));
  expect(within(rows[1] as HTMLElement).getByRole('button', { name: 'Email meeting request' })).toBeInTheDocument();
});
