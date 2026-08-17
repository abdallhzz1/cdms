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
    </style>
</head>
<body>
    <h1>{{ $title }}</h1>
    <p>Generated: {{ now()->toDateTimeString() }}</p>
    <table>
        <thead>
            <tr>
                <th>Univ. No</th>
                <th>Student (EN)</th>
                <th>Student (AR)</th>
                <th>Rotation</th>
                <th>Block</th>
                <th>Dates</th>
                <th>Department</th>
                <th>Site</th>
                <th>Supervisor</th>
            </tr>
        </thead>
        <tbody>
            @foreach($assignments as $a)
            <tr>
                <td>{{ $a->student->university_number ?? 'N/A' }}</td>
                <td>{{ $a->student->full_name_en ?? '' }}</td>
                <td>{{ $a->student->full_name_ar ?? '' }}</td>
                <td>{{ $a->rotationBlock->rotation->name ?? 'N/A' }}</td>
                <td>{{ $a->rotationBlock->block_code ?? 'N/A' }}</td>
                <td>W{{ $a->rotationBlock->from_week ?? '' }} - W{{ $a->rotationBlock->to_week ?? '' }}</td>
                <td>{{ $a->department->name_ar ?? 'N/A' }}</td>
                <td>{{ $a->trainingSite->name_ar ?? 'N/A' }}</td>
                <td>{{ $a->supervisor ? ($a->supervisor->full_name_ar ?? '') : 'Unassigned' }}</td>
            </tr>
            @endforeach
        </tbody>
    </table>
</body>
</html>
