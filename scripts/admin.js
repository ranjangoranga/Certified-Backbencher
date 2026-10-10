// Owner-only CLI. No public admin endpoint and no secret admin password in browser code.
import {get,all,run,transaction,now,db} from '../backend/db.js';
import {PERIOD_DAYS} from '../backend/config.js';
import {passwordHash} from '../backend/security.js';
const [command,...args]=process.argv.slice(2);
if(command==='add-college'&&!/^[a-z0-9-]+$/.test(args[0]||''))throw new Error('College slug: lowercase letters, numbers and hyphens only');
if(['add-course','add-subject'].includes(command)&&!/^[A-Z0-9_-]{1,20}$/.test(args[1]||''))throw new Error('Course/subject code: uppercase letters, numbers, underscores and hyphens only');
if(command==='add-subject'&&args[4]&&!/^#[a-fA-F0-9]{6}$/.test(args[4]))throw new Error('Use a six-digit hex colour');
const log=(action,target)=>run('INSERT INTO audit_log(action,target,created_at) VALUES (?,?,?)',action,String(target),now());
if(command==='trial-list')console.table(all("SELECT t.id,u.email,t.instagram_handle,t.status FROM trial_requests t JOIN users u ON u.id=t.user_id WHERE status='pending'"));
else if(command==='trial-approve')transaction(()=>{
  // Verify the submitted Instagram username follows your profile before using this command.
  const id=Number(args[0]);const request=get("SELECT * FROM trial_requests WHERE id=? AND status='pending'",id);if(!request)throw new Error('Pending trial not found');
  run("UPDATE trial_requests SET status='approved',reviewed_at=? WHERE id=?",now(),id);
  run('INSERT INTO entitlements(user_id,kind,starts_at,ends_at,source) VALUES (?,?,?,?,?)',request.user_id,'trial',now(),now()+PERIOD_DAYS*86400000,`trial:${request.user_id}`);log(command,id);
});
else if(command==='trial-reject'){run("UPDATE trial_requests SET status='rejected',reviewed_at=? WHERE id=? AND status='pending'",now(),Number(args[0]));log(command,args[0]);}
else if(command==='list') {const tables=['colleges','courses','course_years','subjects','resources'];if(!tables.includes(args[0]))throw new Error('Choose a catalog table');console.table(all(`SELECT * FROM ${args[0]}`));}
else if(command==='add-college')run('INSERT INTO colleges(slug,name) VALUES (?,?)',args[0],args[1]);
else if(command==='add-course')run('INSERT INTO courses(college_id,code,name) VALUES (?,?,?)',Number(args[0]),args[1],args[2]);
else if(command==='add-year')run('INSERT INTO course_years(course_id,year_number) VALUES (?,?)',Number(args[0]),Number(args[1]));
else if(command==='add-subject')run('INSERT INTO subjects(year_id,code,name,description,color) VALUES (?,?,?,?,?)',Number(args[0]),args[1],args[2],args[3]||'',args[4]||'#f6d84a');
else if(command==='add-resource')run('INSERT INTO resources(subject_id,type,name,description) VALUES (?,?,?,?)',Number(args[0]),args[1],args[2],args[3]||'');
else if(command==='hide'||command==='show') {const tables=['colleges','courses','course_years','subjects','resources'];if(!tables.includes(args[0]))throw new Error('Invalid catalog table');run(`UPDATE ${args[0]} SET active=? WHERE id=?`,command==='show'?1:0,Number(args[1]));log(command,args.join(':'));}
else if(command==='reset-password') {
  // Pass the new password over stdin, never as a shell argument. Verify ownership of email first.
  let password='';for await(const chunk of process.stdin)password+=chunk;password=password.trim();
  if(password.length<10||password.length>128)throw new Error('Password must contain 10–128 characters');
  const user=get('SELECT id FROM users WHERE email=?',String(args[0]).toLowerCase());if(!user)throw new Error('User not found');
  run('UPDATE users SET password_hash=? WHERE id=?',await passwordHash(password),user.id);run('DELETE FROM sessions WHERE user_id=?',user.id);log(command,user.id);
}else if(command==='cleanup'){run('DELETE FROM sessions WHERE expires_at<?',now());run('DELETE FROM rate_limits WHERE resets_at<?',now());}
else throw new Error('Commands: trial-list, trial-approve ID, trial-reject ID, list TABLE, add-college SLUG NAME, add-course COLLEGE_ID CODE NAME, add-year COURSE_ID YEAR, add-subject YEAR_ID CODE NAME DESCRIPTION COLOR, add-resource SUBJECT_ID TYPE NAME DESCRIPTION, hide/show TABLE ID, reset-password EMAIL (password via stdin), cleanup');
db.close();
