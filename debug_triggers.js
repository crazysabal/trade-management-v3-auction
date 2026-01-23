const fs = require('fs');
const db = require('./backend/config/database');

(async () => {
    try {
        const [triggers] = await db.query("SHOW TRIGGERS");
        let output = '';
        for (const t of triggers) {
            output += `Table: ${t.Table}, Trigger: ${t.Trigger}, Event: ${t.Event}, Timing: ${t.Timing}\n`;
            output += 'Statement:\n' + t.Statement + '\n';
            output += '---------------------------------------------------\n';
        }
        fs.writeFileSync('trigger_dump_all.txt', output);
        console.log('Dumped all triggers to trigger_dump_all.txt');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
