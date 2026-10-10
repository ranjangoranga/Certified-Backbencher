import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from '../backend/config.js';
import {run,get,transaction} from '../backend/db.js';
transaction(()=>{
  run("INSERT OR IGNORE INTO colleges(slug,name) VALUES ('kiit','KIIT University')");
  const college=get("SELECT id FROM colleges WHERE slug='kiit'").id;
  for(const [code,years] of [['BBA',3],['BCA',3],['MCA',2]]) {
    run('INSERT OR IGNORE INTO courses(college_id,code,name) VALUES (?,?,?)',college,code,code);
    const course=get('SELECT id FROM courses WHERE college_id=? AND code=?',college,code).id;
    for(let year=1;year<=years;year++)run('INSERT OR IGNORE INTO course_years(course_id,year_number) VALUES (?,?)',course,year);
  }
  const year=get("SELECT y.id FROM course_years y JOIN courses c ON c.id=y.course_id WHERE c.college_id=? AND c.code='BBA' AND y.year_number=1",college).id;
  const legacy=JSON.parse(fs.readFileSync(path.join(ROOT,'database/legacy-resources.json'),'utf8'));
  for(const subject of legacy.subjects) {
    run('INSERT OR IGNORE INTO subjects(year_id,code,name,description,color) VALUES (?,?,?,?,?)',year,subject.code,subject.name,subject.description,subject.color);
    const id=get('SELECT id FROM subjects WHERE year_id=? AND code=?',year,subject.code).id;
    for(const [type,files]of Object.entries(legacy.resources[subject.code]))for(const file of files) {
      const key=file.url.match(/\/file\/d\/([^/]+)/)?.[1]||file.url;
      run('INSERT OR IGNORE INTO resources(subject_id,type,name,description,source_key) VALUES (?,?,?,?,?)',id,type,file.name,file.description||'',key);
    }
  }
});
console.log('Seed complete: KIIT, BBA/BCA/MCA, eight course-years and existing BBA Year 1 resources.');
