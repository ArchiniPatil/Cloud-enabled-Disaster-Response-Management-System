const base=process.env.SMOKE_API_ORIGIN??'http://127.0.0.1:4000';
const appOrigin=process.env.APP_ORIGIN??'http://localhost:5173';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw new Error('Local smoke checks require a loopback API');
async function read(path:string,options:RequestInit={}){const result=await fetch(`${base}/api/v1${path}`,options);if(!result.ok)throw new Error(`Smoke request failed: ${path} (${result.status})`);return result;}
await read('/health/ready');
const configuration=await (await read('/auth/config')).json();if(configuration.mode!=='demo')throw new Error('This smoke check requires the isolated demo environment');
const login=await read('/auth/demo',{method:'POST',headers:{'Content-Type':'application/json',Origin:appOrigin},body:JSON.stringify({email:'citizen@demo.invalid'})});
const cookie=login.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw new Error('Session cookie missing');
const me=await (await read('/auth/me',{headers:{Cookie:cookie}})).json();if(me.user.role!=='CITIZEN'||!me.csrf)throw new Error('Unexpected demo identity');
const incidents=await (await read('/incidents',{headers:{Cookie:cookie}})).json();if(!Array.isArray(incidents.items))throw new Error('Incident list response invalid');
await read('/auth/logout',{method:'POST',headers:{Cookie:cookie,Origin:appOrigin,'Content-Type':'application/json','X-CSRF-Token':me.csrf},body:'{}'});
console.log('Local smoke passed: DB readiness, cookie sign-in, scoped incident request and logout.');
export {};
