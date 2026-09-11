<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $domain = ltrim(trim((string) config('group_registration.student_email_domain', 'students.hebron.edu')), '@')
            ?: 'students.hebron.edu';

        DB::table('students')
            ->select(['id', 'university_number', 'university_email'])
            ->whereNotNull('university_email')
            ->orderBy('id')
            ->get()
            ->each(function (object $student) use ($domain): void {
                $stored = trim((string) $student->university_email);
                [$localPart, $storedDomain] = array_pad(explode('@', $stored, 2), 2, '');
                $expected = trim((string) $student->university_number).'@'.$domain;

                if (strcasecmp($storedDomain, $domain) !== 0
                    || ! ctype_digit($localPart)
                    || strcasecmp($stored, $expected) === 0
                    || DB::table('students')->where('id', '!=', $student->id)->whereRaw('LOWER(university_email) = ?', [strtolower($expected)])->exists()) {
                    return;
                }

                DB::table('students')->where('id', $student->id)->update([
                    'university_email' => $expected,
                    'updated_at' => now(),
                ]);
            });
    }

    public function down(): void
    {
        // The previous university number cannot be reconstructed safely.
    }
};
