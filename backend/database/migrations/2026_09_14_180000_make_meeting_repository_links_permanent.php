<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('meeting_repositories', 'expires_at')) {
            DB::table('meeting_repositories')->update(['expires_at' => null]);
        }
    }

    public function down(): void
    {
        // Permanent links cannot restore historical expiration dates.
    }
};
