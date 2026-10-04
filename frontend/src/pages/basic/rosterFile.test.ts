import { describe, expect, it } from 'vitest';
import * as xlsx from 'xlsx';
import { parseRoster, rosterTemplate } from './rosterFile';

function workbook(rows: unknown[][]): ArrayBuffer {
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, xlsx.utils.aoa_to_sheet(rows), 'Students');
  return xlsx.write(book, { type: 'array', bookType: 'xlsx' });
}

describe('basic attendance roster template and preview', () => {
  it('downloads a blank template with exact headers and instructions', async () => {
    const blob = rosterTemplate(xlsx, 'ar');
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
    const book = xlsx.read(buffer, { type: 'array' });
    expect(book.SheetNames).toEqual(['Students', 'تعليمات']);
    expect(xlsx.utils.sheet_to_json(book.Sheets.Students, { header: 1 })[0]).toEqual(['StudentNo', 'StudentName', 'Email']);
    expect(parseRoster(xlsx, buffer, 'ar').errors.length).toBeGreaterThan(0);
  });

  it('preserves text identifiers and accepts valid Arabic headers', () => {
    const result = parseRoster(xlsx, workbook([['الرقم الجامعي', 'الاسم', 'البريد الجامعي'], ['00123456', 'طالبة تجريبية', 'TEST@university.edu']]), 'ar');
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([{ university_number: '00123456', name: 'طالبة تجريبية', email: 'test@university.edu' }]);
  });

  it('imports an unmodified university-style roster with numeric StudentNo cells', () => {
    const result = parseRoster(xlsx, workbook([
      ['StudentNo', 'StudentName', 'Email'],
      [22410001, 'طالب تجريبي أول', '22410001@students.example.edu'],
      [22410002, 'طالبة تجريبية ثانية', '22410002@students.example.edu'],
    ]), 'ar');
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { university_number: '22410001', name: 'طالب تجريبي أول', email: '22410001@students.example.edu' },
      { university_number: '22410002', name: 'طالبة تجريبية ثانية', email: '22410002@students.example.edu' },
    ]);
  });

  it('still accepts the previous template including optional photo URLs', () => {
    const result = parseRoster(xlsx, workbook([
      ['university_number', 'name', 'email', 'photo_url'],
      ['00123456', 'Synthetic Student', 'student@example.edu', 'https://example.edu/photo.jpg'],
    ]), 'en');
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toEqual({ university_number: '00123456', name: 'Synthetic Student', email: 'student@example.edu', photo_url: 'https://example.edu/photo.jpg' });
  });

  it('shows row-level problems and blocks the whole import when data is invalid', () => {
    const result = parseRoster(xlsx, workbook([
      ['university_number', 'name', 'email', 'photo_url'],
      ['123456', 'Synthetic Student', 'student@example.edu', 'https://example.edu/p.jpg'],
      ['123456', 'Another Student', 'STUDENT@example.edu', 'http://bad.test/p.jpg'],
    ]), 'en');
    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Row 3');
    expect(result.errors[0]).toContain('duplicate university number');
    expect(result.errors[0]).toContain('duplicate email');
  });

  it('requires the template headers before previewing', () => {
    const result = parseRoster(xlsx, workbook([['Student Number', 'Full Name', 'Email'], ['123456', 'Test', 'student@example.edu']]), 'en');
    expect(result.rows).toEqual([]);
    expect(result.errors[0]).toContain('Missing columns');
  });
});
