<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PublicProfileImageTest extends TestCase
{
    public function test_a_stored_profile_image_is_available_without_a_local_browser_cache_or_login(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('avatars/users/7/example.png', base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
        ));

        $response = $this->get('/api/v1/public/profile-images/avatars/users/7/example.png');

        $response->assertOk()
            ->assertHeader('Cache-Control', 'public, max-age=31536000, immutable')
            ->assertHeader('X-Content-Type-Options', 'nosniff');
    }

    public function test_other_public_storage_files_cannot_be_exposed_by_the_profile_image_route(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('documents/private.pdf', 'secret');

        $this->get('/api/v1/public/profile-images/documents/private.pdf')->assertNotFound();
    }
}
