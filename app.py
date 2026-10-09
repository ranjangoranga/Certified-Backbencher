"""Certified Backbencher: same-origin website, accounts and database-backed files."""
import hashlib
import io
import os
import re
import secrets
import sqlite3
import time
from pathlib import Path
from urllib.parse import urlsplit
from flask import Flask, request, jsonify, g, send_file
from werkzeug.security import generate_password_hash, check_password_hash

ROOT = Path(__file__).resolve().parent
COURSES = {'BBA': 3, 'BCA': 3, 'MCA': 2}
KINDS = {'notes', 'questions', 'assignments'}

def create_app(database=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(DATABASE=str(database or os.environ.get('DATABASE_PATH', ROOT / 'data/site.sqlite3')),
                      MAX_CONTENT_LENGTH=32 * 1024 * 1024)
    Path(app.config['DATABASE']).parent.mkdir(parents=True, exist_ok=True)
    def db():
        if 'db' not in g:
            g.db = sqlite3.connect(app.config['DATABASE'], timeout=20)
            g.db.row_factory = sqlite3.Row
            g.db.execute('PRAGMA foreign_keys=ON')
        return g.db
    @app.teardown_appcontext
    def close_db(_):
        if 'db' in g: g.db.close()
    with app.app_context():
        db().executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS users(
          id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
          password_hash TEXT NOT NULL, course TEXT NOT NULL, year INTEGER NOT NULL,
          semester INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'student', created INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(
          token_hash TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          csrf TEXT NOT NULL, expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS subjects(
          course TEXT NOT NULL, year INTEGER NOT NULL, semester INTEGER NOT NULL,
          code TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
          color TEXT NOT NULL DEFAULT '#9b7cff', PRIMARY KEY(course,year,semester,code));
        CREATE TABLE IF NOT EXISTS materials(
          id TEXT PRIMARY KEY, source_id TEXT UNIQUE, course TEXT NOT NULL, year INTEGER NOT NULL,
          semester INTEGER NOT NULL, subject TEXT NOT NULL, kind TEXT NOT NULL,
          name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', filename TEXT NOT NULL,
          mime TEXT NOT NULL, sha256 TEXT NOT NULL, content BLOB NOT NULL, created INTEGER NOT NULL,
          FOREIGN KEY(course,year,semester,subject) REFERENCES subjects(course,year,semester,code));
        CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS material_scope ON materials(course,year,semester,subject,kind);
        CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires);
        ''')
        db().commit()
    def error(message, status=400): return jsonify(error=message), status
    def user_session():
        token = request.cookies.get('cb_session', '')
        if not token: return None
        return db().execute('SELECT u.*,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?',
                            (hashlib.sha256(token.encode()).hexdigest(), int(time.time()))).fetchone()
    def public_user(u):
        return {k:u[k] for k in ('id','email','name','course','year','semester','role')}
    def scope(data):
        course = data.get('course', 'BBA')
        year, semester = int(data.get('year', 1)), int(data.get('semester', 1))
        if course not in COURSES or not 1 <= year <= COURSES[course] or semester not in (2*year-1, 2*year):
            raise ValueError('Select a valid course, year and semester.')
        return course, year, semester
    @app.before_request
    def protect():
        if request.is_json and request.method in ('POST','PUT','PATCH') and not isinstance(request.get_json(),dict):
            return error('JSON object required.')
        if request.path.startswith('/api/') and request.method not in ('GET','HEAD','OPTIONS'):
            origin = request.headers.get('Origin')
            if origin and urlsplit(origin).netloc != request.host: return error('Invalid origin.',403)
            # New sessions must use JSON; browser cross-site forms cannot send this content type.
            if request.path.startswith('/api/auth/') and not request.is_json: return error('JSON required.',415)
            if request.path not in ('/api/auth/login','/api/auth/register'):
                u = user_session()
                if not u: return error('Please log in.',401)
                if not secrets.compare_digest(request.headers.get('X-CSRF-Token',''), u['csrf']): return error('Invalid session token.',403)
            if request.path in ('/api/auth/login','/api/auth/register'):
                now = int(time.time()); key = request.remote_addr or 'unknown'
                c=db(); c.execute('BEGIN IMMEDIATE')
                c.execute('INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset<=? THEN 1 ELSE count+1 END, reset=CASE WHEN reset<=? THEN ? ELSE reset END', (key,now+900,now,now,now+900))
                count=c.execute('SELECT count FROM rate_limits WHERE key=?',(key,)).fetchone()[0];c.commit()
                if count > 30: return error('Too many attempts. Try again in 15 minutes.',429)
    @app.after_request
    def headers(response):
        response.headers['X-Content-Type-Options']='nosniff'
        response.headers['Referrer-Policy']='same-origin'
        response.headers['X-Frame-Options']='SAMEORIGIN'
        if request.path.startswith('/api/auth/'): response.headers['Cache-Control']='no-store'
        if os.environ.get('COOKIE_SECURE','0')=='1': response.headers['Strict-Transport-Security']='max-age=31536000'
        return response
    @app.errorhandler(413)
    def too_large(_): return error('Maximum upload size is 32 MB.',413)
    @app.errorhandler(400)
    def bad_request(_): return error('Invalid request.',400)
    def login_response(u):
        token, csrf=secrets.token_urlsafe(32),secrets.token_urlsafe(32)
        db().execute('DELETE FROM sessions WHERE expires<=?',(int(time.time()),))
        old=request.cookies.get('cb_session','')
        db().execute('DELETE FROM sessions WHERE token_hash=?',(hashlib.sha256(old.encode()).hexdigest(),))
        db().execute('INSERT INTO sessions VALUES(?,?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),u['id'],csrf,int(time.time())+604800)); db().commit()
        response=jsonify(user=public_user(u),csrf=csrf)
        response.set_cookie('cb_session',token,max_age=604800,httponly=True,samesite='Lax',secure=os.environ.get('COOKIE_SECURE','0')=='1')
        return response
    @app.post('/api/auth/register')
    def register():
        data=request.get_json(); email=str(data.get('email','')).strip().lower(); name=str(data.get('name','')).strip(); password=data.get('password','')
        if not re.fullmatch(r'[^\s@]{1,128}@[^\s@]{1,128}\.[^\s@]{1,63}',email) or not 1<=len(name)<=100: return error('Enter your name and a valid email.')
        if not isinstance(password,str) or not 12<=len(password)<=128: return error('Use a password of 12–128 characters.')
        try: course,year,semester=scope(data)
        except (ValueError,TypeError): return error('Invalid course selection.')
        try:
            cur=db().execute('INSERT INTO users(email,name,password_hash,course,year,semester,created) VALUES(?,?,?,?,?,?,?)',(email,name,generate_password_hash(password),course,year,semester,int(time.time())));db().commit()
        except sqlite3.IntegrityError: return error('An account already exists with this email.',409)
        return login_response(db().execute('SELECT * FROM users WHERE id=?',(cur.lastrowid,)).fetchone())
    @app.post('/api/auth/login')
    def login():
        data=request.get_json(); u=db().execute('SELECT * FROM users WHERE email=?',(str(data.get('email','')).strip().lower(),)).fetchone()
        password=data.get('password','')
        if not isinstance(password,str) or len(password)>128: return error('Invalid email or password.',401)
        # Equal-cost password checks when an email is unknown.
        hash_value=u['password_hash'] if u else app.config.setdefault('DUMMY_HASH',generate_password_hash(secrets.token_urlsafe(24)))
        if not check_password_hash(hash_value,password) or not u: return error('Invalid email or password.',401)
        return login_response(u)
    @app.get('/api/auth/me')
    def me():
        u=user_session()
        return jsonify(user=public_user(u) if u else None,csrf=u['csrf'] if u else None)
    @app.post('/api/auth/logout')
    def logout():
        token=request.cookies.get('cb_session','');db().execute('DELETE FROM sessions WHERE token_hash=?',(hashlib.sha256(token.encode()).hexdigest(),));db().commit()
        response=jsonify(ok=True);response.delete_cookie('cb_session',secure=os.environ.get('COOKIE_SECURE','0')=='1',httponly=True,samesite='Lax');return response
    @app.get('/api/catalog')
    def catalog():
        try: selected=scope(request.args)
        except (ValueError,TypeError): return error('Invalid course selection.')
        subjects=[dict(r) for r in db().execute('SELECT code,name,description,color FROM subjects WHERE course=? AND year=? AND semester=? ORDER BY rowid',selected)]
        resources={s['code']:{k:[] for k in KINDS} for s in subjects}
        for r in db().execute('SELECT id,subject,kind,name,description,mime,length(content) AS size FROM materials WHERE course=? AND year=? AND semester=? ORDER BY created,id',selected):
            f=dict(r);f['url']='/api/materials/'+r['id'];resources[r['subject']][r['kind']].append(f)
        return jsonify(subjects=subjects,resources=resources,courses=COURSES)
    @app.get('/api/materials/<material_id>')
    def material(material_id):
        # Existing notes remain public. Student profiles and sessions are private.
        r=db().execute('SELECT filename,mime,sha256,content FROM materials WHERE id=?',(material_id,)).fetchone()
        if not r: return error('Material not found.',404)
        return send_file(io.BytesIO(r['content']),mimetype=r['mime'],download_name=r['filename'],as_attachment=request.args.get('download')=='1' or r['mime']!='application/pdf',etag=r['sha256'],conditional=True)
    @app.post('/api/admin/materials')
    def upload():
        if user_session()['role']!='admin': return error('Admin access required.',403)
        try: selected=scope(request.form)
        except (ValueError,TypeError): return error('Invalid course selection.')
        subject=request.form.get('subject','');kind=request.form.get('kind',''); f=request.files.get('file');name=request.form.get('name','').strip();description=request.form.get('description','').strip()
        if kind not in KINDS or not f or not 1<=len(name)<=200 or len(description)>2000: return error('Provide a file, title, subject and category.')
        if not db().execute('SELECT 1 FROM subjects WHERE course=? AND year=? AND semester=? AND code=?',(*selected,subject)).fetchone(): return error('Subject not found.')
        content=f.read()
        if not content.startswith(b'%PDF-'): return error('Upload a valid PDF.')
        ident=secrets.token_hex(16)
        db().execute('INSERT INTO materials VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(ident,None,*selected,subject,kind,name,description,ident+'.pdf','application/pdf',hashlib.sha256(content).hexdigest(),content,int(time.time())));db().commit()
        return jsonify(id=ident,url='/api/materials/'+ident),201
    @app.post('/api/admin/subjects')
    def add_subject():
        if user_session()['role']!='admin':return error('Admin access required.',403)
        d=request.get_json()
        try:selected=scope(d)
        except (ValueError,TypeError):return error('Invalid course selection.')
        code=str(d.get('code','')).strip().upper();name=str(d.get('name','')).strip()
        if not re.fullmatch(r'[A-Z0-9_-]{1,20}',code) or not 1<=len(name)<=200:return error('Valid subject code and name required.')
        try:db().execute('INSERT INTO subjects VALUES(?,?,?,?,?,?,?)',(*selected,code,name,'','#9b7cff'));db().commit()
        except sqlite3.IntegrityError:return error('Subject already exists.',409)
        return jsonify(ok=True),201
    @app.get('/api/health')
    def health():db().execute('SELECT 1');return jsonify(ok=True)
    @app.get('/')
    def index():return send_file(ROOT/'index.html')
    @app.get('/client.js')
    def client():return send_file(ROOT/'client.js')
    return app

app=create_app()
if __name__=='__main__': app.run(host='127.0.0.1',port=int(os.environ.get('PORT','8000')))
