f = 'src/pages/SupervisorPortal.tsx'
with open(f, 'r', encoding='utf-8') as file:
    c = file.read()

# Fix the table open tag - replace native <table ...> with <Table>
c = c.replace('<table className="w-full text-sm" role="table" aria-label="Assigned students">', '<Table>')

# Fix <TableHead> being used where <TableHeader> is needed (the wrapper)
# The pattern is: <TableHead>\n                    <TableRow
c = c.replace('<TableHead>\n                    <TableRow', '<TableHeader>\n                    <TableRow')

with open(f, 'w', encoding='utf-8') as file:
    file.write(c)

print("Done")
