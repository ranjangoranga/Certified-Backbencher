let currentUser = null;
let csrfToken = '';
let isSignup = false;
let catalogRequest = 0;
function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
async function api(url, options = {}) {
    const headers = {'X-CSRF-Token': csrfToken, ...(options.headers || {})};
    const response = await fetch(url, {...options, headers, credentials: 'same-origin'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed.');
    return data;
}
const coursePanel = document.createElement('section');
coursePanel.style.cssText = 'max-width:1180px;margin:24px auto;padding:16px 24px;display:flex;gap:16px;flex-wrap:wrap;align-items:center';
coursePanel.innerHTML = `<label>Course <select id="courseSelect"><option>BBA</option><option>BCA</option><option>MCA</option></select></label>
<label>Year <select id="yearSelect"></select></label><label>Semester <select id="semesterSelect"></select></label>
<span id="catalogStatus" role="status" aria-live="polite"></span><button id="logoutButton" class="small-btn" hidden>Log out</button>
<button id="adminButton" class="small-btn" hidden>Manage materials</button>`;
document.querySelector('header').after(coursePanel);
coursePanel.querySelectorAll('select').forEach(el => {el.style.cssText='padding:10px;border-radius:8px;background:var(--card);color:var(--text);border:1px solid var(--border)';});
const courseSelect=document.getElementById('courseSelect'),yearSelect=document.getElementById('yearSelect'),semesterSelect=document.getElementById('semesterSelect');
function setYears() {
    yearSelect.innerHTML=Array.from({length:courseSelect.value==='MCA'?2:3},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');setSemesters();
}
function setSemesters() {
    const n=Number(yearSelect.value)*2;semesterSelect.innerHTML=`<option value="${n-1}">${n-1}</option><option value="${n}">${n}</option>`;
}
function selection() {return {course:courseSelect.value,year:Number(yearSelect.value),semester:Number(semesterSelect.value)};}
async function loadCatalog() {
    const version=++catalogRequest;
    const status=document.getElementById('catalogStatus');status.textContent='Loading materials…';
    subjects=[];resources={};renderSubjects();
    try {
        const data=await api('/api/catalog?'+new URLSearchParams(selection()));
        if(version!==catalogRequest)return;
        subjects=data.subjects;resources=data.resources;renderSubjects();showPage('home');
        status.textContent=subjects.length ? `${courseSelect.value} · Year ${yearSelect.value} · Semester ${semesterSelect.value}` : 'Materials have not been added for this semester yet.';
    } catch(e){if(version===catalogRequest)status.textContent='Could not load materials. '+e.message;}
}
courseSelect.onchange=()=>{setYears();loadCatalog();};yearSelect.onchange=()=>{setSemesters();loadCatalog();};semesterSelect.onchange=loadCatalog;
function updateAccount(data) {
    currentUser=data.user;csrfToken=data.csrf || '';
    document.querySelectorAll('.login-btn').forEach(b=>{b.textContent=currentUser?`Account: ${currentUser.name}`:'Log in / Sign up';b.onclick=currentUser?()=>alert(`${currentUser.name}\n${currentUser.email}\n${currentUser.course} · Year ${currentUser.year}`):openLogin;});
    document.getElementById('logoutButton').hidden=!currentUser;
    document.getElementById('adminButton').hidden=currentUser?.role!=='admin';
}
function toggleAuth() {
    isSignup=!isSignup;
    document.getElementById('authTitle').textContent=isSignup?'Create your account':'Welcome back.';
    document.getElementById('nameGroup').hidden=!isSignup;document.getElementById('authName').required=isSignup;
    document.getElementById('signupScope').hidden=!isSignup;
    document.getElementById('authPassword').minLength=isSignup?12:1;
    document.getElementById('authPassword').autocomplete=isSignup?'new-password':'current-password';
    document.getElementById('authSubmit').textContent=isSignup?'Create account':'Log in';
    document.getElementById('authToggle').textContent=isSignup?'Already have an account? Log in':'Create an account';
    document.getElementById('authMessage').textContent=isSignup?'Select your course above. Use at least 12 characters for your password.':'Log in to your student account.';
}
async function submitAuth(event) {
    event.preventDefault();const button=document.getElementById('authSubmit');button.disabled=true;
    try {
        const data=await api('/api/auth/'+(isSignup?'register':'login'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('authEmail').value,password:document.getElementById('authPassword').value,name:document.getElementById('authName').value,...selection()})});
        updateAccount(data);document.getElementById('authPassword').value='';closeLogin();
        courseSelect.value=data.user.course;setYears();yearSelect.value=data.user.year;setSemesters();semesterSelect.value=data.user.semester;await loadCatalog();
    } catch(e){document.getElementById('authMessage').textContent=e.message;}finally{button.disabled=false;}
}
document.getElementById('logoutButton').onclick=async()=>{try{await api('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});updateAccount({user:null});}catch(e){alert(e.message);}};
const adminPanel=document.createElement('section');adminPanel.hidden=true;adminPanel.style.cssText='max-width:1000px;margin:24px auto;padding:24px;border:1px solid var(--border);border-radius:16px';
adminPanel.innerHTML=`<h2>Manage study materials</h2><p>Changes apply to the course, year and semester selected above.</p>
<form id="subjectForm"><label>Subject code <input name="code" required maxlength="20" pattern="[A-Za-z0-9_-]+"></label><label>Subject name <input name="name" required maxlength="200"></label><button class="small-btn">Add subject</button></form>
<form id="uploadForm" style="margin-top:24px"><label>Subject code <input name="subject" required></label><label>Category <select name="kind"><option value="notes">Notes</option><option value="questions">Sample Questions</option><option value="assignments">Assignments</option></select></label><label>Title <input name="name" required maxlength="200"></label><label>Description <input name="description" maxlength="2000"></label><label>PDF (up to 32 MB) <input type="file" name="file" accept="application/pdf" required></label><button class="small-btn">Upload PDF</button></form><p id="adminStatus" role="status" aria-live="polite"></p>`;
coursePanel.after(adminPanel);document.getElementById('adminButton').onclick=()=>{adminPanel.hidden=!adminPanel.hidden;};
document.getElementById('subjectForm').onsubmit=async event=>{event.preventDefault();try{await api('/api/admin/subjects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...Object.fromEntries(new FormData(event.target)),...selection()})});event.target.reset();await loadCatalog();document.getElementById('adminStatus').textContent='Subject added.';}catch(e){document.getElementById('adminStatus').textContent=e.message;}};
document.getElementById('uploadForm').onsubmit=async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;try{const body=new FormData(event.target);for(const [k,v]of Object.entries(selection()))body.set(k,v);await api('/api/admin/materials',{method:'POST',body});event.target.reset();await loadCatalog();document.getElementById('adminStatus').textContent='PDF uploaded.';}catch(e){document.getElementById('adminStatus').textContent=e.message;}finally{button.disabled=false;}};
(async()=>{setYears();try{const data=await api('/api/auth/me');updateAccount(data);if(data.user){courseSelect.value=data.user.course;setYears();yearSelect.value=data.user.year;setSemesters();semesterSelect.value=data.user.semester;}}catch(e){document.getElementById('catalogStatus').textContent=e.message;}await loadCatalog();})();
