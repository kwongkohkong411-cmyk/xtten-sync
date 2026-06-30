const http = require('http');

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'http://localhost:3000');
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  console.log('Testing login with different credentials:\n');
  
  // Try exact format from user list
  const attempts = [
    { email: 'sn888xt@example.com', password: 'password123' },
    { email: 'sn888xt', password: 'password123' },
    { email: 'admin@example.com', password: 'admin123' },
    { username: 'sn888xt', password: 'password123' },
  ];

  for (const cred of attempts) {
    console.log(`Testing: ${cred.email || cred.username} / ${cred.password}`);
    const res = await request('POST', '/auth/login', cred);
    console.log(`  Status: ${res.status}`);
    if (res.body?.access_token) {
      console.log(`  ✅ SUCCESS! Token: ${res.body.access_token.substring(0, 20)}...`);
      return res.body.access_token;
    } else {
      console.log(`  Error: ${res.body?.message || res.body?.error || JSON.stringify(res.body).substring(0, 60)}`);
    }
    console.log('');
  }
}

test().catch(console.error);
