<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use RuntimeException;
use Tests\TestCase;

class ApiExceptionHandlingTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Route::middleware('api')->get('/api/__test/internal-error', function () {
            throw new RuntimeException('SQLSTATE secret /srv/application/.env');
        });
    }

    public function test_internal_exception_details_are_hidden_even_when_debug_is_enabled(): void
    {
        config()->set('app.debug', true);

        $response = $this->getJson('/api/__test/internal-error')
            ->assertStatus(500)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'An unexpected error occurred. Please try again later.')
            ->assertJsonStructure(['meta' => ['reference_id']]);

        $body = $response->getContent();
        $this->assertStringNotContainsString('SQLSTATE', $body);
        $this->assertStringNotContainsString('.env', $body);
    }
}
