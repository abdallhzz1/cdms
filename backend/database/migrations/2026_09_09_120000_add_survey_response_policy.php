<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
 public function up():void { Schema::table('quality_surveys',fn(Blueprint $table)=>$table->string('response_policy',30)->default('multiple')->after('is_anonymous')); Schema::create('quality_survey_submissions',function(Blueprint $table){$table->uuid('id')->primary();$table->foreignId('quality_survey_id')->constrained()->cascadeOnDelete();$table->string('respondent_key',64)->nullable();$table->string('respondent_identifier')->nullable();$table->timestamp('submitted_at');$table->timestamps();$table->unique(['quality_survey_id','respondent_key'],'survey_respondent_once');}); }
 public function down():void { Schema::dropIfExists('quality_survey_submissions');Schema::table('quality_surveys',fn(Blueprint $table)=>$table->dropColumn('response_policy')); }
};
