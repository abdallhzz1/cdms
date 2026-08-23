const fs = require('fs');
const path = require('path');

const pdfPath = path.join(__dirname, '../../../Desktop/cdms/مخرجات التعليم لكلية الطب البشري.pdf');
const buf = fs.readFileSync(pdfPath);

// The title in hex from the PDF is FEFF + Arabic UTF-16BE
// Let's decode the hex title we found:
const titleHex = 'FEFF06270644062F063106270633062900200627064406300627062A064A06290020064406430644064A06290020062706440637062800200641064A0020062C0627064506390629002006270644062E0644064A06440020002D00200047006F006F0067006C006500200044006F00630073';

function decodeUTF16HexBE(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 4) {
    const code = parseInt(hex.substring(i, i + 4), 16);
    bytes.push(code);
  }
  // skip BOM (FEFF)
  return String.fromCharCode(...bytes.slice(1));
}

console.log('PDF Title:', decodeUTF16HexBE(titleHex));

// Now look for all hex strings in PDF that start with FEFF (UTF-16 Arabic)
const pdfStr = buf.toString('latin1');
const hexStrings = pdfStr.match(/\<FEFF[0-9A-Fa-f]+\>/g) || [];

console.log('\nFound', hexStrings.length, 'UTF-16 hex strings');
hexStrings.slice(0, 200).forEach((hs, i) => {
  const hex = hs.replace(/[<>]/g, '').substring(4); // remove <FEFF
  try {
    const decoded = decodeUTF16HexBE('FEFF' + hex);
    if (decoded.length > 1) {
      console.log(i + ':', decoded);
    }
  } catch(e) {}
});
