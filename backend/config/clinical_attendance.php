<?php

return [
    'enabled' => env('CLINICAL_ATTENDANCE_SCANNER_ENABLED', true),
    'rotation_seconds' => (int) env('CLINICAL_ATTENDANCE_QR_ROTATION_SECONDS', 15),
    'grace_seconds' => (int) env('CLINICAL_ATTENDANCE_QR_GRACE_SECONDS', 5),
];
