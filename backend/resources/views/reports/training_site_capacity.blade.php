<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <title>{{ $title }}</title>
    <style>
        body { font-family: 'DejaVu Sans', sans-serif; font-size: 12px; margin: 20px; }
        h1 { text-align: center; color: #111827; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #d1d5db; padding: 8px; text-align: right; }
        th { background-color: #f3f4f6; color: #4b5563; }
        .OVER_CAPACITY { color: #dc2626; font-weight: bold; }
        .NEAR_CAPACITY { color: #d97706; font-weight: bold; }
        .UNDER_CAPACITY { color: #16a34a; }
        .AT_CAPACITY { color: #2563eb; }
    </style>
</head>
<body>
    <h1>{{ $title }}</h1>
    <p>Generated: {{ now()->toDateTimeString() }}</p>
    <table>
        <thead>
            <tr>
                <th>Site (AR)</th>
                <th>Capacity</th>
                <th>Assigned</th>
                <th>Remaining</th>
                <th>Utilization %</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            @foreach($sites as $site)
            <tr>
                <td>{{ $site['site_name_ar'] ?? '' }}</td>
                <td>{{ $site['capacity'] ?? 'N/A' }}</td>
                <td>{{ $site['assigned'] }}</td>
                <td>{{ $site['remaining'] ?? 'N/A' }}</td>
                <td>{{ $site['utilization_percent'] ?? 'N/A' }}%</td>
                <td class="{{ $site['status'] }}">{{ str_replace('_', ' ', $site['status']) }}</td>
            </tr>
            @endforeach
        </tbody>
    </table>
</body>
</html>
