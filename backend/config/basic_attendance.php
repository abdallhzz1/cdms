<?php

return [
    // New lectures only. Historical open lectures retain their existing workflow.
    'auto_finalize_hours' => max(1, (int) env('BASIC_ATTENDANCE_AUTO_FINALIZE_HOURS', 12)),
];
