import type * as XLSX from 'xlsx';

export type RosterStudent = { university_number: string; name: string; email: string; photo_url?: string };
export type RosterParseResult = { rows: RosterStudent[]; errors: string[] };

const headers = ['StudentNo', 'StudentName', 'Email'] as const;
const aliases: Record<string, string> = {
  universitynumber: 'university_number', studentno: 'university_number', 'الرقمالجامعي': 'university_number',
  name: 'name', studentname: 'name', 'الاسم': 'name',
  email: 'email', 'البريدالجامعي': 'email',
  photourl: 'photo_url', 'رابطالصورة': 'photo_url',
};

function headerKey(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase().replace(/[\s_-]+/g, '');
}

export function rosterTemplate(xlsx: typeof XLSX, locale: 'ar' | 'en'): Blob {
  const book = xlsx.utils.book_new();
  const sheet = xlsx.utils.aoa_to_sheet([[...headers]]);
  sheet['!cols'] = [{ wch: 23 }, { wch: 36 }, { wch: 38 }];
  // University numbers are identifiers, never numeric values to be rounded by Excel.
  for (let row = 2; row <= 2001; row++) {
    const address = `A${row}`;
    sheet[address] = { t: 's', v: '', z: '@' };
  }
  sheet['!ref'] = 'A1:C2001';
  xlsx.utils.book_append_sheet(book, sheet, 'Students');
  const instructions = locale === 'ar'
    ? [['تعليمات'], ['يمكنك رفع كشف الجامعة بأعمدة StudentNo وStudentName وEmail مباشرة، دون تعديل الملف.'], ['عند تعبئة هذا النموذج، استخدم ورقة Students فقط واترك عناوين الأعمدة كما هي.'], ['الرقم الجامعي: من 6 إلى 20 رقمًا. أبقِ العمود كنص إذا كان يبدأ بصفر.'], ['الاسم والبريد الجامعي المسجل مطلوبان.'], ['كل صف يمثل طالبًا واحدًا؛ لا تكرر الرقم أو البريد.'], ['راجع المعاينة قبل تأكيد الاستيراد.']]
    : [['Instructions'], ['Upload the university roster with StudentNo, StudentName and Email directly, without editing it.'], ['When filling this template, use only the Students sheet and keep the headers.'], ['University number: 6–20 digits. Keep it as text if it begins with zero.'], ['Name and registered university email are required.'], ['One student per row; do not duplicate a number or email.'], ['Review the preview before confirming import.']];
  const help = xlsx.utils.aoa_to_sheet(instructions);
  help['!cols'] = [{ wch: 85 }];
  xlsx.utils.book_append_sheet(book, help, locale === 'ar' ? 'تعليمات' : 'Instructions');
  return new Blob([xlsx.write(book, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function parseRoster(xlsx: typeof XLSX, input: ArrayBuffer, locale: 'ar' | 'en'): RosterParseResult {
  const ar = locale === 'ar';
  const book = xlsx.read(input, { type: 'array' });
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet) return { rows: [], errors: [ar ? 'الملف لا يحتوي ورقة طلبة.' : 'The file has no student sheet.'] };
  const grid = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true, blankrows: true });
  const names = (grid[0] ?? []).map(value => aliases[headerKey(value)] ?? '');
  const missing = ['university_number', 'name', 'email'].filter(name => !names.includes(name));
  if (missing.length) return { rows: [], errors: [ar ? `أعمدة ناقصة: ${missing.join(', ')}. نزّل النموذج ولا تغيّر عناوينه.` : `Missing columns: ${missing.join(', ')}. Download the template and keep its headers.`] };
  if (new Set(names.filter(Boolean)).size !== names.filter(Boolean).length) return { rows: [], errors: [ar ? 'أسماء أعمدة مكررة.' : 'Duplicate columns.'] };
  const rows: RosterStudent[] = [];
  const errors: string[] = [];
  const seenNumbers = new Set<string>();
  const seenEmails = new Set<string>();
  for (let index = 1; index < grid.length; index++) {
    const values = grid[index] ?? [];
    if (values.every(value => String(value ?? '').trim() === '')) continue;
    const entry = Object.fromEntries(names.map((name, column) => [name, String(values[column] ?? '').trim()]));
    const number = entry.university_number ?? '';
    const name = entry.name ?? '';
    const email = (entry.email ?? '').toLowerCase();
    const photo = entry.photo_url ?? '';
    const problems: string[] = [];
    const numberCell = values[names.indexOf('university_number')];
    if (typeof numberCell === 'number' && !Number.isSafeInteger(numberCell)) problems.push(ar ? 'الرقم الجامعي الطويل مخزن كرقم وقد يكون تغيّر؛ حوّل العمود إلى نص' : 'long university number was stored as a rounded number; format the column as text');
    if (!/^[0-9]{6,20}$/.test(number)) problems.push(ar ? 'الرقم الجامعي يجب أن يكون 6–20 رقمًا' : 'university number must be 6–20 digits');
    if (!name || name.length > 255) problems.push(ar ? 'الاسم مطلوب وبحد أقصى 255 حرفًا' : 'name is required (max 255 characters)');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) problems.push(ar ? 'البريد غير صالح' : 'invalid email');
    if (photo && (!/^https:\/\//i.test(photo) || photo.length > 1000)) problems.push(ar ? 'رابط الصورة يجب أن يبدأ بـ https://' : 'photo URL must start with https://');
    if (seenNumbers.has(number)) problems.push(ar ? 'رقم جامعي مكرر' : 'duplicate university number');
    if (seenEmails.has(email)) problems.push(ar ? 'بريد مكرر' : 'duplicate email');
    if (problems.length) errors.push(`${ar ? 'السطر' : 'Row'} ${index + 1}: ${problems.join('، ')}`);
    else rows.push({ university_number: number, name, email, ...(photo ? { photo_url: photo } : {}) });
    seenNumbers.add(number); seenEmails.add(email);
  }
  if (!rows.length && !errors.length) errors.push(ar ? 'الملف فارغ. أضف بيانات الطلبة تحت العناوين.' : 'The file is empty. Add students below the headers.');
  if (rows.length + errors.length > 2000) errors.push(ar ? 'الحد الأقصى 2000 طالب في الملف.' : 'Maximum 2000 students per file.');
  return { rows: errors.length ? [] : rows, errors };
}
