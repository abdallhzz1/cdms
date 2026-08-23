const PDFParser = require('pdf2json');
const path = require('path');
const pdfParser = new PDFParser(this, 1);
pdfParser.on('pdfParser_dataReady', () => {
    const text = pdfParser.getRawTextContent();
    console.log(text.substring(8000, 16000));
});
pdfParser.loadPDF(path.join(__dirname, '../../../Desktop/cdms/مخرجات التعليم لكلية الطب البشري.pdf'));
