const fs = require('fs');
const path = require('path');

const outputFile = path.join(__dirname, '..', 'src', 'tailwind.generated.css');
const css = fs.readFileSync(outputFile, 'utf8');

fs.writeFileSync(
  outputFile,
  css.replaceAll('calc(infinity * 1px)', '9999px')
);
