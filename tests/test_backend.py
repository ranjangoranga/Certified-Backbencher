import io
import sqlite3
import tempfile
import unittest
from pathlib import Path
from app import create_app

class BackendTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'db.sqlite3';self.app=create_app(self.path);self.app.testing=True;self.client=self.app.test_client()
        with sqlite3.connect(self.path) as db:db.execute("INSERT INTO subjects VALUES('BBA',1,1,'PPM','Management','','#ffff00')")
    def tearDown(self):self.tmp.cleanup()
    def register(self):
        r=self.client.post('/api/auth/register',json={'email':'student@example.com','name':'Student','password':'a-secure-password','course':'BBA','year':1,'semester':1});self.assertEqual(r.status_code,200);return r.json['csrf']
    def test_registration_login_logout(self):
        csrf=self.register();cookie=self.client.get_cookie('cb_session');self.assertTrue(cookie.http_only)
        with sqlite3.connect(self.path) as db:
            password=db.execute('SELECT password_hash FROM users').fetchone()[0];self.assertNotEqual(password,'a-secure-password')
            token=db.execute('SELECT token_hash FROM sessions').fetchone()[0];self.assertNotEqual(token,cookie.value)
        self.assertEqual(self.client.get('/api/auth/me').json['user']['course'],'BBA')
        self.assertEqual(self.client.post('/api/auth/logout',json={}).status_code,403)
        self.assertEqual(self.client.post('/api/auth/logout',json={},headers={'X-CSRF-Token':csrf}).status_code,200)
        self.assertIsNone(self.client.get('/api/auth/me').json['user'])
        self.assertEqual(self.client.post('/api/auth/login',json={'email':'student@example.com','password':'wrong'}).status_code,401)
        self.assertEqual(self.client.post('/api/auth/login',json={'email':'student@example.com','password':'a-secure-password'}).status_code,200)
    def test_validation_and_origin(self):
        self.assertEqual(self.client.post('/api/auth/register',json={'email':'bad','name':'x','password':'short'}).status_code,400)
        self.assertEqual(self.client.get('/api/catalog?course=MCA&year=3').status_code,400)
        self.assertEqual(self.client.post('/api/auth/login',json={},headers={'Origin':'https://evil.example'}).status_code,403)
        self.assertEqual(self.client.post('/api/auth/login',data={'email':'x'}).status_code,415)
        self.register();self.assertEqual(self.client.post('/api/auth/register',json={'email':'student@example.com','name':'Student','password':'a-secure-password'}).status_code,409)
    def test_permissions_upload_download_and_scope(self):
        csrf=self.register();headers={'X-CSRF-Token':csrf}
        self.assertEqual(self.client.post('/api/admin/subjects',json={'code':'X','name':'X'},headers=headers).status_code,403)
        with sqlite3.connect(self.path) as db:db.execute("UPDATE users SET role='admin'")
        def upload(content):return self.client.post('/api/admin/materials',data={'subject':'PPM','kind':'notes','name':'My note','file':(io.BytesIO(content),'note.pdf')},headers=headers)
        self.assertEqual(upload(b'<html>bad</html>').status_code,400)
        pdf=b'%PDF-1.4\nTest fixture';r=upload(pdf);self.assertEqual(r.status_code,201)
        self.assertEqual(self.client.get(r.json['url']).data,pdf)
        self.assertIn('attachment',self.client.get(r.json['url']+'?download=1').headers['Content-Disposition'])
        self.assertEqual(len(self.client.get('/api/catalog').json['resources']['PPM']['notes']),1)
        self.assertEqual(self.client.get('/api/catalog?course=BCA').json['subjects'],[])
        self.assertEqual(self.client.get('/api/materials/missing').status_code,404)
        anonymous=self.app.test_client();self.assertEqual(anonymous.post('/api/admin/materials').status_code,401)
    def test_rate_limit(self):
        for _ in range(30):self.client.post('/api/auth/login',json={})
        self.assertEqual(self.client.post('/api/auth/login',json={}).status_code,429)

if __name__=='__main__':unittest.main()
