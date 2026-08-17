<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ResetOperationalData extends Command
{
    protected $signature = 'clinical:reset-operational-data {--force : Confirm irreversible truncation}';
    protected $description = 'Delete operational CDMS data while preserving authentication and authorization records.';

    public function handle(): int
    {
        if (!$this->option('force')) { $this->error('Pass --force to run this irreversible operation.'); return self::FAILURE; }
        $keep = ['migrations','users','password_reset_tokens','sessions','roles','permissions','user_roles','role_permissions'];
        $rows = DB::select('SHOW TABLES');
        DB::statement('SET FOREIGN_KEY_CHECKS=0');
        try {
            foreach ($rows as $row) {
                $table = array_values((array) $row)[0];
                if (in_array($table, $keep, true)) continue;
                DB::statement('TRUNCATE TABLE `'.str_replace('`', '``', $table).'`');
            }
        } finally { DB::statement('SET FOREIGN_KEY_CHECKS=1'); }
        $this->info('Operational data cleared; authentication and authorization tables were preserved.');
        return self::SUCCESS;
    }
}
