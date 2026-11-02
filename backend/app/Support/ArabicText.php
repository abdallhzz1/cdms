<?php

namespace App\Support;

use Normalizer;

class ArabicText
{
    /**
     * Canonicalize Arabic text copied from legacy files and remove invisible
     * formatting controls that can split joining or reorder mixed-direction text.
     */
    public static function normalize(mixed $value): string
    {
        $text = (string) ($value ?? '');

        if (class_exists(Normalizer::class)) {
            $text = Normalizer::normalize($text, Normalizer::FORM_KC) ?: $text;
        }

        return preg_replace('/[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{206F}\x{FEFF}]/u', '', $text) ?? $text;
    }
}
