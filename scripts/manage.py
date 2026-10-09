"""Local administration; never expose these operations as public endpoints."""
import argparse
import hashlib
import json
import sqlite3
import sys
import time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app import app

p=argparse.ArgumentParser();sub=p.add_subparsers(dest='action',required=True)
s=sub.add_parser('seed');s.add_argument('--materials',type=Path,default=Path('seed/materials'))
s=sub.add_parser('promote-admin');s.add_argument('email')
s=sub.add_parser('backup');s.add_argument('destination',type=Path)
a=p.parse_args();db=sqlite3.connect(app.config['DATABASE']);db.execute('PRAGMA foreign_keys=ON')
if a.action=='promote-admin':
    cur=db.execute("UPDATE users SET role='admin' WHERE email=?",(a.email.strip().lower(),));db.commit()
    if not cur.rowcount:sys.exit('Register this email first. No account changed.')
    print('Admin access enabled for registered account.')
elif a.action=='backup':
    a.destination.parent.mkdir(parents=True,exist_ok=True)
    with sqlite3.connect(a.destination) as dest:db.backup(dest)
    print('Backup complete. Keep this private: it contains accounts and sessions.')
else:
    if not a.materials.is_dir():sys.exit('Extract the private migration archive before seeding; or provide --materials PATH.')
    subjects=json.loads(Path('seed/subjects.json').read_text())
    for s in subjects:db.execute('INSERT OR IGNORE INTO subjects VALUES(?,?,?,?,?,?,?)',('BBA',1,1,s['code'],s['name'],s['description'],s['color']))
    count=0
    for meta in a.materials.glob('*.json'):
        d=json.loads(meta.read_text());content=meta.with_suffix('.bin').read_bytes();mime=d['mime']
        if mime=='application/pdf' and not content.startswith(b'%PDF-'):raise ValueError('Invalid PDF: '+meta.name)
        if mime=='application/vnd.openxmlformats-officedocument.presentationml.presentation' and not content.startswith(b'PK'):raise ValueError('Invalid presentation: '+meta.name)
        if mime not in ('application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation'):raise ValueError('Unexpected type: '+mime)
        db.execute('INSERT OR IGNORE INTO materials VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(d['id'],d['id'],'BBA',1,1,d['subject'],d['kind'],d['name'],d['description'],d['filename'],mime,hashlib.sha256(content).hexdigest(),content,int(time.time())));count+=1
    db.commit();print(f'Imported {count} study files. Re-running is safe and does not overwrite accounts or materials.')
db.close()
