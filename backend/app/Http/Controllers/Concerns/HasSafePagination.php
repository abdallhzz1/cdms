<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Http\Request;

trait HasSafePagination
{
    protected function perPage(Request $request, int $default = 25, int $maximum = 100): int
    {
        return min(max($request->integer('per_page', $default), 1), $maximum);
    }
}
