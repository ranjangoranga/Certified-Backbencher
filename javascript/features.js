/* API-backed account, course selection, verified access and page-by-page reader. */
const appState={user:null,csrf:null,years:[],instagram:null,currentPage:'home',authMode:'login',reader:null,pageURL:null,requestSequence:0};
function escapeHTML(value) {return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function api(url,method='GET',data) {
  const response=await fetch(url,{method,credentials:'same-origin',cache:'no-store',headers:method==='GET'?{}:{'Content-Type':'application/json','X-CSRF-Token':appState.csrf||''},body:data?JSON.stringify(data):undefined});
  const result=await response.json();if(!response.ok){const error=new Error(result.error||'Request failed');error.status=response.status;throw error;}return result;
}
function hasAccess() {return appState.user?.access_until>Date.now();}
function setAuthMode(mode) {
  appState.authMode=mode;document.getElementById('registrationFields').hidden=mode!=='register';
  document.getElementById('authTitle').textContent=mode==='register'?'Join the backbenchers.':'Welcome back.';
  document.getElementById('authDescription').textContent=mode==='register'?'Choose your college, course and year.':'Log in to access your course notes.';
  document.getElementById('authPassword').autocomplete=mode==='register'?'new-password':'current-password';
  document.getElementById('authMessage').textContent='';
}
function fillSelect(element,items,label,value) {element.replaceChildren(...items.map(x=>{const option=document.createElement('option');option.value=value(x);option.textContent=label(x);return option;}));}
function setupSelectors(prefix='') {
  const college=document.getElementById(prefix+'collegeSelect'),course=document.getElementById(prefix+'courseSelect'),year=document.getElementById(prefix+'yearSelect');
  const colleges=[...new Map(appState.years.map(x=>[x.college_id,x])).values()];
  fillSelect(college,colleges,x=>x.college_name,x=>x.college_id);
  const updateYears=()=>fillSelect(year,appState.years.filter(x=>String(x.college_id)===college.value&&x.code===course.value),x=>`Year ${x.year_number}`,x=>x.id);
  const updateCourses=()=>{fillSelect(course,[...new Map(appState.years.filter(x=>String(x.college_id)===college.value).map(x=>[x.code,x])).values()],x=>x.course_name,x=>x.code);updateYears();};
  college.onchange=updateCourses;course.onchange=updateYears;updateCourses();
  const selected=appState.years.find(x=>x.id===appState.user?.year_id);
  if(selected){college.value=selected.college_id;updateCourses();course.value=selected.code;updateYears();year.value=selected.id;}
}
function yearLabel() {const y=appState.years.find(x=>x.id===appState.user?.year_id);return y?`${y.college_name} · ${y.code} · Year ${y.year_number}`:'';}
async function refreshAccount() {
  const me=await api('/api/me');appState.user=me.user;appState.csrf=me.csrf;
  document.getElementById('accountNav').textContent=me.user?'Account':'Login';
  if(me.user) {
    const [s,r]=await Promise.all([api('/api/subjects'),api('/api/resources')]);subjects=s.subjects;resources={};
    for(const subject of subjects)resources[subject.code]={assignments:[],notes:[],questions:[]};
    for(const file of r.resources){const subject=subjects.find(x=>x.id===file.subject_id);if(subject)resources[subject.code][file.type].push(file);}
    document.querySelector('#subjects .section-description').textContent=yearLabel();
    document.querySelectorAll('.stat-number')[0].textContent=String(subjects.length).padStart(2,'0');
    document.querySelectorAll('.stat-number')[1].textContent=subjects.length*3;
  }
  renderSubjects();
  if(me.user&&!subjects.length){const empty='<div class="empty"><div class="empty-icon">📚</div><h3>Coming soon.</h3><p>Your course and year are saved. Notes will appear here when added.</p></div>';document.getElementById('allSubjects').innerHTML=empty;document.getElementById('homeSubjects').innerHTML=empty;}
}
document.getElementById('authForm').addEventListener('submit',async event=>{
  event.preventDefault();const button=document.getElementById('authSubmit'),message=document.getElementById('authMessage');button.disabled=true;message.textContent='Please wait…';
  try {
    await api(`/api/${appState.authMode}`,'POST',{email:document.getElementById('authEmail').value,password:document.getElementById('authPassword').value,year_id:Number(document.getElementById('yearSelect').value)});
    document.getElementById('authPassword').value='';await refreshAccount();closeLogin();showPage('subjects');
  }catch(error){message.textContent=error.message;}finally{button.disabled=false;}
});
function renderAccount(message='') {
  if(!appState.user)return openLogin();const user=appState.user;
  const until=user.access_until?new Date(user.access_until).toLocaleDateString():null;
  const status=hasAccess()?`Access active until ${until}`:'No active membership';
  const trial=user.trial?`Instagram trial: ${user.trial.status}`:'One verified Instagram-follow trial per account: 30 days.';
  document.getElementById('accountContent').innerHTML=`
    <p class="account-info">${escapeHTML(user.email)}<br>${escapeHTML(yearLabel())}<br>${escapeHTML(status)}<br>${escapeHTML(trial)}</p>
    <p class="form-message" id="accountMessage" role="status">${escapeHTML(message)}</p>
    <div class="account-actions"><button id="payButton" class="primary-btn" onclick="payMembership()">₹49 / 30 days · Pay with UPI</button><button class="secondary-btn" onclick="logout()">Log out</button></div>
    <p class="account-info">One payment grants 30 days. Renewal is manual; you will not be automatically charged. Google Pay is available through UPI checkout on supported devices.</p>
    ${!user.trial?`<div class="account-fields"><h3>One month free</h3><p class="account-info">Follow our Instagram profile, then submit your username. Your free period begins after the site owner verifies the follow.</p><div class="account-actions"><button class="secondary-btn" onclick="followInstagram()" ${appState.instagram?'':'disabled'}>Follow on Instagram ↗</button></div><form id="trialForm"><div class="form-group"><label for="instagramHandle">Instagram username</label><input id="instagramHandle" required maxlength="30" placeholder="your_username"></div><button class="small-btn" type="submit" ${appState.instagram?'':'disabled'}>Request free trial</button></form></div>`:''}
    <div class="account-fields"><h3>Your college and course</h3><form id="profileForm"><div class="form-group"><label for="profilecollegeSelect">College</label><select id="profilecollegeSelect"></select></div><div class="form-group"><label for="profilecourseSelect">Course</label><select id="profilecourseSelect"></select></div><div class="form-group"><label for="profileyearSelect">Year</label><select id="profileyearSelect"></select></div><button class="small-btn">Save course and year</button></form></div>
    <div class="account-fields"><h3>Change password</h3><form id="passwordForm"><div class="form-group"><label for="currentPassword">Current password</label><input id="currentPassword" type="password" autocomplete="current-password" required></div><div class="form-group"><label for="newPassword">New password</label><input id="newPassword" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></div><button class="small-btn">Update password</button></form></div>`;
  setupSelectors('profile');
  document.getElementById('profileForm').onsubmit=async event=>{event.preventDefault();try{await api('/api/profile','POST',{year_id:Number(document.getElementById('profileyearSelect').value)});await refreshAccount();renderAccount('Course and year saved.');}catch(e){accountMessage(e.message);}};
  document.getElementById('passwordForm').onsubmit=async event=>{event.preventDefault();try{await api('/api/password','POST',{current_password:document.getElementById('currentPassword').value,password:document.getElementById('newPassword').value});await refreshAccount();renderAccount('Password changed; other sessions have been signed out.');}catch(e){accountMessage(e.message);}};
  if(document.getElementById('trialForm'))document.getElementById('trialForm').onsubmit=async event=>{event.preventDefault();try{const result=await api('/api/trial','POST',{instagram_handle:document.getElementById('instagramHandle').value});await refreshAccount();renderAccount(result.message);}catch(e){accountMessage(e.message);}};
}
function accountMessage(message) {document.getElementById('accountMessage').textContent=message;}
function followInstagram() {if(appState.instagram)window.open(appState.instagram,'_blank','noopener,noreferrer');}
async function logout() {try{await api('/api/logout','POST');location.href='/';}catch(e){accountMessage(e.message);}}
let checkoutLoader;
function loadCheckout() {return checkoutLoader ||= new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';script.onload=resolve;script.onerror=()=>{checkoutLoader=null;reject(new Error('Could not load checkout.'));};document.head.appendChild(script);});}
async function payMembership() {
  const button=document.getElementById('payButton');if(button)button.disabled=true;
  try{await loadCheckout();const order=await api('/api/orders','POST');
    const checkout=new Razorpay({...order,name:'Certified Backbencher',description:'30-day course notes access',prefill:{email:appState.user.email},theme:{color:'#f6d84a'},handler:async result=>{try{await api('/api/payments/verify','POST',result);await refreshAccount();renderAccount('Payment verified. Your reading access is active.');}catch(e){accountMessage(e.message+' If already charged, access will update after provider confirmation.');}},modal:{ondismiss:()=>accountMessage('Checkout closed. You can try again.')}});
    checkout.on('payment.failed',()=>accountMessage('Payment failed. Access has not been activated.'));checkout.open();
  }catch(e){accountMessage(e.message);}finally{if(button)button.disabled=false;}
}
async function openReader(id) {
  if(!appState.user)return openLogin();
  try{await refreshAccount();if(!hasAccess()){renderAccount('Activate membership or request your verified Instagram trial to read notes.');showPage('account');return;}
    const note=await api(`/api/notes/${id}`);releaseReader();appState.reader={...note,page:1};
    document.getElementById('readerTitle').textContent=note.name;showPage('reader');await loadReaderPage();
  }catch(e){alert(e.message);}
}
async function loadReaderPage() {
  const note=appState.reader;if(!note)return;const sequence=++appState.requestSequence;
  document.getElementById('readerMessage').textContent='Loading page…';document.getElementById('notePage').removeAttribute('src');
  document.getElementById('pageIndicator').textContent=`Page ${note.page} of ${note.pages}`;
  document.getElementById('previousPage').disabled=note.page<=1;document.getElementById('nextPage').disabled=note.page>=note.pages;
  try{const response=await fetch(`/api/notes/${note.id}/pages/${note.page}`,{credentials:'same-origin',cache:'no-store'});
    if(!response.ok){const result=await response.json();throw new Error(result.error);}
    const blob=await response.blob();if(sequence!==appState.requestSequence||!appState.reader)return;
    if(appState.pageURL)URL.revokeObjectURL(appState.pageURL);appState.pageURL=URL.createObjectURL(blob);
    document.getElementById('notePage').src=appState.pageURL;document.getElementById('readerMessage').textContent='Personal reading copy · Account watermark applied';
  }catch(e){if(sequence===appState.requestSequence)document.getElementById('readerMessage').textContent=e.message;}
}
function turnPage(delta) {if(!appState.reader)return;appState.reader.page=Math.max(1,Math.min(appState.reader.pages,appState.reader.page+delta));loadReaderPage();}
function releaseReader(){appState.requestSequence++;appState.reader=null;if(appState.pageURL)URL.revokeObjectURL(appState.pageURL);appState.pageURL=null;document.getElementById('notePage').removeAttribute('src');}
async function closeReader(){if(document.fullscreenElement)await document.exitFullscreen();releaseReader();if(appState.resourceSubject)openResource(appState.resourceSubject,appState.resourceType);else showPage('subjects');}
async function readerFullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.getElementById('readerSurface').requestFullscreen)await document.getElementById('readerSurface').requestFullscreen();else document.getElementById('readerMessage').textContent='Use your browser’s full-screen view on this device.';}catch{document.getElementById('readerMessage').textContent='Full screen is unavailable in this browser.';}}
document.getElementById('readerSurface').addEventListener('contextmenu',event=>event.preventDefault());
document.getElementById('readerSurface').addEventListener('dragstart',event=>event.preventDefault());
document.addEventListener('visibilitychange',()=>document.getElementById('readerSurface').classList.toggle('reader-paused',document.hidden));
// Browser capture cannot be prevented. These controls deter copying without making false DRM promises.
document.addEventListener('keydown',event=>{if(appState.currentPage==='reader'&&(event.ctrlKey||event.metaKey)&&['p','s','c'].includes(event.key.toLowerCase()))event.preventDefault();});
setInterval(async()=>{if(appState.currentPage==='reader'&&appState.user&&!hasAccess()){try{const me=await api('/api/me');appState.user=me.user;appState.csrf=me.csrf;}catch{}if(!hasAccess()){releaseReader();if(appState.user){renderAccount('Your access period ended. Renew to continue reading.');showPage('account');}else{showPage('home');openLogin();}}}},10000);
async function initialise() {
  loadTheme();renderSubjects();
  try{const catalog=await api('/api/catalog');appState.years=catalog.years;appState.instagram=catalog.instagram_url;setupSelectors();await refreshAccount();}
  catch(error){document.getElementById('authMessage').textContent='The account server is unavailable. '+error.message;}
}
initialise();
