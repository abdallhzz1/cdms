<?php

namespace Tests\Unit;

use App\Services\SecureFileUploadService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class SecureFileUploadServiceTest extends TestCase
{
    public function test_it_stores_a_valid_avatar_on_the_public_disk(): void
    {
        Storage::fake('public');
        $file = UploadedFile::fake()->image('avatar.jpg', 300, 300);

        $stored = app(SecureFileUploadService::class)->storeAvatar($file, 'avatars/test');

        Storage::disk('public')->assertExists($stored['path']);
        $this->assertSame('image/jpeg', $stored['mime_type']);
    }

    public function test_it_rejects_active_content_disguised_as_an_avatar(): void
    {
        Storage::fake('public');
        $file = UploadedFile::fake()->createWithContent(
            'avatar.jpg',
            '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        );

        $this->expectException(ValidationException::class);
        app(SecureFileUploadService::class)->storeAvatar($file, 'avatars/test');
    }

    public function test_it_stores_pdf_documents_privately(): void
    {
        Storage::fake('local');
        $pdf = UploadedFile::fake()->createWithContent(
            'evidence.pdf',
            "%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF"
        );

        $stored = app(SecureFileUploadService::class)->storeDocument($pdf, 'documents/test');

        Storage::disk('local')->assertExists($stored['storage_path']);
        $this->assertSame('application/pdf', $stored['mime_type']);
    }

    public function test_it_rejects_non_file_base64_payloads(): void
    {
        $payload = 'data:text/html;base64,'.base64_encode('<script>alert(1)</script>');

        $this->expectException(ValidationException::class);
        app(SecureFileUploadService::class)->storeDocument($payload, 'documents/test');
    }
}
