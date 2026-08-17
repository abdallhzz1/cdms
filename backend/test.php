<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);

$request = Illuminate\Http\Request::create('/api/v1/correspondence', 'POST', [], [], [], [
    'CONTENT_TYPE' => 'application/json',
    'HTTP_ACCEPT' => 'application/json'
], json_encode([
    'direction' => 'internal',
    'subject' => 'Test Subject',
    'summary' => 'Test Summary',
    'priority' => 'normal',
    'correspondence_date' => '2026-08-17',
    'assigned_to' => "1"
]));
$user = \App\Models\User::first();
$request->setUserResolver(function() use ($user) { return $user; });

$response = $kernel->handle($request);
echo $response->getStatusCode() . "\n";
echo $response->getContent();
