const axios = require('axios');

async function testApi() {
    try {
        const response = await axios.get('http://localhost:3001/api/inventory/transactions', {
            params: {
                start_date: '2025-12-24',
                end_date: '2025-12-24',
                warehouse_id: '',
                transaction_type: ''
            }
        });
        console.log('Success:', response.data);
    } catch (error) {
        if (error.response) {
            console.log('Error Status:', error.response.status);
            console.log('Error Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Request Error:', error.message);
        }
    }
}

testApi();
