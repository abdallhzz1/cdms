<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_profiles', function (Blueprint $table) {
            $table->json('publications')->nullable()->after('bio');
            $table->json('conferences')->nullable()->after('publications');
            $table->json('documents')->nullable()->after('conferences');
        });

        foreach (['department_head_profiles', 'clinical_supervisor_profiles'] as $legacyTable) {
            if (! Schema::hasTable($legacyTable)) {
                continue;
            }

            DB::table($legacyTable)->orderBy('id')->each(function (object $legacy): void {
                $shared = DB::table('user_profiles')->where('user_id', $legacy->user_id)->first();
                $publications = $this->mergeJsonLists($shared?->publications ?? null, $legacy->publications ?? null);
                $conferences = $this->mergeJsonLists($shared?->conferences ?? null, $legacy->conferences ?? null);
                $documents = $this->mergeJsonLists($shared?->documents ?? null, $legacy->documents ?? null, 'id');

                DB::table('user_profiles')->updateOrInsert(
                    ['user_id' => $legacy->user_id],
                    [
                        'bio' => filled($shared?->bio ?? null) ? $shared->bio : ($legacy->cv_summary ?? null),
                        'publications' => $publications === [] ? null : json_encode($publications, JSON_UNESCAPED_UNICODE),
                        'conferences' => $conferences === [] ? null : json_encode($conferences, JSON_UNESCAPED_UNICODE),
                        'documents' => $documents === [] ? null : json_encode($documents, JSON_UNESCAPED_UNICODE),
                        'created_at' => $shared?->created_at ?? now(),
                        'updated_at' => now(),
                    ]
                );
            });
        }
    }

    public function down(): void
    {
        Schema::table('user_profiles', function (Blueprint $table) {
            $table->dropColumn(['publications', 'conferences', 'documents']);
        });
    }

    /** @return array<int, mixed> */
    private function mergeJsonLists(?string $current, ?string $incoming, ?string $identityKey = null): array
    {
        $items = array_merge($this->decodeList($current), $this->decodeList($incoming));
        $seen = [];

        return array_values(array_filter($items, function (mixed $item) use (&$seen, $identityKey): bool {
            if (! is_array($item)) {
                return false;
            }

            $identity = $identityKey && filled($item[$identityKey] ?? null)
                ? (string) $item[$identityKey]
                : json_encode($item, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if (isset($seen[$identity])) {
                return false;
            }
            $seen[$identity] = true;

            return true;
        }));
    }

    /** @return array<int, mixed> */
    private function decodeList(?string $value): array
    {
        if (! filled($value)) {
            return [];
        }

        $decoded = json_decode($value, true);

        return is_array($decoded) ? array_values($decoded) : [];
    }
};
