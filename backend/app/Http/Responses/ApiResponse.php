<?php

namespace App\Http\Responses;

use Illuminate\Http\JsonResponse;

/**
 * Single, reusable API response envelope.
 *
 * Every endpoint in every future module returns exactly one of these two
 * shapes — success() or error() — never a bespoke ad hoc structure
 * (PROJECT_RULES.md / Prompt 01 §6). Controllers should use this helper
 * rather than returning raw response()->json(...) arrays.
 */
class ApiResponse
{
    /**
     * @param  mixed  $data
     * @param  array<string, mixed>  $meta
     */
    public static function success(
        mixed $data = null,
        ?string $message = null,
        array $meta = [],
        int $status = 200,
    ): JsonResponse {
        return response()->json([
            'success' => true,
            'data' => $data,
            'message' => $message,
            'meta' => (object) $meta,
        ], $status);
    }

    /**
     * @param  array<string, mixed>  $errors
     * @param  array<string, mixed>  $meta
     */
    public static function error(
        string $message,
        array $errors = [],
        array $meta = [],
        int $status = 400,
    ): JsonResponse {
        return response()->json([
            'success' => false,
            'data' => null,
            'message' => $message,
            'errors' => (object) $errors,
            'meta' => (object) $meta,
        ], $status);
    }
}
