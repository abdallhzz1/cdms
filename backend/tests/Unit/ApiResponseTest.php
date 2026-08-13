<?php

namespace Tests\Unit;

use App\Http\Responses\ApiResponse;
use Tests\TestCase;

class ApiResponseTest extends TestCase
{
    public function test_success_envelope_shape(): void
    {
        $response = ApiResponse::success(['foo' => 'bar'], 'done', ['page' => 1]);
        $payload = json_decode($response->getContent(), true);

        $this->assertTrue($payload['success']);
        $this->assertSame(['foo' => 'bar'], $payload['data']);
        $this->assertSame('done', $payload['message']);
        $this->assertSame(['page' => 1], $payload['meta']);
        $this->assertSame(200, $response->getStatusCode());
    }

    public function test_error_envelope_shape(): void
    {
        $response = ApiResponse::error('Something went wrong', ['field' => ['required']], status: 422);
        $payload = json_decode($response->getContent(), true);

        $this->assertFalse($payload['success']);
        $this->assertNull($payload['data']);
        $this->assertSame('Something went wrong', $payload['message']);
        $this->assertSame(['field' => ['required']], $payload['errors']);
        $this->assertSame(422, $response->getStatusCode());
    }
}
