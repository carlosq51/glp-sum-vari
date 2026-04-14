import fetch from 'node-fetch';

async function test_endpoints() {
  const base = 'http://localhost:3000';
  
  console.log('\n====== TESTING 6 OPTIMIZED ENDPOINTS ======\n');
  
  const tests = [
    { name: 'GET /api/vin-suggest?q=AA', method: 'GET', url: `${base}/api/vin-suggest?q=AA` },
    { name: 'GET /api/name-suggest?q=test', method: 'GET', url: `${base}/api/name-suggest?q=test` },
    { name: 'GET /api/tecnicos-list', method: 'GET', url: `${base}/api/tecnicos-list` },
    { name: 'POST /api/sync', method: 'POST', url: `${base}/api/sync`, body: { email: 'test@test.com' } },
    { name: 'POST /api/mis-activas', method: 'POST', url: `${base}/api/mis-activas`, body: { email: 'test@test.com' } },
    { name: 'POST /api/mis-finalizadas', method: 'POST', url: `${base}/api/mis-finalizadas`, body: { email: 'test@test.com' } },
  ];

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    process.stdout.write(`[${i+1}/6] ${test.name}... `);
    
    try {
      const t1 = Date.now();
      const opts = { 
        method: test.method,
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      };
      if (test.body) opts.body = JSON.stringify(test.body);
      
      const res = await fetch(test.url, opts);
      const t2 = Date.now();
      const json = await res.json();
      
      const timing = json._timing || 'N/A';
      const source = json._source || 'unknown';
      const count = json.count || json.items?.length || 0;
      
      if (res.ok && json.ok) {
        console.log(`✅ ${res.status} | ${timing} | count=${count} | source=${source}`);
      } else {
        console.log(`❌ ${res.status} | ${json.error || 'Error'}`);
      }
    } catch (e) {
      console.log(`❌ Error: ${e.message}`);
    }
  }
  
  console.log('\n====== TEST COMPLETE ======\n');
}

test_endpoints();
