const fs = require("fs");
let libCode = fs.readFileSync(process.cwd() + "/lib/index.js");
libCode = libCode.toString().replace(/export [\s\S]*;/g, "");

module.exports = function testSuite(code, debug) {
  return `
    ${libCode}
    addEventListener('fetch', event => {
      const app = new Koaw(event, {debug: ${Boolean(debug)}});
      ${code}
      
      event.respondWith(app.run());
    })
    `;
};
