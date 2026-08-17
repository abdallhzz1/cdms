import glob

filepath = 'database/migrations/2026_08_14_300006_create_student_groups_table.php'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "$table->timestamps();",
    "$table->timestamps();\n            $table->unique(['academic_year_id', 'name', 'academic_level'], 'grp_year_name_level_unique');"
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
