<?php

namespace App\Support;

class SafeMailHtml
{
    private const ALLOWED_TAGS = '<p><br><div><strong><b><em><i><u><ol><ul><li><blockquote><a>';

    public static function clean(?string $html): ?string
    {
        if ($html === null) {
            return null;
        }

        $clean = strip_tags($html, self::ALLOWED_TAGS);
        $clean = preg_replace('/\s+on[a-z]+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $clean) ?? '';
        $clean = preg_replace('/\s+(style|class|id)\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $clean) ?? '';
        $clean = preg_replace_callback('/<a\s+([^>]*)>/i', function (array $matches): string {
            if (! preg_match('/href\s*=\s*(["\'])(.*?)\1/i', $matches[1], $href)) {
                return '<a>';
            }
            $url = trim(html_entity_decode($href[2], ENT_QUOTES | ENT_HTML5, 'UTF-8'));
            if (! preg_match('#^(https?://|mailto:)#i', $url)) {
                return '<a>';
            }

            return '<a href="'.htmlspecialchars($url, ENT_QUOTES, 'UTF-8').'" target="_blank" rel="noopener noreferrer">';
        }, $clean) ?? '';

        return trim($clean);
    }
}
