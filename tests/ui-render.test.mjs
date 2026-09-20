import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { visibleRecord, owns } from '../public/lib/core.js';

test('화면 렌더링 스모크: 모든 화면·입력 폼과 두 지도 자리, 문자열 이스케이프',async()=>{
  // This is a JavaScript rendering smoke test, not browser or visual QA.
  const root={innerHTML:''},dialog={innerHTML:'',open:false,classList:{toggle(){}},showModal(){this.open=true;},close(){this.open=false;}};
  const document={hidden:true,querySelector:s=>s==='#app'?root:s==='#dialog'?dialog:null,addEventListener(){}};
  const user={id:'one',name:'테스트교사',email:'one@example.test',department_id:'academic',role:'admin',active:true};
  const today='2026-09-21';
  const records=['notice','event','deadline','broadcast','academic','special'].map((kind,i)=>({
    id:String(i),kind,title:`${kind} <img onerror=alert(1)>`,content:'첫 줄\n다음 줄',channel:'all',department_id:'academic',department_name:'교무기획부',importance:'normal',state:'published',publish_at:'2026-09-01T00:00:00.000Z',expire_at:null,event_date:kind==='notice'?null:today,end_date:kind==='notice'?null:today,start_time:'10:00',end_time:'11:00',location:'회의실',link:'',created_by:'one',author_name:'테스트교사',attachments:[],version:1
  }));
  records[1].series_id='series-1';records[1].series_index=2;records[1].series_total=6; // 행사(event)를 반복 회차로
  const data={today,server_time:'2026-09-21T00:00:00.000Z',school_name:'테스트중학교',demo:true,departments:[{id:'academic',name:'교무기획부'}],staff:[{id:'one',name:'테스트교사',department_id:'academic'},{id:'two',name:'두번째교사',department_id:'academic'}],records,
    meals:[{id:'meal',date:today,menu:'밥\n국',allergens:'대두',note:'',created_by:'one',version:1}],
    duties:[{id:'duty',date:today,entrance_staff_id:'one',inside_staff_id:'two',entrance_name:'테스트교사',inside_name:'두번째교사',note:'',publish_at:'2026-09-01T00:00:00.000Z',created_by:'one',version:1}],
    holidays:[{date:'2026-09-23',name:'테스트휴업일 <b>'}]
  };
  data.user=user;data.staffAll=data.staff;data.logo_url=null;
  const db={me:user,auth:{session:async()=>user,onChange(){}},info:async()=>({school_name:'테스트중학교',app_name:'오늘의 테스트',logo:false}),bootstrap:async()=>data,admin:{staff:async()=>[user],logs:async()=>[],roster:async()=>[{email:'new@school.example',name:'새교사',department_id:'academic',role:'staff'}]},imports:{dutyTemplate:()=>'',scheduleTemplate:()=>''},records:{},meals:{},duties:{},attachments:{}};
  const source=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).split(String.fromCharCode(10)).filter(l=>!l.startsWith('import ')).join(String.fromCharCode(10));
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const run=new AsyncFunction('document','window','navigator','setInterval','createData','validateRepeat','occurrences','visibleRecord','owns',source+String.fromCharCode(10)+'return {S,render,recordForm,mealForm,dutyForm,userForm,detail,importDialog,importPreview,askDelete};');
  const ui=await run(document,{addEventListener(){},SCHOOL_CONFIG:{},supabase:{}},{},()=>0,()=>db,()=>null,()=>[],visibleRecord,owns);
  assert.match(root.innerHTML,/식당 입구/);assert.match(root.innerHTML,/식당 내부/);
  assert.match(root.innerHTML,/테스트교사/);assert.match(root.innerHTML,/두번째교사/);
  assert.ok(!root.innerHTML.includes('<img onerror='));assert.match(root.innerHTML,/&lt;img onerror=/);
  for(const page of ['notices','calendar','duties','manage','admin']){ui.S.page=page;ui.S.manage=records;ui.S.users=[user];ui.render();assert.ok(root.innerHTML.length>1000);}
  ui.S.page='duties';ui.render();assert.match(root.innerHTML,/duty-table/);assert.match(root.innerHTML,/식당 입구/);assert.match(root.innerHTML,/식당 내부/);
  assert.match(root.innerHTML,/휴업일 · 테스트휴업일 &lt;b&gt;/);assert.ok(!root.innerHTML.includes('테스트휴업일 <b>')); // 휴업일 표시 + 이스케이프
  ui.S.page='calendar';ui.render();assert.match(root.innerHTML,/cal-holiday/);assert.match(root.innerHTML,/↻ event/); // 달력 휴업일·반복 표시
  ui.S.page='admin';ui.render();assert.match(root.innerHTML,/holiday-form/);assert.match(root.innerHTML,/delete-holiday/);
  ui.S.page='home';ui.S.view='week';ui.render();assert.match(root.innerHTML,/week-grid/);
  ui.recordForm();assert.match(dialog.innerHTML,/record-form/);assert.match(dialog.innerHTML,/repeat_freq/);assert.equal((dialog.innerHTML.match(/name="repeat_weekday"/g)||[]).length,7);
  ui.recordForm(records[1]);assert.match(dialog.innerHTML,/name="scope"/);assert.match(dialog.innerHTML,/3\/6회차/);assert.ok(!dialog.innerHTML.includes('repeat_freq')); // 수정 화면: 범위 선택, 반복 설정 없음
  ui.detail('1');assert.match(dialog.innerHTML,/반복 · 3\/6회차/);
  ui.askDelete('자료 삭제','confirm-delete-record','1');assert.equal((dialog.innerHTML.match(/name="del-scope"/g)||[]).length,3);
  ui.askDelete('자료 삭제','confirm-delete-record','0');assert.ok(!dialog.innerHTML.includes('del-scope')); // 단일 안내는 범위 선택 없음
  ui.importDialog('duties');assert.match(dialog.innerHTML,/import-file-form/);assert.match(dialog.innerHTML,/data-type="duties" data-month="2026-09"/);assert.match(dialog.innerHTML,/두번째교사\(교무기획부\)/);
  ui.importPreview({type:'duties',file:'a.csv',summary:{total:3,valid:2,invalid:1,skipped:0,duplicates:1},rows:[
    {n:2,date:today,entrance:{id:'one',name:'테스트교사',department_name:'교무기획부'},inside:{id:'two',name:'두번째교사',department_name:'교무기획부'},note:'',errors:[],warnings:[],existing:{entrance_name:'옛사람',inside_name:'담당자 미지정',editable:true}},
    {n:3,date:'2026-09-22',entrance:null,inside:null,note:'',errors:["'없는사람 <x>' 교직원을 찾을 수 없습니다."],warnings:[],existing:null},
    {n:4,date:'2026-09-23',entrance:{id:'one',name:'테스트교사',department_name:''},inside:null,note:'',errors:[],warnings:['휴업일'],existing:null}]});
  assert.match(dialog.innerHTML,/import-commit-form/);assert.match(dialog.innerHTML,/현재 옛사람 \/ 담당자 미지정 → 파일 테스트교사 \/ 두번째교사/);assert.match(dialog.innerHTML,/name="duplicate"/);assert.match(dialog.innerHTML,/name="skip_invalid"/);
  assert.ok(!dialog.innerHTML.includes('<x>'));assert.match(dialog.innerHTML,/&lt;x&gt;/);
  ui.importPreview({type:'schedule',file:'b.xlsx',summary:{total:1,valid:1,invalid:0,skipped:0,duplicates:0},rows:[{n:2,kind:'holiday',date:'2026-10-09',end_date:null,title:'한글날',start_time:null,end_time:null,location:'',errors:[],warnings:[],existing:null}]});
  assert.match(dialog.innerHTML,/휴업일/);assert.ok(!dialog.innerHTML.includes('name="duplicate"'));
  ui.recordForm();
  ui.mealForm(null);assert.match(dialog.innerHTML,/meal-form/);
  ui.dutyForm(null);assert.equal((dialog.innerHTML.match(/name="entrance_staff_id"/g)||[]).length,1);assert.equal((dialog.innerHTML.match(/name="inside_staff_id"/g)||[]).length,1);
  ui.userForm('one');assert.match(dialog.innerHTML,/user-form/);assert.match(dialog.innerHTML,/one@example.test/);
  ui.S.roster=[{email:'new@school.example',name:'새교사',department_id:'academic',role:'staff'}];ui.S.page='admin';ui.render();assert.match(root.innerHTML,/roster-form/);assert.match(root.innerHTML,/새교사/);assert.match(root.innerHTML,/미가입/);
  ui.detail('0');assert.ok(!dialog.innerHTML.includes('<img onerror='));
});
