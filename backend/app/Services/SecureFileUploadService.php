<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class SecureFileUploadService
{
    private const AVATAR_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
    private const DOCUMENT_MIMES = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    public function storeAvatar(UploadedFile|string $source, string $directory): array
    {
        [$bytes, $mime, $extension] = $this->readAndValidate(
            $source,
            self::AVATAR_MIMES,
            2 * 1024 * 1024,
            'avatar'
        );

        $path = trim($directory, '/').'/'.Str::uuid().'.'.$extension;
        Storage::disk('public')->put($path, $bytes);

        return [
            'path' => $path,
            'url' => Storage::disk('public')->url($path),
            'mime_type' => $mime,
            'size_bytes' => strlen($bytes),
        ];
    }

    public function storeDocument(UploadedFile|string $source, string $directory): array
    {
        [$bytes, $mime, $extension] = $this->readAndValidate(
            $source,
            self::DOCUMENT_MIMES,
            10 * 1024 * 1024,
            'file'
        );

        $path = trim($directory, '/').'/'.Str::uuid().'.'.$extension;
        Storage::disk('local')->put($path, $bytes);

        return [
            'storage_path' => $path,
            'mime_type' => $mime,
            'file_type' => $extension,
            'size_bytes' => strlen($bytes),
        ];
    }

    private function readAndValidate(
        UploadedFile|string $source,
        array $allowedMimes,
        int $maxBytes,
        string $field
    ): array {
        if ($source instanceof UploadedFile) {
            if (!$source->isValid() || $source->getSize() > $maxBytes) {
                throw ValidationException::withMessages([$field => ['The uploaded file is invalid or too large.']]);
            }
            $bytes = file_get_contents($source->getRealPath());
        } else {
            if (!preg_match('#^data:([^;,]+);base64,(.+)$#s', $source, $matches)) {
                throw ValidationException::withMessages([$field => ['A valid base64 data URL is required.']]);
            }
            $bytes = base64_decode($matches[2], true);
            if ($bytes === false || strlen($bytes) > $maxBytes) {
                throw ValidationException::withMessages([$field => ['The encoded file is invalid or too large.']]);
            }
        }

        $detectedMime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
        if (!in_array($detectedMime, $allowedMimes, true)) {
            throw ValidationException::withMessages([$field => ['This file type is not allowed.']]);
        }

        return [$bytes, $detectedMime, $this->extensionForMime($detectedMime)];
    }

    private function extensionForMime(string $mime): string
    {
        return match ($mime) {
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            'application/pdf' => 'pdf',
            'application/msword' => 'doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
            'application/vnd.ms-excel' => 'xls',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
            default => throw ValidationException::withMessages(['file' => ['This file type is not allowed.']]),
        };
    }
}
