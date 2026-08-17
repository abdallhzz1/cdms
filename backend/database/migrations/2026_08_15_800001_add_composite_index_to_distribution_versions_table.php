<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 6E — HIGH-01 Remediation
 *
 * Adds the missing composite index on distribution_versions(rotation_id, status, is_current).
 *
 * RATIONALE (from Phase 6E Audit Finding HIGH-01):
 * The `currentPublishedForRotation` scope — the hottest query in the system — filters:
 *   WHERE rotation_id = ? AND status = 'published' AND is_current = 1
 *
 * Existing indexes at time of this migration:
 *   - rotation_id (single)             — migration 300015
 *   - status (single)                  — migration 300015
 *   - (rotation_id, is_current)        — migration 500001
 *
 * Without this composite index, MySQL must read all rows matching `rotation_id`,
 * then scan to filter `status` and `is_current`. At scale this is O(N) per rotation
 * where N = total version rows for that rotation. The three-column composite index
 * allows MySQL to resolve the entire predicate with a single index seek.
 *
 * SAFETY:
 * - This migration is purely additive — no data is modified, deleted, or restructured.
 * - All existing indexes are preserved exactly as-is.
 * - The clinical distribution algorithm, CurrentDistributionResolver, and all
 *   status/is_current semantics are completely unaffected.
 * - The migration is fully reversible via down() which drops only this new index.
 */
return new class extends Migration
{
    /**
     * Add the composite index.
     *
     * Named explicitly ('dv_rotation_status_current_idx') so the down() method
     * can drop it by name without ambiguity even if column-based drop() fails on
     * some MySQL versions due to index ordering.
     */
    public function up(): void
    {
        Schema::table('distribution_versions', function (Blueprint $table) {
            $table->index(
                ['rotation_id', 'status', 'is_current'],
                'dv_rotation_status_current_idx'
            );
        });
    }

    /**
     * Drop only the composite index added by this migration.
     *
     * All other indexes (rotation_id single, status single, (rotation_id, is_current))
     * created in earlier migrations are deliberately left in place.
     */
    public function down(): void
    {
        Schema::table('distribution_versions', function (Blueprint $table) {
            $table->dropIndex('dv_rotation_status_current_idx');
        });
    }
};
