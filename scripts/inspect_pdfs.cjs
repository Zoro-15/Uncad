const fs = require('fs');
const html = fs.readFileSync('1_4934080643215656811.html', 'utf8');

// Match all slides_pdf URLs anywhere in the HTML:
// href="https://player.uacdn.net/slides_pdf/UID/FILENAME.pdf"
const pdfRegex = /href="(https:\/\/player\.uacdn\.net\/slides_pdf\/([A-Z0-9]+)\/([^"]+?\.pdf))"/g;
let match;
let pdfMap = {};
let totalFound = 0;

while ((match = pdfRegex.exec(html)) !== null) {
    totalFound++;
    const fullUrl = match[1];
    const uid = match[2];
    const filename = match[3];

    if (!pdfMap[uid]) {
        pdfMap[uid] = { withAnno: null, noAnno: null, list: [] };
    }

    pdfMap[uid].list.push(fullUrl);

    if (filename.includes('with_anno')) {
        pdfMap[uid].withAnno = fullUrl;
    } else if (filename.includes('no_anno')) {
        pdfMap[uid].noAnno = fullUrl;
    } else if (!pdfMap[uid].withAnno) {
        pdfMap[uid].withAnno = fullUrl;
    }
}

console.log('Total PDF occurrences found:', totalFound);
console.log('Unique UIDs with PDF:', Object.keys(pdfMap).length);
console.log('Sample UID mappings:');
Object.keys(pdfMap).slice(0, 10).forEach(u => console.log(u, '=>', pdfMap[u]));

fs.writeFileSync('scripts/pdf_links_cache.json', JSON.stringify(pdfMap, null, 2));
console.log('Saved scripts/pdf_links_cache.json');
