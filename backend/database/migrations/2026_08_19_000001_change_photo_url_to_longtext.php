<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('students', function (Blueprint $table) {
            $table->longText('photo_url')->nullable()->change();
        });

        Schema::table('people', function (Blueprint $table) {
            $table->longText('photo_url')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('students', function (Blueprint $table) {
            $table->string('photo_url', 500)->nullable()->change();
        });

        Schema::table('people', function (Blueprint $table) {
            $table->string('photo_url', 500)->nullable()->change();
        });
    }
};
