<?php

namespace App\Support;

class ArabicPdfText
{
    /** Arabic Presentation Forms: isolated, final, initial, medial. */
    private const FORMS = [
        'ء' => ['ﺀ', null, null, null], 'آ' => ['ﺁ', 'ﺂ', null, null], 'أ' => ['ﺃ', 'ﺄ', null, null],
        'ؤ' => ['ﺅ', 'ﺆ', null, null], 'إ' => ['ﺇ', 'ﺈ', null, null], 'ئ' => ['ﺉ', 'ﺊ', 'ﺋ', 'ﺌ'],
        'ا' => ['ﺍ', 'ﺎ', null, null], 'ب' => ['ﺏ', 'ﺐ', 'ﺑ', 'ﺒ'], 'ة' => ['ﺓ', 'ﺔ', null, null],
        'ت' => ['ﺕ', 'ﺖ', 'ﺗ', 'ﺘ'], 'ث' => ['ﺙ', 'ﺚ', 'ﺛ', 'ﺜ'], 'ج' => ['ﺝ', 'ﺞ', 'ﺟ', 'ﺠ'],
        'ح' => ['ﺡ', 'ﺢ', 'ﺣ', 'ﺤ'], 'خ' => ['ﺥ', 'ﺦ', 'ﺧ', 'ﺨ'], 'د' => ['ﺩ', 'ﺪ', null, null],
        'ذ' => ['ﺫ', 'ﺬ', null, null], 'ر' => ['ﺭ', 'ﺮ', null, null], 'ز' => ['ﺯ', 'ﺰ', null, null],
        'س' => ['ﺱ', 'ﺲ', 'ﺳ', 'ﺴ'], 'ش' => ['ﺵ', 'ﺶ', 'ﺷ', 'ﺸ'], 'ص' => ['ﺹ', 'ﺺ', 'ﺻ', 'ﺼ'],
        'ض' => ['ﺽ', 'ﺾ', 'ﺿ', 'ﻀ'], 'ط' => ['ﻁ', 'ﻂ', 'ﻃ', 'ﻄ'], 'ظ' => ['ﻅ', 'ﻆ', 'ﻇ', 'ﻈ'],
        'ع' => ['ﻉ', 'ﻊ', 'ﻋ', 'ﻌ'], 'غ' => ['ﻍ', 'ﻎ', 'ﻏ', 'ﻐ'], 'ف' => ['ﻑ', 'ﻒ', 'ﻓ', 'ﻔ'],
        'ق' => ['ﻕ', 'ﻖ', 'ﻗ', 'ﻘ'], 'ك' => ['ﻙ', 'ﻚ', 'ﻛ', 'ﻜ'], 'ل' => ['ﻝ', 'ﻞ', 'ﻟ', 'ﻠ'],
        'م' => ['ﻡ', 'ﻢ', 'ﻣ', 'ﻤ'], 'ن' => ['ﻥ', 'ﻦ', 'ﻧ', 'ﻨ'], 'ه' => ['ﻩ', 'ﻪ', 'ﻫ', 'ﻬ'],
        'و' => ['ﻭ', 'ﻮ', null, null], 'ى' => ['ﻯ', 'ﻰ', null, null], 'ي' => ['ﻱ', 'ﻲ', 'ﻳ', 'ﻴ'],
        'ی' => ['ﯼ', 'ﯽ', 'ﯾ', 'ﯿ'], 'ک' => ['ﮎ', 'ﮏ', 'ﮐ', 'ﮑ'],
    ];

    public static function visual(mixed $value): string
    {
        $text = (string) $value;
        if ($text === '' || !preg_match('/\p{Arabic}/u', $text)) {
            return $text;
        }

        $text = preg_replace('/[\x{064B}-\x{065F}\x{0670}\x{0640}]/u', '', $text) ?? $text;
        $protected = [];
        $text = preg_replace_callback('/[A-Za-z0-9][A-Za-z0-9_:\.\/%+\-]*/u', function (array $match) use (&$protected): string {
            $placeholder = mb_chr(0xE000 + count($protected));
            $protected[$placeholder] = $match[0];
            return $placeholder;
        }, $text) ?? $text;

        $characters = mb_str_split($text);
        $shaped = [];
        foreach ($characters as $index => $character) {
            if (!isset(self::FORMS[$character])) {
                $shaped[] = $character;
                continue;
            }

            $previous = $characters[$index - 1] ?? null;
            $next = $characters[$index + 1] ?? null;
            $forms = self::FORMS[$character];
            $connectsPrevious = $previous !== null
                && isset(self::FORMS[$previous])
                && $forms[1] !== null
                && self::FORMS[$previous][2] !== null;
            $connectsNext = $next !== null
                && isset(self::FORMS[$next])
                && $forms[2] !== null
                && self::FORMS[$next][1] !== null;

            $shaped[] = $connectsPrevious && $connectsNext ? $forms[3]
                : ($connectsPrevious ? $forms[1] : ($connectsNext ? $forms[2] : $forms[0]));
        }

        $visual = implode('', array_reverse($shaped));
        return strtr($visual, $protected);
    }
}
