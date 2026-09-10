<?php

use App\Services\SecureFileUploadService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $sources = [
            ['table' => 'user_profiles', 'url' => 'avatar_url', 'path' => 'avatar_storage_path'],
            ['table' => 'clinical_supervisor_profiles', 'url' => 'avatar_url', 'path' => 'avatar_storage_path'],
            ['table' => 'department_head_profiles', 'url' => 'avatar_url', 'path' => 'avatar_storage_path'],
            ['table' => 'students', 'url' => 'photo_url', 'path' => 'photo_storage_path'],
        ];

        foreach ($sources as $source) {
            if (! Schema::hasTable($source['table']) || ! Schema::hasColumn($source['table'], $source['path'])) {
                continue;
            }

            DB::table($source['table'])
                ->whereNotNull($source['path'])
                ->where($source['path'], '!=', '')
                ->orderBy('id')
                ->chunkById(100, function ($records) use ($source): void {
                    foreach ($records as $record) {
                        $oldUrl = $record->{$source['url']};
                        $newUrl = SecureFileUploadService::publicAvatarUrl($record->{$source['path']});

                        DB::table($source['table'])->where('id', $record->id)->update([
                            $source['url'] => $newUrl,
                            'updated_at' => now(),
                        ]);

                        if ($oldUrl && Schema::hasTable('people')) {
                            DB::table('people')->where('photo_url', $oldUrl)->update([
                                'photo_url' => $newUrl,
                                'updated_at' => now(),
                            ]);
                        }
                    }
                });
        }
    }

    public function down(): void
    {
        // The generated application URLs remain valid and must not be changed
        // back to deployment-specific /storage links during a rollback.
    }
};
