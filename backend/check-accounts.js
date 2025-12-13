const db = require('./config/database');
const crypto = require('crypto');
require('dotenv').config();

const ENCRYPTION_KEY_RAW = process.env.ENCRYPTION_KEY;

function getEncryptionKey() {
    return crypto.createHash('sha256').update(ENCRYPTION_KEY_RAW || 'temp').digest();
}

function decrypt(text) {
    if (!ENCRYPTION_KEY_RAW) return 'KEY_MISSING';
    try {
        const textParts = text.split(':');
        // Check if format is iv:content (iv is usually 32 hex chars = 16 bytes)
        if (textParts.length !== 2) return 'INVALID_FORMAT';

        const iv = Buffer.from(textParts.shift(), 'hex');
        if (iv.length !== 16) return 'INVALID_IV_LENGTH';

        const encryptedText = textParts.join(':');
        const key = getEncryptionKey();
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return 'SUCCESS';
    } catch (e) {
        return `ERROR: ${e.message}`;
    }
}

async function checkAccounts() {
    try {
        console.log('=== Checking Auction Accounts ===');
        const [rows] = await db.query('SELECT id, account_name, username, password FROM auction_accounts');

        if (rows.length === 0) {
            console.log('No accounts found.');
            process.exit(0);
        }

        console.log(`Found ${rows.length} accounts.`);

        rows.forEach(row => {
            console.log(`\nAccount [${row.id}] ${row.account_name}`);
            console.log(`Username: ${row.username}`);
            console.log(`Password Raw: ${row.password.substring(0, 10)}... (Length: ${row.password.length})`);

            // Check if it looks like IV:Encrypted (IV is 32 hex chars)
            const isColonFormat = row.password.includes(':');
            console.log(`Format contains colon (:)? ${isColonFormat ? 'YES' : 'NO'}`);

            // Try decrypt with current key
            const decryptResult = decrypt(row.password);
            console.log(`Decryption Attempt with Current Key: ${decryptResult}`);
        });

        process.exit(0);
    } catch (error) {
        console.error('DB Error:', error);
        process.exit(1);
    }
}

checkAccounts();
