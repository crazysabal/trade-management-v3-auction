const db = require('./config/database');

async function checkTriggers() {
  try {
    const [rows] = await db.query(`SHOW TRIGGERS`);
    console.log('Triggers:');
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkTriggers();



















