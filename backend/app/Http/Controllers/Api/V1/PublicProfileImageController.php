<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class PublicProfileImageController extends Controller
{
    public function __invoke(string $path): BinaryFileResponse|Response
    {
        $path = trim(rawurldecode($path), '/');
        $allowedDirectory = str_starts_with($path, 'avatars/')
            || str_starts_with($path, 'student-profile-photos/');

        if (! $allowedDirectory || str_contains($path, '..') || ! Storage::disk('public')->exists($path)) {
            abort(404);
        }

        return response()->file(Storage::disk('public')->path($path), [
            'Cache-Control' => 'public, max-age=31536000, immutable',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
