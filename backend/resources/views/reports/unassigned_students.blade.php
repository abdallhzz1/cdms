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
                <th>Student (AR)</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            @foreach($students as $student)
            <tr>
                <td>{{ $student['university_number'] ?? 'N/A' }}</td>
                <td>{{ $student['student_name_ar'] ?? '' }}</td>
                <td>{{ $student['status'] }}</td>
            </tr>
            @endforeach
        </tbody>
    </table>
</body>
</html>
