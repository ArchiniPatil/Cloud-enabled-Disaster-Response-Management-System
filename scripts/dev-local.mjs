import {loadEnvFile} from 'node:process';
import {spawn} from 'node:child_process';
loadEnvFile('.env');
if(process.env.AUTH_MODE!=='demo')throw new Error('dev:local requires AUTH_MODE=demo; use the separately reviewed cloud configuration for Cognito.');
const windows=process.platform==='win32';
const child=spawn(windows?'npm.cmd':'npm',['run','dev'],{stdio:'inherit',env:{...process.env},detached:!windows,shell:windows});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(child.pid){try{if(windows)child.kill(signal);else process.kill(-child.pid,signal);}catch{/* Child already exited. */}}});
child.on('error',()=>{console.error('Unable to start npm; check the Node/npm installation.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??0;});
