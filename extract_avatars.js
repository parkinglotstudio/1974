const fs = require('fs');

const htmlContent = fs.readFileSync('PLANDATA/arcade_ch2_ch3.html', 'utf8');

const chars2Match = htmlContent.match(/const chars2 = \[([\s\S]*?)\];/);
const chars3Match = htmlContent.match(/const chars3 = \[([\s\S]*?)\];/);

let csvContent = 'id,chapter_id,name,sub_name,glow_color,rarity,palette,pixel_map\n';
let currentId = 1;

// Existing chapter 1 avatars (if any, keep them or just generate from scratch if they are not in HTML)
// Wait, user only provided Chapter 2 and Chapter 3 in HTML.
// Where are chapter 1 avatars? They were in avatars_config.csv. Let's read existing avatars_config.csv first to keep chapter 1.

const existingCsv = fs.readFileSync('data/avatars_config.csv', 'utf8').split('\n');
for(let i=1; i<existingCsv.length; i++) {
    if(!existingCsv[i].trim()) continue;
    const parts = existingCsv[i].split(',');
    // keep chapter 1
    if(parts[1] === '1') {
        csvContent += existingCsv[i] + '\n';
        currentId++;
    }
}

function processChars(matchStr, chapterId) {
    if(!matchStr) return;
    // We can evaluate this string since it's just JS object definition
    // But it has no quotes around keys. We can use eval.
    let code = matchStr[0];
    let data;
    eval('data = ' + code.replace('const chars2 =', '').replace('const chars3 =', '').replace(/;$/, ''));
    
    data.forEach(char => {
        let name = char.name.replace(/"/g, '""');
        let sub = char.sub.replace(/"/g, '""');
        let glow = char.glow;
        let rare = char.rare;
        let palStr = char.pal.join(',');
        let mapStr = JSON.stringify(char.map);
        
        csvContent += `${currentId},${chapterId},"${name}","${sub}","${glow}",${rare},"${palStr}","${mapStr}"\n`;
        currentId++;
    });
}

processChars(chars2Match, 2);
processChars(chars3Match, 3);

fs.writeFileSync('data/avatars_config.csv', csvContent);
console.log('avatars_config.csv updated!');
