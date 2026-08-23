const XLSX = require('xlsx');
const path = require('path');
const wb = XLSX.readFile(path.join(__dirname, '../../../Desktop/cdms/PLO.xlsx'));
// Get PLO headers from Sheet 2
const ws2 = wb.Sheets[wb.SheetNames[1]];
const data2 = XLSX.utils.sheet_to_json(ws2, {header:1, defval:''});
console.log('PLO columns header row:');
console.log(JSON.stringify(data2[0]));
// also find all PLO data if any sheet has PLO definitions
wb.SheetNames.forEach(name => {
  const ws = wb.Sheets[name];
  const data = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
  console.log('\n=== FULL Sheet:', name, '- rows:', data.length, '===');
  data.forEach((row, i) => {
    if (row.some(c => c !== '')) console.log('Row ' + i + ':', JSON.stringify(row));
  });
});
