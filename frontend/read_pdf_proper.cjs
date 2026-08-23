const fs = require('fs');
const PDFParser = require('pdf2json');
const path = require('path');

const pdfParser = new PDFParser(this, 1); // 1 = extract text
const pdfPath = path.join(__dirname, '../../../Desktop/cdms/مخرجات التعليم لكلية الطب البشري.pdf');

pdfParser.on('pdfParser_dataError', errData => console.error(errData.parserError) );
pdfParser.on('pdfParser_dataReady', pdfData => {
    const rawText = pdfParser.getRawTextContent();
    console.log("--- PDF RAW TEXT ---");
    console.log(rawText);
});

pdfParser.loadPDF(pdfPath);
