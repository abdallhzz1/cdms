<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('distribution_version_breaks')) {
            return;
        }

        Schema::create('distribution_version_breaks', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('distribution_version_id');
            $table->string('label', 100)->default('عطلة');
            $table->date('start_date');
            $table->date('end_date');
            $table->timestamps();

            $table->foreign('distribution_version_id', 'dvb_version_fk')
                ->references('id')->on('distribution_versions')->cascadeOnDelete();
            $table->index(['distribution_version_id', 'start_date', 'end_date'], 'dvb_version_dates_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('distribution_version_breaks');
    }
};
