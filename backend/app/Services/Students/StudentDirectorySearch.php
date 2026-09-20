<?php

namespace App\Services\Students;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Str;

class StudentDirectorySearch
{
    public function apply(Builder $query, string $input): Builder
    {
        $search = $this->normalize($input);
        if ($search === '') {
            return $query;
        }

        $arabicName = $this->normalizedNameSql('students.full_name_ar');
        $englishName = $this->normalizedNameSql('students.full_name_en');
        $tokens = preg_split('/\s+/u', $search) ?: [];
        $numberPattern = '%'.$this->escapeLike($search).'%';

        $query->where(function (Builder $matching) use ($arabicName, $englishName, $tokens, $numberPattern, $search) {
            $matching->whereRaw("students.university_number LIKE ? ESCAPE '!'", [$numberPattern])
                ->orWhereRaw("students.university_email LIKE ? ESCAPE '!'", [$numberPattern])
                ->orWhere(function (Builder $names) use ($arabicName, $englishName, $tokens) {
                    foreach ($tokens as $token) {
                        $pattern = '%'.$this->escapeLike($token).'%';
                        $names->where(function (Builder $part) use ($arabicName, $englishName, $pattern) {
                            $part->whereRaw("$arabicName LIKE ? ESCAPE '!'", [$pattern])
                                ->orWhereRaw("$englishName LIKE ? ESCAPE '!'", [$pattern]);
                        });
                    }
                });
        });

        $prefix = $this->escapeLike($search).'%';
        return $query->orderByRaw(
            "CASE WHEN students.university_number = ? THEN 0
                WHEN $arabicName = ? OR $englishName = ? THEN 1
                WHEN $arabicName LIKE ? ESCAPE '!' OR $englishName LIKE ? ESCAPE '!' THEN 2
                WHEN students.university_number LIKE ? ESCAPE '!' THEN 3
                ELSE 4 END",
            [$search, $search, $search, $prefix, $prefix, $prefix]
        );
    }

    private function normalize(string $value): string
    {
        $value = Str::lower($value);
        $value = preg_replace('/[\x{064B}-\x{065F}\x{0670}\x{0640}]/u', '', $value) ?? $value;
        $value = str_replace(['أ', 'إ', 'آ', 'ٱ', 'ى', 'ة'], ['ا', 'ا', 'ا', 'ا', 'ي', 'ه'], $value);
        return trim(preg_replace('/\s+/u', ' ', $value) ?? $value);
    }

    private function normalizedNameSql(string $column): string
    {
        $expression = "LOWER(COALESCE($column, ''))";
        foreach (['َ', 'ً', 'ُ', 'ٌ', 'ِ', 'ٍ', 'ْ', 'ّ', 'ٰ', 'ـ'] as $mark) {
            $expression = "REPLACE($expression, '$mark', '')";
        }
        foreach (['أ' => 'ا', 'إ' => 'ا', 'آ' => 'ا', 'ٱ' => 'ا', 'ى' => 'ي', 'ة' => 'ه'] as $from => $to) {
            $expression = "REPLACE($expression, '$from', '$to')";
        }
        return $expression;
    }

    private function escapeLike(string $value): string
    {
        return str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $value);
    }
}
