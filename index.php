<?php

declare(strict_types=1);

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

/*
 * Production keeps public_html at /home/<account>/domains/<domain>/public_html
 * and the private application at /home/<account>/repositories/cdms/backend.
 * The local fallback supports development and the one-time server migration.
 */
$configuredBackend = getenv('CDMS_BACKEND_PATH') ?: null;
$accountHome = dirname(__DIR__, 3);
$candidates = array_filter([
    $configuredBackend,
    $accountHome.'/repositories/cdms/backend',
    __DIR__.'/backend',
]);

$backendPath = null;
foreach ($candidates as $candidate) {
    $resolved = realpath($candidate);
    if ($resolved !== false && is_file($resolved.'/vendor/autoload.php')) {
        $backendPath = $resolved;
        break;
    }
}

if ($backendPath === null) {
    http_response_code(503);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode([
        'message' => 'Application backend is unavailable.',
    ], JSON_UNESCAPED_SLASHES);
    exit;
}

if (is_file($maintenance = $backendPath.'/storage/framework/maintenance.php')) {
    require $maintenance;
}

require $backendPath.'/vendor/autoload.php';

/** @var Application $app */
$app = require_once $backendPath.'/bootstrap/app.php';
$app->handleRequest(Request::capture());
