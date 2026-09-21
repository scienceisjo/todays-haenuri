import { createData } from './lib/data.js';
import { validateRepeat, occurrences } from './lib/series.js';
import { visibleRecord, owns, validateRecord } from './lib/core.js';
const $=s=>document.querySelector(s), root=$('#app'), dialog=$('#dialog');
const db=createData(window.SCHOOL_CONFIG, window.supabase);
const S={user:null,data:null,all:[],roster:[],date:'',view:'today',page:'home',manage:[],users:[],logs:[],search:'',kind:'',dep:'',offline:false,lastSync:'',serverOffset:0,dutyMonth:'',dutyUnassigned:false};
const labels={notice:'공지사항',event:'행사·회의',deadline:'제출 기한',broadcast:'방송 안내',academic:'학사 일정',special:'창체 시간표'};
const importance={normal:'일반',important:'중요',urgent:'긴급'};
const paths={
 calendar:'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2',
 home:'m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
 notice:'M4 4h16v17H4zM8 9h8M8 13h8M8 17h5',
 clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
 bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
 users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M17 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87',
 meal:'M3 3v6a3 3 0 0 0 6 0V3M6 3v19M20 3c-5 0-6 10 0 10V3m0 10v9',
 broadcast:'m3 9 5 0 9-5v16l-9-5H3zM8 15l2 6M21 8v8',
 file:'M14 2H5v20h14V7zM14 2v6h5M8 13h8M8 17h5',
 folder:'M3 7V4h6l2 3h10v14H3z',
 refresh:'M20 7v5h-5M4 17v-5h5M6.1 6a8 8 0 0 1 13.1 2M4.8 16A8 8 0 0 0 18 18',
 plus:'M12 5v14M5 12h14', check:'m5 12 4 4L19 6',
 logout:'M9 21H3V3h6M9 12h13m-5-5 5 5-5 5', settings:'M4 7h16M4 17h16M8 4v6M16 14v6',
 close:'m6 6 12 12M18 6 6 18', chevron:'m9 5 7 7-7 7', search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
 edit:'m16 3 5 5-12 12-6 1 1-6zM14 5l5 5', download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5'
};
const icon=name=>`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.notice}"/></svg>`;
const logoSrc=info=>info?.logo_url||'./logo.png';
function setFavicon(info){const link=document.querySelector('link[rel=icon]');if(link)link.href=logoSrc(info);}
const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const now=()=>new Date(Date.now()+S.serverOffset);
const today=()=>new Date(now().getTime()+9*3600000).toISOString().slice(0,10);
const shift=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const days=(a,b)=>Math.round((Date.parse(a)-Date.parse(b))/86400000);
const dateLabel=(day,long=false)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',...(long?{year:'numeric'}:{}),month:'long',day:'numeric',weekday:'long'}).format(new Date(day+'T00:00:00+09:00'));
const shortDate=day=>day?day.slice(5).replace('-','.'):'날짜 없음';
const koreaInput=value=>value?new Date(new Date(value).getTime()+9*3600000).toISOString().slice(0,16):'';
const fromInput=value=>value?new Date(value+':00+09:00').toISOString():null;
const fmtTime=value=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
const canEdit=row=>S.user.role==='admin'||row.created_by===S.user.id;
// 전 교직원 공용 계정(학교 설정의 shared_login_email)으로 들어왔는지. 공용 계정은 비밀번호를 못 바꾸게 하고, 안내마다 부서를 고르게 한다
const isShared=()=>!!S.data?.shared_login&&S.user?.email?.toLowerCase()===S.data.shared_login;
const byId=id=>[...(S.data?.records||[]),...S.manage].find(r=>r.id===id);
const sorted=rows=>[...rows].sort((a,b)=>(a.event_date||'').localeCompare(b.event_date||'')||(a.start_time||'99:99').localeCompare(b.start_time||'99:99'));
const onDay=(r,date=S.date)=>r.event_date<=date&&(r.end_date||r.event_date)>=date;
const badge=r=>r.importance!=='normal'?`<span class="pill ${h(r.importance)}">${importance[r.importance]}</span>`:'';
let toastTimer;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3500);}
function downloadText(name,text,mime='text/csv;charset=utf-8'){const url=URL.createObjectURL(new Blob([text],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
async function signOutToLogin(){S.user=null;S.data=null;S.all=[];S.manage=[];S.users=[];S.logs=[];S.roster=[];if(dialog.open)dialog.close();await showLogin();}
async function refresh({silent=false}={}){
  try{
    const data=await db.bootstrap();S.user=data.user;S.serverOffset=Date.parse(data.server_time)-Date.now();
    S.all=data.records;data.records=S.all.filter(r=>visibleRecord(r,data.user,data.server_time));S.manage=S.all.filter(r=>owns(r,data.user));
    S.data=data;S.offline=false;S.lastSync=data.server_time;
    if(!S.date||S.view==='today')S.date=data.today;else if(S.view==='tomorrow')S.date=shift(data.today,1);
    if(S.page==='admin')await loadAdmin();render();
    if(!silent)toast('최신 안내를 불러왔습니다.');
  }catch(e){if(e.status===401){await signOutToLogin();toast(e.message);}else{S.offline=true;if(S.data)render();else root.innerHTML=`<main class="loading"><p>${h(e.message)}</p><button data-action="retry">다시 불러오기</button></main>`;if(!silent)toast(e.message);}}
}
function card(title,name,content,action='',count=''){return `<section class="card"><div class="card-head"><h2>${icon(name)}${title}${count!==''?`<span class="count">${count}</span>`:''}</h2>${action}</div><div class="card-body">${content||'<p class="empty">등록된 안내가 없습니다.</p>'}</div></section>`;}
const more=(kind,label='전체 보기')=>`<button class="ghost" data-action="filter-kind" data-kind="${kind}">${label}</button>`;
function render(){
  if(!S.user||!S.data)return;
  const appName=S.data.app_name||'오늘의 학교';document.title=appName;setFavicon(S.data);
  const names={home:appName,notices:'안내 모아보기',calendar:'전체 일정',duties:'급식지도 월간표',manage:S.user.role==='admin'?'게시물 관리':'내가 작성한 안내',admin:'학교 설정'};
  root.innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand"><img src="${logoSrc(S.data)}" alt=""><span>${h(appName)}</span></div>
    <nav class="nav" aria-label="주 메뉴">${[['home','home',appName],['notices','notice','안내 모아보기'],['calendar','calendar','전체 일정'],['duties','users','급식지도'],['manage','folder','작성글 관리'],...(S.user.role==='admin'?[['admin','settings','학교 설정']]:[])].map(([page,ic,label])=>`<button data-action="nav" data-page="${page}" class="${S.page===page?'active':''}" title="${label}" ${S.page===page?'aria-current="page"':''}>${icon(ic)}<span>${label}</span></button>`).join('')}</nav>
    <div class="sidebar-bottom"><div class="metadata">교직원을 위한<br>우리 학교의 하루</div><div class="sidebar-line"></div><div class="account"><div class="avatar">${h(S.user.name[0])}</div><div><div class="small">${h(S.user.name)}${isShared()?'':' 선생님'}</div><div class="metadata">${isShared()?'전 교직원 공용 계정':h(S.data.departments.find(d=>d.id===S.user.department_id)?.name||'교직원')}</div></div></div><button class="ghost btn-icon" data-action="install-app" id="install-btn" ${window.__installPrompt?'':'hidden'}>${icon('download')}<span>바탕화면 앱으로 설치</span></button>${isShared()?'':`<button class="ghost btn-icon" data-action="password">${icon('settings')}<span>비밀번호 변경</span></button>`}<button class="ghost btn-icon" data-action="logout">${icon('logout')}<span>로그아웃</span></button></div></aside>
    <main class="workspace"><header class="topbar"><div><div class="school-label">${h(S.data.school_name)} ${S.data.demo?'<span class="demo-badge">예시 데이터</span>':''}</div><h1>${S.page==='home'?dateLabel(S.date):names[S.page]}</h1></div><div class="top-actions"><div class="refresh-label">마지막 확인 ${S.lastSync?fmtTime(S.lastSync):'—'}<br><span id="live-clock">${fmtTime(now())}</span></div><button class="btn-icon" data-action="refresh" aria-label="새로고침">${icon('refresh')}</button><button class="primary btn-icon" data-action="create">${icon('plus')}안내 등록</button><button class="ghost mobile-logout" data-action="logout" title="로그아웃" aria-label="로그아웃">${icon('logout')}</button></div></header>
    ${S.offline?'<div class="offline" role="alert">연결이 끊겨 마지막으로 확인한 자료를 표시합니다. 새 안내와 일정 변경이 반영되지 않을 수 있습니다. <button data-action="refresh">다시 연결</button></div>':''}
    <div id="page-content">${S.page==='home'?homeView():S.page==='calendar'?calendarView():S.page==='duties'?dutiesView():S.page==='admin'?adminView():listView()}</div>
    <footer class="footer-meta"><span>${S.data.demo?'예시 데이터 · 실제 학교 일정과 다릅니다.':'학교 시간 기준 · 한국 표준시'}</span><span>문의: 안내별 담당 부서 · ${S.user.role==='admin'?'관리자':'교직원'} 로그인</span></footer></main></div>`;
}
function periodControls(){return `<div class="page-controls"><div class="segmented" role="group" aria-label="조회 기간">${[['today','오늘'],['tomorrow','내일'],['week','이번 주']].map(([v,l])=>`<button data-action="period" data-view="${v}" class="${S.view===v?'active':''}" aria-pressed="${S.view===v}">${l}</button>`).join('')}</div><div class="date-control"><span class="small muted">날짜 선택</span><input type="date" value="${S.date}" id="date-picker" aria-label="조회 날짜"><button class="ghost" data-action="nav" data-page="calendar">전체 일정 →</button></div></div>`;}
function homeView(){
  const r=S.data.records,t=S.date;if(S.view==='week')return periodControls()+weekView();
  const events=sorted(r.filter(x=>x.kind==='event'&&onDay(x))), broadcasts=sorted(r.filter(x=>x.kind==='broadcast'&&onDay(x))), deadlines=sorted(r.filter(x=>x.kind==='deadline'&&x.event_date>=t&&x.event_date<=shift(t,7))), globals=r.filter(x=>x.kind==='notice'&&x.channel==='all'), departments=r.filter(x=>x.kind==='notice'&&x.channel==='department'), special=r.filter(x=>x.kind==='special'&&onDay(x)), nextSpecial=special.length?null:sorted(r.filter(x=>x.kind==='special'&&x.event_date>t))[0], urgent=r.find(x=>x.importance==='urgent'&&(!x.event_date||onDay(x)));
  const meal=S.data.meals.find(x=>x.date===t),duty=S.data.duties.find(x=>x.date===t);
  const row=x=>`<button class="row-button" data-action="detail" data-id="${x.id}"><div class="row-line">${badge(x)}<span class="row-title">${h(x.title)}</span>${x.read?'':`<span class="pill">새 안내</span>`}</div><div class="row-meta">${h(x.department_name||'교직원')} · ${h(x.author_name)}</div></button>`;
  const eventContent=events.slice(0,4).map(x=>`<button class="row-button schedule-row" data-action="detail" data-id="${x.id}"><span class="schedule-time">${h(x.start_time||'종일')}</span><div class="schedule-info"><div class="row-title">${h(x.title)}</div><div class="row-meta">${h(x.location||x.department_name||'')}</div></div></button>`).join('');
  const dueContent=deadlines.slice(0,3).map(x=>{const d=days(x.event_date,t);return `<button class="row-button deadline-row" data-action="detail" data-id="${x.id}"><span class="dday ${d===0?'today':''}">${d===0?'오늘':`D-${d}`}</span><div><div class="row-title">${h(x.title)}</div><div class="row-meta">${shortDate(x.event_date)} ${h(x.start_time||'')} · ${h(x.department_name||'')}</div></div></button>`;}).join('');
  return periodControls()+`${urgent?`<div class="notice-strip">${icon('bell')}<span class="pill">꼭 확인</span><button data-action="detail" data-id="${urgent.id}">${h(urgent.title)}</button>${icon('chevron')}</div>`:''}
  <div class="dashboard"><div class="column">${card('행사·회의','clock',eventContent,more('event'),events.length)}${card('교직원 전체 공지','notice',globals.slice(0,3).map(row).join(''),more('notice'))}${card('부서별 안내','folder',departments.slice(0,3).map(x=>`<button class="row-button" data-action="detail" data-id="${x.id}"><div class="dept-row"><span class="dept-label">${h(x.department_name||'교직원')}</span><span class="row-title">${h(x.title)}</span></div></button>`).join(''),more('notice'))}</div>
  <div class="column">${card('챙겨야 할 제출 기한','check',dueContent,more('deadline'),deadlines.length)}${card('방송 안내','broadcast',broadcasts.slice(0,3).map(x=>`<button class="row-button" data-action="detail" data-id="${x.id}"><div class="row-line"><span class="schedule-time">${h(x.start_time||'종일')}</span><span class="row-title">${h(x.title)}</span></div><div class="row-meta">${h(x.content.slice(0,55))}</div></button>`).join(''),more('broadcast'))}
  <section class="card special-card"><div class="card-head"><h2>${icon('file')}창체의 날 시간표</h2>${more('special','전체')}</div><div class="card-body">${special.length?`<div class="special-title">${h(special[0].title)}</div><p class="special-body">${h(special[0].content.split('\n').slice(0,3).join('\n'))}</p><button class="special-open btn-icon" data-action="detail" data-id="${special[0].id}">${icon('file')}교육 내용·첨부 시간표 보기</button>${special.length>1?`<p class="metadata mt">그 외 ${special.length-1}건</p>`:''}`:nextSpecial?`<div class="special-next"><span class="dday">D-${days(nextSpecial.event_date,t)}</span><div><div class="special-title">${h(nextSpecial.title)}</div><div class="row-meta">${dateLabel(nextSpecial.event_date)}</div></div></div><p class="special-body">${h(nextSpecial.content.split('\n').slice(0,3).join('\n'))}</p><button class="special-open btn-icon" data-action="detail" data-id="${nextSpecial.id}">${icon('file')}다음 창체의 날 자세히</button>`:'<p class="empty">등록된 창체 시간표가 없습니다.</p>'}</div></section></div>
  <div class="column"><section class="card meal-card"><div class="card-head"><h2>${icon('meal')}${S.view==='tomorrow'?'내일':'오늘'}의 급식</h2><button class="ghost" data-action="meal" data-id="${meal?.id||''}">${meal?'자세히':'등록'}</button></div><div class="card-body">${meal?`<div class="meal-header">중식 · ${shortDate(t)}</div><ul class="menu">${meal.menu.split('\n').filter(Boolean).map(v=>`<li>${h(v)}</li>`).join('')}</ul><div class="meal-footer"><button class="ghost" data-action="meal" data-id="${meal.id}">알레르기 정보·비고 확인</button></div>`:'<p class="empty">급식 정보가 등록되지 않았습니다.</p>'}</div></section>
  <section class="card duty-card"><div class="card-head"><h2>${icon('users')}${S.view==='tomorrow'?'내일':'금일'} 급식지도</h2><div class="row-actions"><button class="ghost" data-action="nav" data-page="duties">월간표</button><button class="ghost" data-action="duty" data-id="${duty?.id||''}">${duty?'자세히':'등록'}</button></div></div><div class="card-body">${[['식당 입구',duty?.entrance_name,duty?.entrance_staff_id],['식당 내부',duty?.inside_name,duty?.inside_staff_id]].map(([place,name,id])=>`<div class="duty-slot ${id===S.user.id?'mine':''}"><span>${place}</span><strong>${h(name||'담당자 미지정')}${id===S.user.id?' · 나':''}</strong></div>`).join('')}${duty?.publish_at>now().toISOString()?`<p class="metadata">예약 게시 · ${shortDate(koreaInput(duty.publish_at).slice(0,10))} ${fmtTime(duty.publish_at)} 공개</p>`:''}${duty?.note?`<p class="metadata">${h(duty.note)}</p>`:''}</div></section>
  ${card('학사 일정','calendar',miniCalendar(),'<button class="ghost" data-action="nav" data-page="calendar">전체</button>')}</div></div>`;
}
function calendarDates(date){const first=date.slice(0,7)+'-01',start=shift(first,-new Date(first+'T00:00:00Z').getUTCDay());return Array.from({length:42},(_,i)=>shift(start,i));}
function miniCalendar(){const academic=S.data.records.filter(r=>r.kind==='academic');return `<div class="mini-month">${Number(S.date.slice(0,4))}년 ${Number(S.date.slice(5,7))}월</div><div class="mini-grid">${['일','월','화','수','목','금','토'].map(d=>`<span>${d}</span>`).join('')}${calendarDates(S.date).map(d=>`<button data-action="pick-day" data-date="${d}" class="${d===S.date?'selected':academic.some(r=>onDay(r,d))?'marked':d.slice(0,7)!==S.date.slice(0,7)?'outside':''} ${holidayOf(d)?'holiday':''}" aria-label="${dateLabel(d)}${holidayOf(d)?' 휴업일':''}">${Number(d.slice(8))}</button>`).join('')}</div><div class="upcoming">${sorted(academic.filter(r=>(r.end_date||r.event_date)>=S.date)).slice(0,2).map(r=>`<div>${shortDate(r.event_date)}　${h(r.title)}</div>`).join('')||'예정된 학사 일정이 없습니다.'}</div>`;}
function weekView(){const day=new Date(S.date+'T00:00:00Z').getUTCDay(),start=shift(S.date,day===0?-6:1-day);return `<div class="week-grid">${Array.from({length:7},(_,i)=>shift(start,i)).map(date=>{
  const events=sorted(S.data.records.filter(r=>r.kind!=='notice'&&onDay(r,date))),d=S.data.duties.find(x=>x.date===date);
  return `<section class="card week-day"><div><h2>${dateLabel(date)}</h2>${holidayChip(date)}<button class="ghost small" data-action="pick-day" data-date="${date}">하루 보기 →</button></div><div class="week-items"><div class="week-duty"><span>식당 입구 <strong>${h(d?.entrance_name||'담당자 미지정')}</strong></span><span>식당 내부 <strong>${h(d?.inside_name||'담당자 미지정')}</strong></span>${d?`<button data-action="duty" data-id="${d.id}">${d.publish_at>now().toISOString()?'예약 확인':'담당자 확인'}</button>`:''}</div>${events.map(r=>`<button data-action="detail" data-id="${r.id}"><span class="pill">${labels[r.kind]}</span> ${h(r.start_time||'종일')}　${h(r.title)}</button>`).join('')||'<p class="empty">등록된 일정이 없습니다.</p>'}</div></section>`;
}).join('')}</div>`;}
function calendarView(){const dates=calendarDates(S.date),r=S.data.records.filter(x=>x.kind!=='notice');return `<div class="page-controls"><div class="flex"><button data-action="month" data-step="-1" aria-label="이전 달">←</button><strong>${S.date.slice(0,4)}년 ${Number(S.date.slice(5,7))}월</strong><button data-action="month" data-step="1" aria-label="다음 달">→</button></div><div class="flex"><button data-action="pick-day" data-date="${today()}">오늘로</button><button class="btn-icon" data-action="import" data-type="schedule">${icon('file')}CSV·엑셀 일괄 등록</button></div></div><div class="calendar">${['일','월','화','수','목','금','토'].map(d=>`<div class="cal-weekday">${d}</div>`).join('')}${dates.map(d=>{const hol=holidayOf(d);return `<div class="cal-day ${d===today()?'today':''} ${d.slice(0,7)!==S.date.slice(0,7)?'outside':''} ${hol?'holiday':''}"><button class="day-number" data-action="pick-day" data-date="${d}" aria-label="${dateLabel(d)} 보기">${Number(d.slice(8))}</button>${hol?`<div class="cal-holiday">${h(hol.name||'휴업일')}</div>`:''}${sorted(r.filter(x=>onDay(x,d))).slice(0,4).map(x=>`<button class="cal-event ${x.kind==='deadline'?'deadline':''}" data-action="detail" data-id="${x.id}">${x.series_id?'↻ ':''}${h(x.title)}</button>`).join('')}${r.filter(x=>onDay(x,d)).length>4?`<button class="ghost small" data-action="pick-day" data-date="${d}">더 보기</button>`:''}</div>`;}).join('')}</div>`;}
function stateLabel(r){if(r.deleted_at)return '삭제됨';if(r.state==='draft')return '임시저장';if(r.state==='hidden')return '숨김';if(r.publish_at>now().toISOString())return '예약';if(r.expire_at&&r.expire_at<=now().toISOString())return '게시 종료';return '게시 중';}
function filtered(){const all=S.page==='manage'?S.manage:S.data.records;return all.filter(r=>(!S.kind||r.kind===S.kind)&&(!S.dep||r.department_id===S.dep)&&(!S.search||`${r.title} ${r.content} ${r.author_name}`.toLowerCase().includes(S.search.toLowerCase())));}
function listView(){return `<div class="filterbar"><input id="search-input" type="search" placeholder="제목·내용·작성자 검색" aria-label="안내 검색" value="${h(S.search)}"><select id="kind-filter" aria-label="안내 유형"><option value="">모든 유형</option>${Object.entries(labels).map(([k,v])=>`<option value="${k}" ${S.kind===k?'selected':''}>${v}</option>`).join('')}</select><select id="department-filter" aria-label="부서"><option value="">모든 부서</option>${S.data.departments.map(d=>`<option value="${d.id}" ${S.dep===d.id?'selected':''}>${h(d.name)}</option>`).join('')}</select></div>${S.page==='manage'?'<p class="muted small">예약·임시저장·게시가 끝난 안내도 여기에서 확인할 수 있습니다.</p>':''}<section class="card list-card mt" id="record-list">${listRows()}</section>`;}
function listRows(){return filtered().map(r=>`<article class="record-item"><button data-action="detail" data-id="${r.id}"><div class="flex"><span class="pill">${labels[r.kind]}</span>${badge(r)}${S.page==='manage'?`<span class="pill dark">${stateLabel(r)}</span>`:''}</div><h3>${h(r.title)}</h3><div class="metadata">${h(r.department_name||'교직원')} · ${h(r.author_name)}${r.event_date?` · ${shortDate(r.event_date)} ${h(r.start_time||'')}`:''}${r.state==='published'&&r.publish_at>now().toISOString()?` · 예약 ${shortDate(koreaInput(r.publish_at).slice(0,10))} ${fmtTime(r.publish_at)}`:''}</div></button>${S.page==='manage'?`<div class="actions">${r.deleted_at?(S.user.role==='admin'?`<button data-action="restore" data-id="${r.id}">복구</button>`:''):`<button data-action="edit-record" data-id="${r.id}">수정</button><button class="danger" data-action="delete-record" data-id="${r.id}">삭제</button>`}</div>`:''}</article>`).join('')||'<p class="empty">조건에 맞는 안내가 없습니다.</p>';}
async function loadAdmin(){const [users,logs,roster]=await Promise.all([db.admin.staff(),db.admin.logs(),db.admin.roster()]);S.users=users;S.logs=logs;S.roster=roster;}
function adminView(){return `<div class="admin-grid"><div class="column">${card('가입한 교직원','users',`<p class="small muted">명단에 등록된 이메일로 본인이 가입하면 여기에 나타납니다. 이름·부서·권한·사용 여부를 바꿀 수 있습니다. 비밀번호를 잊은 교직원은 로그인 화면의 ‘비밀번호를 잊었어요’를 쓰거나, 관리자가 Supabase 대시보드(Authentication)에서 재설정합니다.</p><div class="table-wrap mt"><table><thead><tr><th>이름</th><th>이메일</th><th>부서</th><th>권한</th><th>상태</th><th>관리</th></tr></thead><tbody>${S.users.map(u=>`<tr><td>${h(u.name)}</td><td class="metadata">${h(u.email)}</td><td>${h(S.data.departments.find(d=>d.id===u.department_id)?.name||'—')}</td><td>${u.role==='admin'?'관리자':'교직원'}</td><td>${u.active?'사용 중':'비활성'}</td><td><button data-action="edit-user" data-id="${u.id}">수정</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty">아직 가입한 교직원이 없습니다.</td></tr>'}</tbody></table></div>`,`<span class="metadata">${S.users.length}명</span>`)}
${card('교직원 명단 (가입 허용)','folder',`<p class="small muted">여기에 등록된 이메일만 가입할 수 있습니다. 명단에 적은 이름·부서가 가입 때 자동으로 들어갑니다.</p><div class="table-wrap mt"><table><thead><tr><th>이름</th><th>이메일</th><th>부서</th><th>권한</th><th></th></tr></thead><tbody>${S.roster.map(r=>{const joined=S.users.some(u=>u.email===r.email);return `<tr><td>${h(r.name)}</td><td class="metadata">${h(r.email)}</td><td>${h(S.data.departments.find(d=>d.id===r.department_id)?.name||'—')}</td><td>${r.role==='admin'?'관리자':'교직원'}${joined?' <span class="pill ok">가입</span>':' <span class="pill light">미가입</span>'}</td><td>${joined?'':`<button class="ghost" data-action="remove-roster" data-email="${h(r.email)}">빼기</button>`}</td></tr>`;}).join('')||'<tr><td colspan="5" class="empty">명단이 비어 있습니다. 아래에서 추가해주세요.</td></tr>'}</tbody></table></div>
<form id="roster-form" class="form-grid mt">${field('이메일','email','','email',{required:true})}${field('이름','name','','text',{required:true,extra:'maxlength="60"'})}${select('부서','department_id',[['','부서 없음'],...depOptions()],'')}${select('권한','role',[['staff','교직원'],['admin','관리자']],'staff')}<button type="submit">명단에 추가</button><div class="form-error full" role="alert"></div></form>
<details class="mt"><summary class="small">여러 명 한 번에 추가 (붙여넣기)</summary><form id="roster-bulk-form" class="form-grid mt-s"><div class="field full"><label for="f-bulk">한 줄에 한 명: 이메일, 이름, 부서(선택)</label><textarea id="f-bulk" name="bulk" rows="6" placeholder="hong@school.kr, 홍길동, 과학정보부&#10;kim@school.kr, 김새봄, 교무업무지원팀"></textarea><span class="help">엑셀에서 세 열을 복사해 붙여 넣어도 됩니다(탭 구분 인식). 부서명은 부서 관리의 이름과 같아야 합니다.</span></div><button type="submit">모두 추가</button><div class="form-error full" role="alert"></div></form></details>`,`<span class="metadata">${S.roster.length}명</span>`)}${card('최근 변경 기록','clock',`<div class="table-wrap"><table><thead><tr><th>시간</th><th>작성자</th><th>변경</th></tr></thead><tbody>${S.logs.slice(0,25).map(l=>`<tr><td>${shortDate(koreaInput(l.created_at).slice(0,10))} ${fmtTime(l.created_at)}</td><td>${h(l.user_name||'관리자')}</td><td>${h(logLabel(l.action))}${l.detail?`<div class="metadata">${h(l.detail)}</div>`:''}</td></tr>`).join('')}</tbody></table></div>`)}</div><div class="column">${card('학교 정보','settings',`<form id="school-form" class="form-grid"><div class="field full"><label for="school-name">학교명</label><input id="school-name" name="school_name" value="${h(S.data.school_name)}" required maxlength="60"></div><div class="field full"><label for="app-name">앱 이름</label><input id="app-name" name="app_name" value="${h(S.data.app_name||'')}" maxlength="40" placeholder="오늘의 해누리"><span class="help">사이드바·로그인·설치된 앱 이름에 쓰입니다. 비우면 학교명에서 자동으로 만듭니다.</span></div><button class="primary" type="submit">저장</button><div class="form-error full" role="alert"></div></form>`)}${card('학교 로고','file',`<div class="logo-preview"><img src="${logoSrc(S.data)}" alt="현재 로고"><div class="small">${S.data.logo?`올린 로고: ${S.data.logo_type==='image/png'?`PNG${S.data.logo_size?` ${S.data.logo_size}px`:''}`:'SVG'}`:'배포된 기본 로고(logo.png)를 쓰고 있습니다.'}</div></div><form id="logo-form" class="form-grid mt"><div class="field full"><label for="f-logo">로고 파일 (PNG 또는 SVG, 1MB 이하)</label><input id="f-logo" name="file" type="file" accept=".png,.svg" required><span class="help">사이드바·로그인·브라우저 탭에 바로 반영됩니다. Windows 설치 앱 아이콘은 배포 파일(logo.png)을 따릅니다.</span></div><div class="flex wrap"><button class="primary" type="submit">로고 올리기</button>${S.data.logo?'<button type="button" class="danger" data-action="delete-logo">기본 로고로 되돌리기</button>':''}</div><div class="form-error full" role="alert"></div></form>`)}${card('부서 관리','folder',`<div class="flex wrap">${S.data.departments.map(d=>`<span class="pill dept-pill">${h(d.name)} <button class="pill-x" data-action="delete-department" data-id="${d.id}" aria-label="${h(d.name)} 삭제">×</button></span>`).join('')}</div><form id="department-form" class="mt form-grid"><div class="field full"><label for="department-name">새 부서명</label><input id="department-name" name="name" required maxlength="60"></div><button type="submit">부서 추가</button><div class="form-error full" role="alert"></div></form>`)}${card('휴업일','calendar',`<p class="small muted">휴업일은 반복 일정 생성과 급식지도 양식에서 자동으로 제외되고, 달력과 월간표에 표시됩니다. 학사 일정 일괄 등록에서 유형을 ‘휴업일’로 적어도 등록됩니다.</p><div class="holiday-list mt">${(S.data.holidays||[]).map(x=>`<div class="holiday-row"><span><b>${h(x.date)}</b> ${h(x.name||'휴업일')}</span><button class="ghost" data-action="delete-holiday" data-date="${x.date}" aria-label="${h(x.date)} 휴업일 삭제">삭제</button></div>`).join('')||'<p class="empty">등록된 휴업일이 없습니다.</p>'}</div><form id="holiday-form" class="mt form-grid">${field('날짜','date','','date',{required:true})}${field('이름','name','','text',{extra:'maxlength="100"',help:'예: 개교기념일, 재량휴업일'})}<button type="submit">휴업일 추가</button><div class="form-error full" role="alert"></div></form>`)}${card('자료 내보내기','download',`<p class="small muted">공지·일정·급식·급식지도와 교직원 기본 정보를 내보냅니다. 비밀번호와 첨부파일 원본은 포함되지 않습니다.</p><button class="btn-link mt" data-action="export">JSON 파일 내려받기 →</button>`)}</div></div>`;}
function logLabel(a){const m={login:'로그인',records_insert:'안내 등록',records_update:'안내 수정',records_delete:'안내 삭제',records_restore:'안내 복구',meals_insert:'급식 등록',meals_update:'급식 변경',meals_delete:'급식 삭제',meal_duties_insert:'급식지도 등록',meal_duties_update:'급식지도 변경',meal_duties_delete:'급식지도 삭제',holidays_insert:'휴업일 저장',holidays_update:'휴업일 변경',holidays_delete:'휴업일 삭제',settings_insert:'학교 정보 변경',settings_update:'학교 정보 변경',attachments_insert:'파일 첨부',attachments_delete:'첨부 삭제',staff_insert:'교직원 가입',staff_update:'교직원 변경',roster_insert:'명단 추가',roster_update:'명단 변경',roster_delete:'명단 삭제',record_series_insert:'반복 일정 등록',record_create:'안내 등록',record_update:'안내 수정',record_delete:'안내 삭제',record_restore:'안내 복구',series_create:'반복 일정 등록',series_update:'반복 일정 수정',series_delete:'반복 일정 취소',duties_import:'급식지도 일괄 등록',schedule_import:'일정 일괄 등록',holiday_set:'휴업일 저장',holiday_delete:'휴업일 삭제',logo_set:'학교 로고 변경',logo_delete:'학교 로고 제거',attachment_create:'파일 첨부',attachment_delete:'첨부 삭제',duties_create:'급식지도 등록',duties_update:'급식지도 변경',duties_delete:'급식지도 삭제',meals_create:'급식 등록',meals_update:'급식 변경',meals_delete:'급식 삭제',user_create:'교직원 추가',user_update:'교직원 변경',settings_update:'학교 정보 변경',department_create:'부서 추가',data_export:'자료 내보내기',password_change:'비밀번호 변경'};return m[a]||a;}
function openDialog(title,body,footer='',{wide=false}={}){
  dialog.classList.toggle('wide',wide);
  dialog.innerHTML=`<header class="dialog-header"><h2 id="dialog-title">${h(title)}</h2><button class="ghost" data-action="close" aria-label="닫기">${icon('close')}</button></header><div class="dialog-body">${body}</div>${footer?`<footer class="dialog-footer">${footer}</footer>`:''}`;
  if(!dialog.open)dialog.showModal();
}
function field(label,name,value='',type='text',opts={}){return `<div class="field ${opts.full?'full':''}"><label for="f-${name}">${label}${opts.required?' *':''}</label>${type==='textarea'?`<textarea id="f-${name}" name="${name}" ${opts.required?'required':''} ${opts.extra||''}>${h(value)}</textarea>`:`<input id="f-${name}" name="${name}" type="${type}" value="${h(value)}" ${opts.required?'required':''} ${opts.extra||''}>`}${opts.help?`<span class="help">${opts.help}</span>`:''}</div>`;}
function select(label,name,values,selected='',full=false){return `<div class="field ${full?'full':''}"><label for="f-${name}">${label}</label><select id="f-${name}" name="${name}">${values.map(([v,l])=>`<option value="${h(v)}" ${String(v)===String(selected??'')?'selected':''}>${h(l)}</option>`).join('')}</select></div>`;}
const depOptions=()=>S.data.departments.map(d=>[d.id,d.name]);
const kindHints={notice:'제목만 적어도 바로 게시됩니다. 내용·첨부는 선택입니다.',event:'날짜와 시간을 정하면 그날 홈 화면의 행사·회의 칸에 나타납니다.',deadline:'마감 날짜를 정하면 7일 전부터 D-day 로 나타납니다.',broadcast:'방송 날짜·시간을 정하면 그날 방송 안내 칸에 나타납니다.',academic:'달력에 표시됩니다. 여러 날이면 세부 설정에서 종료 날짜를 넣어주세요.',special:'그날 홈 화면의 창체의 날 시간표 칸에 나타납니다. 교시별 운영을 내용에 적어주세요.'};
const dateLabels=k=>k==='deadline'?['마감 날짜','마감 시간']:k==='broadcast'?['방송 날짜','방송 시간']:['날짜','시작 시간'];
const submitLabels={now:'게시하기',schedule:'예약하기',draft:'임시저장',hidden:'저장'};
function recordForm(r=null,kind='notice'){
  const isEdit=!!r;kind=r?.kind||kind;
  const v=r||{kind,title:'',content:'',channel:'all',department_id:S.user.department_id,target_department_id:'',importance:'normal',event_date:S.date,end_date:'',start_time:'',end_time:'',location:'',link:'',state:'published',publish_at:now().toISOString(),expire_at:''};
  const mode=v.state==='draft'?'draft':v.publish_at>now().toISOString()?'schedule':v.state==='hidden'?'hidden':'now';
  const [dl,tl]=dateLabels(kind);
  const noDept=!S.user.department_id; // 공용 계정처럼 소속 부서가 없으면 부서 선택을 폼 앞쪽에 둔다
  // 수정할 때 세부 설정에 값이 있으면 펼쳐서 보여준다
  const advanced=isEdit&&!!(v.channel!=='all'||v.target_department_id||v.importance!=='normal'||v.end_date||v.end_time||v.link||mode!=='now'||v.expire_at);
  openDialog(isEdit?'안내 수정':'새 안내',`<form id="record-form" data-id="${r?.id||''}" data-version="${r?.version||''}">
    ${isEdit&&r.series_id?`<div class="form-grid mb">${select('적용 범위 (반복 일정 · '+((r.series_index??0)+1)+'/'+(r.series_total||'?')+'회차)','scope',[['single','이 회차만'],['following','이 회차부터 이후 회차 모두'],['all','시리즈 전체']],'single',true)}<span class="help full">이후·전체를 고르면 각 회차의 날짜는 그대로 두고 제목·내용·시간·장소·중요도만 함께 바뀝니다.</span></div>`:''}
    <div class="kind-picks" role="radiogroup" aria-label="안내 유형">${Object.entries(labels).map(([k,l])=>`<label class="chip-check"><input type="radio" name="kind" value="${k}" ${k===kind?'checked':''}>${l}</label>`).join('')}</div>
    <p class="help kind-hint" id="kind-hint">${kindHints[kind]}</p>
    <div class="form-grid">
      ${field('제목','title',v.title,'text',{required:true,full:true,extra:'maxlength="160" placeholder="예: 9월 교직원 회의 안내"'})}
      ${field('내용','content',v.content,'textarea',{full:true,extra:'rows="4" placeholder="필요할 때만 적어주세요 (선택)"'})}
      ${noDept?select('담당 부서 (공용 계정이라 안내마다 골라주세요)','department_id',[['','부서 없음 · 교직원 공통'],...depOptions()],v.department_id||'',true):''}
      <div class="date-row full ${kind==='notice'?'hidden':''}" id="date-row">${field(dl,'event_date',v.event_date||'','date')}${field(tl,'start_time',v.start_time||'','time')}${field('장소','location',v.location||'','text',{extra:'maxlength="200" placeholder="선택"'})}</div>
      <div class="field full"><label for="f-files">첨부파일 <span class="metadata">선택 · 파일별 10MB 이하 · PDF·이미지는 미리 보기</span></label><input id="f-files" name="files" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.hwp,.hwpx,.doc,.docx,.txt,.csv"></div>
      ${isEdit&&r.attachments?.length?`<div class="full field"><span class="label-text">기존 첨부파일</span>${r.attachments.map(a=>`<span class="small">${h(a.original_name)}</span>`).join('')}<span class="help">기존 파일 삭제는 안내 상세 화면에서 할 수 있습니다.</span></div>`:''}
    </div>
    <details class="more-box mt" ${advanced?'open':''}><summary>세부 설정 <span class="metadata">공지 구분 · 열람 대상 · 중요도 · 종료 날짜 · 링크 · 예약 · 반복</span></summary><div class="form-grid mt-s">
      ${select('공지 구분','channel',[['all','교직원 전체 공지'],['department','부서 안내']],v.channel)}${noDept?'':select('담당 부서','department_id',depOptions(),v.department_id)}
      ${select('열람 대상','target_department_id',[['','전체 교직원'],...depOptions()],v.target_department_id||'')}${select('중요도','importance',Object.entries(importance),v.importance)}
      ${field('종료 날짜','end_date',v.end_date||'','date',{help:'여러 날에 걸친 일정일 때'})}${field('종료 시간','end_time',v.end_time||'','time')}
      ${field('관련 링크','link',v.link||'','url',{full:true,extra:'placeholder="https://"'})}
      ${select('게시 방법','publish_mode',[['now','즉시 게시'],['schedule','예약 게시'],['draft','임시저장'],...(isEdit?[['hidden','숨김']]:[])],mode)}${field('예약 시각','publish_at',koreaInput(v.publish_at),'datetime-local',{help:'예약 게시일 때만 · 한국 시간'})}
      ${field('게시 종료','expire_at',koreaInput(v.expire_at),'datetime-local',{help:'비우면 계속 게시됩니다',full:true})}
      ${!isEdit?`<details class="field full repeat-box"><summary>반복 일정으로 등록 <span class="metadata">매주·매월 · 종료일 또는 횟수 · 휴업일 제외</span></summary><div class="form-grid mt-s">
        ${select('반복 주기','repeat_freq',[['none','반복 없음'],['weekly','매주'],['monthly','매월']],'none')}${field('간격','repeat_interval','1','number',{extra:'min="1" max="12"',help:'1 = 매주·매월, 2 = 격주·격월'})}
        <div class="field full"><span class="label-text">요일 (매주일 때 · 여러 개 가능, 비우면 시작 날짜의 요일)</span><div class="weekday-picks">${['일','월','화','수','목','금','토'].map((d,i)=>`<label class="chip-check"><input type="checkbox" name="repeat_weekday" value="${i}">${d}</label>`).join('')}</div></div>
        ${select('종료 방식','repeat_end',[['until','종료 날짜까지'],['count','횟수만큼']],'until')}${field('종료 날짜','repeat_until','','date')}${field('횟수','repeat_count','10','number',{extra:'min="1" max="200"'})}
        <label class="check full"><input type="checkbox" name="repeat_skip_holidays" checked>휴업일은 건너뛰기 (학교 설정의 휴업일 기준)</label>
        <span class="help full">회차마다 개별 일정으로 만들어져 회차별로 수정·취소할 수 있습니다. 반복 일정에는 첨부를 붙일 수 없으니 등록 후 회차를 열어 추가해주세요.</span></div></details>`:''}
    </div></details>
    <div class="form-error" role="alert"></div>
    <div class="dialog-footer"><span class="metadata grow">${isEdit?'':`다른 등록: <button type="button" class="link-btn" data-action="choose-type" data-kind="meal">급식</button> · <button type="button" class="link-btn" data-action="choose-type" data-kind="duty">급식지도</button> · <button type="button" class="link-btn" data-action="import" data-type="schedule">일정 파일(CSV·엑셀)</button> · <button type="button" class="link-btn" data-action="import" data-type="duties">급식지도 파일</button>`}</span><button type="button" data-action="close">취소</button><button type="submit" class="primary" id="record-submit">${isEdit?'수정 저장':submitLabels[mode]}</button></div></form>`);
  setTimeout(()=>$('#f-title')?.focus(),0);
}
function attachmentRows(r){return `<div class="file-list">${r.attachments?.map(a=>`<div class="file-row"><span>${icon('file')} ${h(a.original_name)} <span class="metadata">${(a.byte_size/1024).toFixed(0)}KB</span></span><div class="actions">${(a.mime.startsWith('image/')||a.mime==='application/pdf')?`<button data-action="preview" data-id="${a.id}" data-record="${r.id}">미리 보기</button>`:''}<button data-action="download-file" data-id="${a.id}" data-record="${r.id}">다운로드</button>${canEdit(r)&&!r.deleted_at?`<button class="ghost" data-action="delete-file" data-id="${a.id}" data-record="${r.id}" aria-label="${h(a.original_name)} 삭제">삭제</button>`:''}</div></div>`).join('')||''}</div>`;}
function detail(id){const r=byId(id);if(!r)return;const manage=canEdit(r);openDialog(r.title,`<div class="detail-meta"><span class="pill">${labels[r.kind]}</span>${badge(r)}${r.series_id?`<span class="pill sched">반복 · ${(r.series_index??0)+1}/${r.series_total||'?'}회차</span>`:''}<span>${h(r.department_name||'교직원')} · ${h(r.author_name)}</span>${manage?`<span class="pill">${stateLabel(r)}</span>`:''}</div>${r.event_date?`<div class="detail-info">${dateLabel(r.event_date)}${r.end_date&&r.end_date!==r.event_date?` ~ ${shortDate(r.end_date)}`:''}　${h(r.start_time||'')}${r.end_time?` ~ ${h(r.end_time)}`:''}${r.location?`<br>장소: ${h(r.location)}`:''}</div>`:''}<div class="detail-content">${h(r.content||'추가 설명이 없습니다.')}</div>${r.link?`<p class="mt break"><a href="${h(r.link)}" target="_blank" rel="noopener noreferrer">관련 링크 열기 →</a></p>`:''}${attachmentRows(r)}<div class="detail-actions">${!r.deleted_at&&r.state==='published'&&r.publish_at<=now().toISOString()&&(!r.expire_at||r.expire_at>now().toISOString())?`<button class="${r.read?'':'primary'} btn-icon" data-action="mark-read" data-id="${r.id}">${icon('check')}${r.read?'확인한 안내입니다':'확인했습니다'}</button>`:''}${manage&&!r.deleted_at?`<button data-action="edit-record" data-id="${r.id}">수정</button><button class="danger" data-action="delete-record" data-id="${r.id}">삭제</button>`:''}</div>`);}
function mealForm(id,forceEdit=false){
  const row=S.data.meals.find(m=>m.id===id);
  if(row&&!forceEdit){openDialog('급식 정보',`<div class="detail-meta">${dateLabel(row.date)}</div><div class="detail-content">${h(row.menu)}</div><div class="detail-info"><strong>알레르기 정보</strong><br>${h(row.allergens||'등록된 정보가 없습니다.')}</div><p class="small">${h(row.note)}</p>`,`${canEdit(row)?`<button data-action="edit-meal" data-id="${row.id}">수정</button><button class="danger" data-action="delete-meal" data-id="${row.id}">삭제</button>`:''}<button data-action="close">닫기</button>`);return;}
  openDialog(row?'급식 수정':'급식 등록',`<form id="meal-form" data-id="${row?.id||''}" data-version="${row?.version||''}"><div class="form-grid">${field('날짜','date',row?.date||S.date,'date',{required:true,full:true})}${field('메뉴','menu',row?.menu||'','textarea',{required:true,full:true,help:'메뉴를 한 줄에 하나씩 입력해주세요.'})}${field('알레르기 정보','allergens',row?.allergens||'','textarea',{full:true})}${field('비고','note',row?.note||'','text',{full:true})}</div><div class="form-error" role="alert"></div><div class="dialog-footer"><button type="button" data-action="close">취소</button><button class="primary" type="submit">저장</button></div></form>`);
}
function monthDays(month){const daysIn=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();return Array.from({length:daysIn},(_,i)=>shift(month+'-01',i));}
function weekdayIndex(day){return new Date(day+'T00:00:00Z').getUTCDay();}
function dutiesView(){
  const month=S.dutyMonth||S.date.slice(0,7)||today().slice(0,7),nowIso=now().toISOString();
  const byDate=new Map(S.data.duties.map(d=>[d.date,d]));
  const rows=monthDays(month).filter(d=>{const w=weekdayIndex(d);return (w>=1&&w<=5)||byDate.has(d);}).map(d=>({date:d,duty:byDate.get(d)||null}));
  const empty=r=>!r.duty||!r.duty.entrance_staff_id||!r.duty.inside_staff_id;
  const reserved=r=>r.duty&&r.duty.publish_at>nowIso;
  const shown=S.dutyUnassigned?rows.filter(empty):rows;
  const label=`${Number(month.slice(0,4))}년 ${Number(month.slice(5,7))}월`,names=['일','월','화','수','목','금','토'];
  const slot=(name,uid)=>`<span class="duty-cell ${uid?'':'unset'} ${uid===S.user.id?'mine':''}">${h(name||'담당자 미지정')}${uid===S.user.id?' · 나':''}</span>`;
  const chip=r=>{const hol=holidayOf(r.date);if(!r.duty)return hol?holidayChip(r.date):'<span class="pill light">미등록</span>';const base=reserved(r)?`<span class="pill sched">예약 ${shortDate(r.date)} ${fmtTime(r.duty.publish_at)} 공개</span>`:empty(r)?'<span class="pill warn">자리 비어 있음</span>':'<span class="pill ok">지정 완료</span>';return hol?base+' '+holidayChip(r.date):base;};
  return `<div class="page-controls"><div class="flex"><button data-action="duty-month" data-step="-1" aria-label="이전 달">←</button><strong>${label}</strong><button data-action="duty-month" data-step="1" aria-label="다음 달">→</button><button class="ghost small" data-action="duty-month" data-step="0">이번 달</button></div><div class="flex wrap"><label class="check inline"><input type="checkbox" id="duty-unassigned" ${S.dutyUnassigned?'checked':''}>담당자가 빈 날짜만 보기</label><button class="btn-icon" data-action="import" data-type="duties">${icon('file')}CSV·엑셀 일괄 등록</button></div></div>
  <div class="duty-summary"><span class="muted small">수업일(월~금) 기준 · 두 자리 = 식당 입구·식당 내부</span><span class="pill warn">담당자 미지정 ${rows.filter(r=>empty(r)&&!holidayOf(r.date)).length}일</span><span class="pill sched">예약 ${rows.filter(reserved).length}건</span>${rows.some(r=>holidayOf(r.date))?`<span class="pill urgent">휴업일 ${rows.filter(r=>holidayOf(r.date)).length}일</span>`:''}</div>
  <section class="card list-card"><div class="table-wrap"><table class="duty-table"><thead><tr><th>날짜</th><th>식당 입구</th><th>식당 내부</th><th>상태</th><th>관리</th></tr></thead><tbody>${shown.map(r=>{const w=weekdayIndex(r.date),editable=!r.duty||canEdit(r.duty);
    return `<tr class="${r.date===today()?'today-row':''} ${w===0||w===6?'weekend-row':''} ${holidayOf(r.date)?'holiday-row':''}"><td class="duty-date"><strong>${Number(r.date.slice(8))}</strong> ${names[w]}</td><td>${r.duty?slot(r.duty.entrance_name,r.duty.entrance_staff_id):'<span class="duty-cell unset">미등록</span>'}</td><td>${r.duty?slot(r.duty.inside_name,r.duty.inside_staff_id):'<span class="duty-cell unset">미등록</span>'}</td><td>${chip(r)}${r.duty?.note?`<div class="metadata">${h(r.duty.note)}</div>`:''}</td><td>${editable?(r.duty?`<button data-action="edit-duty" data-id="${r.duty.id}">수정</button>`:`<button class="ghost" data-action="duty-new" data-date="${r.date}">담당자 지정</button>`):'<span class="muted small">작성자만 수정</span>'}</td></tr>`;}).join('')||'<tr><td colspan="5" class="empty">표시할 날짜가 없습니다.</td></tr>'}</tbody></table></div></section>
  <p class="muted small mt">토·일·휴업일에도 급식지도가 필요하면 ‘담당자 지정’으로 추가할 수 있습니다. 주말은 이미 등록된 경우에만 표에 나타납니다. 예약 게시한 담당자는 공개 시각 전까지 작성자와 관리자에게만 보입니다.</p>`;
}
function dutyForm(id,forceEdit=false,presetDate=''){
  const row=S.data.duties.find(d=>d.id===id);
  if(row&&!forceEdit){openDialog('급식지도 담당자',`<div class="detail-meta">${dateLabel(row.date)}</div><div class="duty-slot"><span>식당 입구</span><strong>${h(row.entrance_name||'담당자 미지정')}</strong></div><div class="duty-slot"><span>식당 내부</span><strong>${h(row.inside_name||'담당자 미지정')}</strong></div><p class="small mt">${h(row.note)}</p>`,`${canEdit(row)?`<button data-action="edit-duty" data-id="${row.id}">담당자 수정</button><button class="danger" data-action="delete-duty" data-id="${row.id}">삭제</button>`:''}<button data-action="close">닫기</button>`);return;}
  const staff=[['','담당자 미지정'],...S.data.staff.map(u=>[u.id,`${u.name} · ${S.data.departments.find(d=>d.id===u.department_id)?.name||'교직원'}`])];
  openDialog(row?'급식지도 수정':'급식지도 등록',`<form id="duty-form" data-id="${row?.id||''}" data-version="${row?.version||''}"><p class="notice-small">식당 입구 1명, 식당 내부 1명을 지정합니다. 담당자가 바뀌면 해당 자리의 이름을 수정해주세요.</p><div class="form-grid">${field('날짜','date',row?.date||presetDate||S.date,'date',{required:true,full:true})}${select('식당 입구 담당자','entrance_staff_id',staff,row?.entrance_staff_id||'',true)}${select('식당 내부 담당자','inside_staff_id',staff,row?.inside_staff_id||'',true)}${field('대체·변경 사항 / 비고','note',row?.note||'','textarea',{full:true})}${select('게시 방법','mode',[['now','즉시 게시'],['schedule','예약 게시']],row?.publish_at>now().toISOString()?'schedule':'now')}${field('예약 시각','publish_at',koreaInput(row?.publish_at||now()),'datetime-local',{help:'한국 시간 기준'})}</div><div class="form-error" role="alert"></div><div class="dialog-footer"><button type="button" data-action="close">취소</button><button class="primary" type="submit">저장</button></div></form>`);
}
const holidayOf=date=>(S.data?.holidays||[]).find(x=>x.date===date)||null;
const holidayChip=date=>{const hol=holidayOf(date);return hol?`<span class="pill urgent">휴업일${hol.name?' · '+h(hol.name):''}</span>`:'';};
const importLabels={duties:'급식지도 일괄 등록',schedule:'학사 일정 일괄 등록'};
function importDialog(type){
  S.importPreview=null;const month=S.dutyMonth||today().slice(0,7);
  const names=S.data.staff.map(u=>`${u.name}(${S.data.departments.find(d=>d.id===u.department_id)?.name||'부서 없음'})`).join(', ');
  openDialog(importLabels[type],`<form id="import-file-form" data-type="${type}">
    <p class="notice-small">${type==='duties'?'날짜마다 <b>식당 입구</b>·<b>식당 내부</b> 담당자 <b>이름</b>을 적어 올립니다. 동명이인은 <b>이름(부서)</b>로 구별합니다. 이미 담당자가 있는 날짜는 미리 보기에서 현재 값과 비교한 뒤 갱신 여부를 고릅니다.':'<b>날짜</b>와 <b>제목</b>만 있으면 됩니다. <b>유형</b>(학사 일정 · 행사·회의 · 방송 안내 · 제출 기한 · 창체 시간표 · 공지사항 · 휴업일), 종료 날짜, 장소, 시작·종료 시간은 선택입니다. 제목이 ‘예시:’로 시작하는 행은 건너뜁니다.'}</p>
    <div class="import-actions"><button class="btn-link" data-action="template" data-type="${type}" data-month="${month}">${type==='duties'?`${Number(month.slice(5,7))}월 수업일 양식 내려받기 (CSV)`:'양식 내려받기 (CSV)'}</button><span class="metadata">엑셀에서 열어 채운 뒤 <b>.xlsx 그대로</b> 올리거나 <b>CSV UTF-8</b>로 저장해 올려주세요. 날짜는 연도까지(예: 2026-10-05).</span></div>
    <div class="form-grid"><div class="field full"><label for="f-import-file">파일 (CSV 또는 엑셀 .xlsx, 10MB 이하)</label><input id="f-import-file" name="file" type="file" accept=".csv,.xlsx,.txt" required></div></div>
    ${type==='duties'?`<details class="mt"><summary class="small">사용할 수 있는 교직원 이름 ${S.data.staff.length}명</summary><p class="metadata mt">${h(names)}</p></details>`:''}
    <div class="form-error" role="alert"></div><div class="dialog-footer"><button type="button" data-action="close">취소</button><button type="submit" class="primary">미리 보기</button></div></form>`);
}
function importPreview(p){
  S.importPreview=p;const type=p.type,s=p.summary;
  const status=r=>r.errors.length?'<span class="pill urgent">오류</span>':r.empty?'<span class="pill light">건너뜀</span>':r.existing?'<span class="pill warn">기존 자료</span>':'<span class="pill ok">등록 예정</span>';
  const who=x=>x?`${h(x.name)}<span class="metadata"> ${h(x.department_name||'')}</span>`:'<span class="muted">담당자 미지정</span>';
  const notes=r=>[...r.errors.map(e=>`<div class="import-msg err">${h(e)}</div>`),...r.warnings.map(w=>`<div class="import-msg warn">${h(w)}</div>`)].join('');
  const rows=p.rows.map(r=>{
    if(type==='duties'){
      const diff=r.existing?`<div class="import-msg diff">현재 ${h(r.existing.entrance_name)} / ${h(r.existing.inside_name)} → 파일 ${r.entrance?h(r.entrance.name):'미지정'} / ${r.inside?h(r.inside.name):'미지정'}${r.existing.editable?'':' <b>(작성자·관리자만 갱신 가능)</b>'}</div>`:'';
      return `<tr class="${r.errors.length?'row-err':''}"><td class="nowrap">${r.n}</td><td>${status(r)}</td><td class="nowrap">${h(r.date||r.raw?.date||'')}</td><td>${who(r.entrance)}</td><td>${who(r.inside)}</td><td>${h(r.note||'')}${diff}${notes(r)}</td></tr>`;
    }
    const diff=r.existing?`<div class="import-msg diff">이미 등록됨${r.existing.holiday?` · 휴업일 ${h(r.existing.name||'')}`:` · ${h(r.existing.start_time||'')} ${h(r.existing.location||'')}`}${r.existing.editable?'':' <b>(작성자·관리자만 갱신 가능)</b>'}</div>`:'';
    return `<tr class="${r.errors.length?'row-err':''}"><td class="nowrap">${r.n}</td><td>${status(r)}</td><td class="nowrap">${h(r.date||'')}${r.end_date&&r.end_date!==r.date?`<br><span class="metadata">~ ${h(r.end_date)}</span>`:''}</td><td><span class="pill">${r.kind==='holiday'?'휴업일':labels[r.kind]||h(r.kind||'?')}</span></td><td>${h(r.title)}${r.location?`<div class="metadata">${h(r.location)}</div>`:''}</td><td class="nowrap">${h(r.start_time||'')}${r.end_time?` ~ ${h(r.end_time)}`:''}</td><td>${diff}${notes(r)}</td></tr>`;
  }).join('');
  openDialog(importLabels[type]+' · 미리 보기',`<div class="import-summary"><span class="pill ok">등록 예정 ${s.valid-s.duplicates}</span><span class="pill warn">기존 자료 ${s.duplicates}</span><span class="pill urgent">오류 ${s.invalid}</span><span class="pill light">건너뜀 ${s.skipped}</span><span class="metadata">${h(p.file||'')} · ${s.total}행</span></div>
    <div class="table-wrap import-table"><table><thead><tr><th>행</th><th>상태</th><th>날짜</th>${type==='duties'?'<th>식당 입구</th><th>식당 내부</th><th>비고 · 확인 사항</th>':'<th>유형</th><th>제목</th><th>시간</th><th>확인 사항</th>'}</tr></thead><tbody>${rows}</tbody></table></div>
    <form id="import-commit-form" data-type="${type}" class="mt">
      ${s.duplicates?`<div class="field"><label>이미 등록된 ${s.duplicates}건 처리</label><label class="check"><input type="radio" name="duplicate" value="skip" checked>건너뛰기 — 기존 자료를 그대로 둡니다</label><label class="check"><input type="radio" name="duplicate" value="update">파일 내용으로 갱신 — 위 ‘현재 → 파일’ 비교대로 바꿉니다 (작성자·관리자만)</label></div>`:''}
      ${type==='duties'&&s.skipped?`<label class="check"><input type="checkbox" name="include_empty">담당자가 비어 있는 날짜(${s.skipped}일)도 ‘담당자 미지정’으로 등록</label>`:''}
      ${s.invalid?`<p class="form-error">오류 ${s.invalid}행이 있습니다. 파일을 고쳐 다시 올리는 것을 권합니다.</p><label class="check"><input type="checkbox" name="skip_invalid">오류 행은 제외하고 나머지 ${s.valid}행만 저장</label>`:''}
      <div class="form-error" role="alert"></div>
      <div class="dialog-footer"><button type="button" data-action="import" data-type="${type}">다른 파일 선택</button><button type="submit" class="primary" ${s.valid+s.skipped===0?'disabled':''}>저장</button></div></form>`,'',{wide:true});
}
function userForm(id){const u=S.users.find(u=>u.id===id);if(!u)return;openDialog('교직원 정보 수정',`<form id="user-form" data-id="${u.id}"><div class="form-grid"><div class="field full"><span class="label-text">이메일</span><span class="small">${h(u.email)}</span></div>${field('이름','name',u.name,'text',{required:true,full:true,extra:'maxlength="60"'})}${select('소속 부서','department_id',[['','부서 없음'],...depOptions()],u.department_id||'')}${select('권한','role',[['staff','교직원'],['admin','관리자']],u.role)}${select('계정 상태','active',[['true','사용 중'],['false','비활성 (모든 자료 접근 차단)']],String(u.active),true)}</div><div class="form-error" role="alert"></div><div class="dialog-footer"><button type="button" data-action="close">취소</button><button class="primary" type="submit">저장</button></div></form>`);}
function passwordForm(){openDialog('비밀번호 변경',`<form id="password-form"><div class="form-grid">${field('현재 비밀번호','current','','password',{required:true,full:true,extra:'autocomplete="current-password"'})}${field('새 비밀번호','password','','password',{required:true,full:true,extra:'minlength="6" maxlength="128" autocomplete="new-password"'})}</div><div class="form-error" role="alert"></div><div class="dialog-footer"><button type="button" data-action="close">취소</button><button class="primary" type="submit">변경</button></div></form>`);}
function askDelete(title,confirmAction,id,record=''){const r=confirmAction==='confirm-delete-record'?byId(id):null;
  openDialog(title,`<p>이 자료를 삭제할까요?</p>${r?.series_id?`<div class="field mt"><span class="label-text">반복 일정 · 어디까지 취소할까요?</span><label class="check"><input type="radio" name="del-scope" value="single" checked>이 회차만</label><label class="check"><input type="radio" name="del-scope" value="following">이 회차부터 이후 회차 모두</label><label class="check"><input type="radio" name="del-scope" value="all">시리즈 전체 (남은 ${r.series_total||'?'}회차)</label></div>`:''}${confirmAction==='confirm-delete-record'?'<p class="muted small mt">삭제된 안내는 관리자가 작성글 관리에서 복구할 수 있습니다.</p>':'<p class="muted small mt">삭제 후에는 다시 등록해야 합니다.</p>'}`,`<button data-action="close">취소</button><button class="danger" data-action="${confirmAction}" data-id="${id}" data-record="${record}">삭제</button>`);}
async function showLogin(mode='login'){
  let info;try{info=await db.info();}catch(e){root.innerHTML=`<main class="loading"><p>학교 알림장에 연결할 수 없습니다.<br><span class="metadata">${h(e.message)}</span></p><button data-action="retry">다시 연결</button></main>`;return;}
  S.info=info;document.title=info.app_name||'오늘의 학교';setFavicon(info);
  const forms={
    login:`<h2>교직원 로그인</h2><p class="muted small">학교에서 등록한 이메일로 로그인해주세요.</p><form id="login-form"><div class="form-grid">${field('이메일','email','','email',{required:true,full:true,extra:'autocomplete="username"'})}${field('비밀번호','password','','password',{required:true,full:true,extra:'autocomplete="current-password"'})}</div><label class="check"><input type="checkbox" name="remember" checked>이 컴퓨터에서 로그인 유지</label><div class="form-error" role="alert"></div><button type="submit" class="primary button-full">로그인</button></form><div class="login-links"><button class="ghost" data-action="login-mode" data-mode="signup">처음이세요? 가입하기</button><button class="ghost" data-action="login-mode" data-mode="reset">비밀번호를 잊었어요</button></div>`,
    signup:`<h2>교직원 가입</h2><p class="muted small">관리자가 등록한 교직원 명단에 있는 이메일만 가입할 수 있습니다.</p><form id="signup-form"><div class="form-grid">${field('이메일','email','','email',{required:true,full:true,extra:'autocomplete="username"'})}${field('이름','name','','text',{required:true,full:true,extra:'maxlength="60"',help:'명단에 등록된 이름이 있으면 그 이름을 씁니다.'})}${field('비밀번호','password','','password',{required:true,full:true,extra:'minlength="6" maxlength="128" autocomplete="new-password"',help:'6자 이상'})}</div><div class="form-error" role="alert"></div><button type="submit" class="primary button-full">가입하고 시작하기</button></form><div class="login-links"><button class="ghost" data-action="login-mode" data-mode="login">← 로그인으로</button></div>`,
    reset:`<h2>비밀번호 재설정</h2><p class="muted small">가입한 이메일로 재설정 링크를 보냅니다. 메일이 오지 않으면 관리자에게 문의해주세요.</p><form id="reset-form"><div class="form-grid">${field('이메일','email','','email',{required:true,full:true})}</div><div class="form-error" role="alert"></div><button type="submit" class="primary button-full">재설정 메일 보내기</button></form><div class="login-links"><button class="ghost" data-action="login-mode" data-mode="login">← 로그인으로</button></div>`
  };
  root.innerHTML=`<main class="login-page"><section class="login-intro"><div class="brand"><img src="${logoSrc(info)}" alt=""><span>${h(info.app_name||'오늘의 학교')}</span></div><h1>우리 학교의 하루를<br>한눈에.</h1><p>오늘의 일정부터 부서별 안내까지.<br>등교 후 가장 먼저 만나는 학교 소식입니다.</p><div class="login-feature">오늘의 일정　 /　 급식·급식지도　 /　 학교 안내</div></section><section class="login-panel"><div class="login-form"><div class="school-label">${h(info.school_name)}</div>${forms[mode]||forms.login}</div></section></main>`;
}
function recoveryForm(){openDialog('새 비밀번호 설정',`<form id="recovery-form"><p class="notice-small">재설정 링크로 들어오셨습니다. 새 비밀번호를 정해주세요.</p><div class="form-grid">${field('새 비밀번호','password','','password',{required:true,full:true,extra:'minlength="6" maxlength="128" autocomplete="new-password"'})}</div><div class="form-error" role="alert"></div><div class="dialog-footer"><button class="primary" type="submit">저장</button></div></form>`);}
document.addEventListener('click',async event=>{
  const btn=event.target.closest('[data-action]');if(!btn||btn.disabled)return;
  const {action,id,kind}=btn.dataset;
  try{
    if(action==='close')return dialog.close();
    if(action==='retry')return S.user?refresh():boot();
    if(action==='refresh')return refresh();
    if(action==='logout'){await db.auth.signOut();await signOutToLogin();return;}
    if(action==='login-mode')return showLogin(btn.dataset.mode);
    if(action==='nav'){S.page=btn.dataset.page;S.search='';S.kind='';S.dep='';if(S.page==='duties'&&!S.dutyMonth)S.dutyMonth=(S.date||today()).slice(0,7);if(S.page==='admin')await loadAdmin();render();return;}
    if(action==='period'){S.view=btn.dataset.view;S.date=S.view==='tomorrow'?shift(today(),1):today();render();return;}
    if(action==='pick-day'){S.date=btn.dataset.date;S.view=S.date===today()?'today':'custom';S.page='home';render();return;}
    if(action==='month'){const d=new Date(S.date.slice(0,7)+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+Number(btn.dataset.step));S.date=d.toISOString().slice(0,10);render();return;}
    if(action==='duty-month'){const step=Number(btn.dataset.step);if(step===0)S.dutyMonth=today().slice(0,7);else{const d=new Date((S.dutyMonth||today().slice(0,7))+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+step);S.dutyMonth=d.toISOString().slice(0,7);}render();return;}
    if(action==='duty-new')return dutyForm(null,false,btn.dataset.date);
    if(action==='import')return importDialog(btn.dataset.type);
    if(action==='delete-holiday'){await db.admin.removeHoliday(btn.dataset.date);await refresh({silent:true});toast('휴업일을 삭제했습니다.');return;}
    if(action==='delete-logo'){await db.admin.removeLogo();await refresh({silent:true});toast('기본 로고로 되돌렸습니다.');return;}
    if(action==='template'){const type=btn.dataset.type;downloadText(type==='duties'?`급식지도_양식_${btn.dataset.month}.csv`:'학사일정_양식.csv',type==='duties'?db.imports.dutyTemplate(btn.dataset.month,S.data):db.imports.scheduleTemplate());return;}
    if(action==='export'){btn.disabled=true;const data=await db.admin.exportAll();downloadText(`school-export-${today()}.json`,JSON.stringify(data,null,2),'application/json');btn.disabled=false;toast('자료를 내려받았습니다.');return;}
    if(action==='download-file'){const r=byId(btn.dataset.record),file=r?.attachments.find(a=>a.id===id);if(!file)return;location.assign(await db.attachments.url(file,{download:true}));return;}
    if(action==='remove-roster'){await db.admin.removeRoster(btn.dataset.email);await loadAdmin();render();toast('명단에서 뺐습니다.');return;}
    if(action==='delete-department'){if(!confirm('이 부서를 삭제할까요? 소속 교직원이나 안내가 있으면 삭제되지 않습니다.'))return;await db.admin.removeDepartment(btn.dataset.id);await refresh({silent:true});toast('부서를 삭제했습니다.');return;}
    if(action==='install-app'){const ev=window.__installPrompt;if(!ev){toast('주소창 오른쪽의 앱 설치 아이콘(또는 브라우저 메뉴 → 앱 설치)을 눌러 설치해주세요.');return;}ev.prompt();window.__installPrompt=null;return;}
    if(action==='filter-kind'){S.page='notices';S.kind=kind;S.search='';render();return;}
    if(action==='create')return recordForm(null,labels[S.kind]?S.kind:'notice');
    if(action==='choose-type')return kind==='meal'?mealForm():kind==='duty'?dutyForm():recordForm(null,kind);
    if(action==='detail')return detail(id);
    if(action==='edit-record')return recordForm(byId(id));
    if(action==='meal'||action==='edit-meal')return mealForm(id,action==='edit-meal');
    if(action==='duty'||action==='edit-duty')return dutyForm(id,action==='edit-duty');
    if(action==='new-user'||action==='edit-user')return userForm(id);
    if(action==='password')return passwordForm();
    if(action==='mark-read'){const rec=byId(id);await db.records.markRead(id,rec.version);for(const r of [...S.data.records,...S.manage])if(r.id===id)r.read=true;detail(id);render();return;}
    if(action==='preview'){
      const r=byId(btn.dataset.record),file=r?.attachments.find(a=>a.id===id);if(!file)return;
      const url=await db.attachments.url(file);
      openDialog(file.original_name,file.mime==='application/pdf'?`<iframe class="attachment-preview" src="${h(url)}" title="${h(file.original_name)}"></iframe>`:`<img class="attachment-preview" src="${h(url)}" alt="${h(file.original_name)}">`,`<button data-action="detail" data-id="${r.id}">안내로 돌아가기</button><button data-action="download-file" data-id="${id}" data-record="${r.id}">다운로드</button>`);return;
    }
    if(action==='restore'){const r=byId(id);await db.records.restore(id,r.version);await refresh({silent:true});toast('안내를 복구했습니다.');return;}
    if(['delete-record','delete-meal','delete-duty','delete-file'].includes(action))return askDelete('자료 삭제',`confirm-${action}`,id,btn.dataset.record);
    if(action.startsWith('confirm-delete-')){
      btn.disabled=true;const which=action.replace('confirm-delete-','');
      if(which==='file'){const rec=byId(btn.dataset.record),att=rec?.attachments.find(a=>a.id===id);if(!att)throw new Error('첨부를 찾을 수 없습니다.');await db.attachments.remove(att);}
      else{const row=which==='record'?byId(id):S.data[which==='meal'?'meals':'duties'].find(r=>r.id===id);const scope=which==='record'?dialog.querySelector('[name=del-scope]:checked')?.value||'single':'single';
        const r=which==='record'?await db.records.remove(id,row.version,scope):which==='meal'?await db.meals.remove(id,row.version):await db.duties.remove(id,row.version);
        dialog.close();await refresh({silent:true});toast(r.count>1?`반복 일정 ${r.count}회차를 취소했습니다.`:'삭제했습니다.');return;}
      dialog.close();await refresh({silent:true});toast('삭제했습니다.');return;
    }
  }catch(e){btn.disabled=false;toast(e.message);}
});
document.addEventListener('change',event=>{
  const target=event.target;
  if(target.id==='date-picker'&&target.value){S.date=target.value;S.view='custom';render();}
  if(target.id==='kind-filter'){S.kind=target.value;$('#record-list').innerHTML=listRows();}
  if(target.id==='department-filter'){S.dep=target.value;$('#record-list').innerHTML=listRows();}
  if(target.id==='duty-unassigned'){S.dutyUnassigned=target.checked;render();}
  if(target.name==='kind'&&target.form?.id==='record-form'){
    // 유형에 따라 날짜 줄만 보이거나 숨긴다. 공지사항 외에는 날짜가 비어 있으면 보고 있던 날짜를 채운다.
    const k=target.value,[dl,tl]=dateLabels(k);$('#date-row')?.classList.toggle('hidden',k==='notice');const hint=$('#kind-hint');if(hint)hint.textContent=kindHints[k]||'';
    const dLabel=$('label[for="f-event_date"]'),tLabel=$('label[for="f-start_time"]');if(dLabel)dLabel.textContent=dl;if(tLabel)tLabel.textContent=tl;
    const date=$('#record-form [name=event_date]');if(date&&k!=='notice'&&!date.value)date.value=S.date;
  }
  if(target.name==='publish_mode'&&target.form?.id==='record-form'&&!target.form.dataset.id){const b=$('#record-submit');if(b)b.textContent=submitLabels[target.value]||'게시하기';}
});
document.addEventListener('input',event=>{if(event.target.id==='search-input'){S.search=event.target.value;$('#record-list').innerHTML=listRows();}});
document.addEventListener('submit',async event=>{
  const form=event.target;if(!(form instanceof HTMLFormElement))return;event.preventDefault();
  const submit=form.querySelector('[type=submit]');if(submit.disabled)return;submit.disabled=true;
  const error=form.querySelector('.form-error');if(error)error.textContent='';const fd=new FormData(form),v=Object.fromEntries(fd),id=form.dataset.id;
  try{
    if(form.id==='login-form'){S.user=await db.auth.signIn(v.email,v.password,fd.has('remember'));S.page='home';S.view='today';await refresh({silent:true});return;}
    if(form.id==='signup-form'){S.user=await db.auth.signUp(v.email,v.password,v.name);S.page='home';S.view='today';await refresh({silent:true});toast(S.user.role==='admin'?'관리자로 가입되었습니다. 학교 설정에서 교직원 명단을 등록해주세요.':'가입되었습니다.');return;}
    if(form.id==='reset-form'){await db.auth.resetPassword(v.email);if(error)error.textContent='';toast('재설정 메일을 보냈습니다. 메일의 링크를 열어 새 비밀번호를 정해주세요.');return;}
    if(form.id==='recovery-form'){await db.auth.updatePassword(v.password);dialog.close();toast('비밀번호를 바꿨습니다.');await boot();return;}
    if(form.id==='record-form'){
      const files=fd.getAll('files').filter(f=>f.size>0);if(files.some(f=>f.size>10*1024*1024))throw new Error('파일별 최대 크기는 10MB입니다.');
      const finalState=v.publish_mode==='draft'?'draft':v.publish_mode==='hidden'?'hidden':'published';
      const finalPublishAt=v.publish_mode==='schedule'?fromInput(v.publish_at):now().toISOString();
      if(v.publish_mode==='schedule'&&(!v.publish_at||finalPublishAt<=now().toISOString()))throw new Error('예약 시각은 현재 시각보다 뒤로 지정해주세요.');
      // 폼의 빈 칸('')은 validateRecord 가 null·기본값으로 정리한다. 비워 둔 선택 항목이 DB 오류가 되지 않게.
      const base={kind:v.kind,title:v.title,content:v.content,channel:v.channel,department_id:v.department_id,target_department_id:v.target_department_id,importance:v.importance,location:v.location,event_date:v.event_date,end_date:v.end_date,start_time:v.start_time,end_time:v.end_time,link:v.link,expire_at:fromInput(v.expire_at)};
      if(base.kind==='notice')Object.assign(base,{event_date:'',end_date:'',start_time:'',end_time:''}); // 공지사항은 날짜 없이(숨긴 날짜 줄의 값은 버린다)
      else if(!base.event_date)throw new Error(`${labels[base.kind]||'이 유형'}에는 날짜가 필요합니다. 날짜를 골라주세요.`);
      let repeat=null;
      if(!id&&(v.repeat_freq||'none')!=='none'){
        if(files.length)throw new Error('반복 일정에는 첨부를 붙일 수 없습니다. 등록 후 회차를 열어 첨부해주세요.');
        if(v.kind==='notice')throw new Error('공지사항은 반복할 수 없습니다. 행사·회의, 방송, 제출 기한, 학사 일정, 창체 중에서 선택해주세요.');
        if(v.repeat_end!=='count'&&!v.repeat_until)throw new Error('반복 종료 날짜를 입력해주세요.');
        repeat={freq:v.repeat_freq,interval:Number(v.repeat_interval)||1,weekdays:fd.getAll('repeat_weekday').map(Number),skip_holidays:fd.has('repeat_skip_holidays'),...(v.repeat_end==='count'?{count:Number(v.repeat_count)||1}:{until:v.repeat_until})};
      }
      // A new announcement with files is first saved as a hidden draft, so its body never appears
      // publicly without its attachments. Publishing is confirmed only after every file has landed.
      const staged=!id&&files.length>0&&finalState==='published';if(staged)form.dataset.staged='1';
      let savedId=form.dataset.savedId||id;
      // A retry after a partial upload must not create the same announcement again.
      if(!form.dataset.savedId){
        const scope=v.scope||'single';
        const body=validateRecord({...base,state:staged?'draft':finalState,publish_at:staged?now().toISOString():finalPublishAt},S.user,{departments:S.data.departments});
        let saved;
        if(id){saved=await db.records.update(id,Number(form.dataset.version),body,scope);saved.version=Number(form.dataset.version)+1;}
        else if(repeat){const rule=validateRepeat(repeat);const dates=occurrences(body.event_date,rule,(S.data.holidays||[]).map(x=>x.date));saved=await db.records.createSeries(body,dates,rule);saved.version=1;}
        else saved=await db.records.create(body);
        savedId=id||saved.id;form.dataset.savedId=savedId;form.dataset.recordVersion=String(saved.version||1);if(saved.count)form.dataset.seriesCount=String(saved.count);
      }
      for(const control of form.elements)if(control.name&&control.name!=='files')control.disabled=true;
      const uploaded=new Set(JSON.parse(form.dataset.uploaded||'[]'));
      for(let i=0;i<files.length;i++){const key=`${files[i].name}:${files[i].size}:${files[i].lastModified}`;if(uploaded.has(key))continue;const up=await db.attachments.upload(savedId,files[i]);if(up.version)form.dataset.recordVersion=String(up.version);uploaded.add(key);form.dataset.uploaded=JSON.stringify([...uploaded]);}
      if(staged&&!form.dataset.finalized){await db.records.update(savedId,Number(form.dataset.recordVersion||1),{state:finalState,publish_at:finalPublishAt,expire_at:base.expire_at||''});form.dataset.finalized='1';}
      const seriesCount=Number(form.dataset.seriesCount||0);
      dialog.close();await refresh({silent:true});toast(seriesCount>1?`반복 일정 ${seriesCount}회차를 ${id?'수정':'등록'}했습니다.`:finalState==='draft'?'임시저장했습니다. 작성글 관리에서 확인하세요.':v.publish_mode==='schedule'?'예약했습니다. 작성글 관리에서 확인하세요.':'안내를 저장했습니다.');return;
    }
    if(form.id==='import-file-form'){
      const file=fd.get('file');if(!file||!file.size)throw new Error('파일을 선택해주세요.');if(file.size>10*1024*1024)throw new Error('파일은 10MB 이하로 올려주세요.');
      const table=await db.imports.parse(file);if(table.length>501)throw new Error('한 번에 500행까지 올릴 수 있습니다. 파일을 나눠 올려주세요.');
      const preview=form.dataset.type==='duties'?db.imports.previewDuties(S.data,table):db.imports.previewSchedule(S.data,table);preview.file=file.name;importPreview(preview);return;
    }
    if(form.id==='import-commit-form'){
      const p=S.importPreview;if(!p)throw new Error('먼저 파일을 올려 미리 보기를 해주세요.');
      const options={rows:p.rows,duplicate:v.duplicate||'skip',skip_invalid:fd.has('skip_invalid'),include_empty:fd.has('include_empty')};
      if(p.summary.invalid&&!options.skip_invalid)throw new Error(`오류 ${p.summary.invalid}행이 있습니다. 파일을 고쳐 다시 올리거나 ‘오류 행은 제외하고 저장’을 선택해주세요.`);
      const r=p.type==='duties'?await db.imports.commitDuties(p.rows,options):await db.imports.commitSchedule(p.rows,options);
      if(r.rejected)throw new Error(`오류 ${r.errors.length}행이 있어 아무것도 저장하지 않았습니다. (${r.errors[0].n}행: ${r.errors[0].message})`);
      dialog.close();S.importPreview=null;await refresh({silent:true});
      toast(`${p.type==='duties'?'급식지도':'일정'} ${r.created}건 등록${r.updated?` · ${r.updated}건 갱신`:''}${r.holidays?` · 휴업일 ${r.holidays}건`:''}${r.skipped?` · ${r.skipped}건 건너뜀`:''}${r.errors?.length?` · 오류 ${r.errors.length}행 제외`:''}`);return;
    }
    if(form.id==='holiday-form'){await db.admin.addHoliday(v.date,v.name||'');form.reset();await refresh({silent:true});toast('휴업일을 저장했습니다.');return;}
    if(form.id==='meal-form'||form.id==='duty-form'){
      const duty=form.id==='duty-form';let payload;
      if(duty){payload={date:v.date,entrance_staff_id:v.entrance_staff_id||null,inside_staff_id:v.inside_staff_id||null,note:v.note||'',publish_at:v.mode==='schedule'?fromInput(v.publish_at):now().toISOString()};
        if(payload.entrance_staff_id&&payload.entrance_staff_id===payload.inside_staff_id)throw new Error('식당 입구와 식당 내부에는 서로 다른 담당자를 지정해주세요.');
        if(v.mode==='schedule'&&(!v.publish_at||payload.publish_at<=now().toISOString()))throw new Error('예약 시각을 현재 시각 이후로 설정해주세요.');}
      else{payload={date:v.date,menu:(v.menu||'').trim(),allergens:v.allergens||'',note:v.note||''};if(!payload.menu)throw new Error('급식 메뉴를 입력해주세요.');}
      const api2=duty?db.duties:db.meals;if(id)await api2.update(id,Number(form.dataset.version),payload);else await api2.create(payload);
      dialog.close();await refresh({silent:true});toast('저장했습니다.');return;
    }
    if(form.id==='user-form'){
      if(id===S.user.id&&(v.role!=='admin'||v.active!=='true'))throw new Error('자신의 관리자 권한은 이 화면에서 해제할 수 없습니다.');
      await db.admin.updateStaff(id,{name:v.name,department_id:v.department_id||null,role:v.role,active:v.active==='true'});dialog.close();await refresh({silent:true});toast('교직원 정보를 저장했습니다.');return;
    }
    if(form.id==='roster-form'){await db.admin.addRoster([{email:v.email,name:v.name,department_id:v.department_id||null,role:v.role}]);form.reset();await loadAdmin();render();toast('명단에 추가했습니다. 그 이메일로 가입할 수 있습니다.');return;}
    if(form.id==='roster-bulk-form'){
      const lines=(v.bulk||'').split(/\r?\n/).map(l=>l.trim()).filter(Boolean);if(!lines.length)throw new Error('한 줄에 한 명씩 "이메일, 이름, 부서" 순으로 적어주세요.');
      const rows=lines.map((l,i)=>{const [email,name,dept]=l.split(/[,\t]/).map(x=>(x||'').trim());if(!/^\S+@\S+\.\S+$/.test(email||'')||!name)throw new Error(`${i+1}번째 줄: 이메일과 이름을 확인해주세요 → "${l}"`);const d=dept?S.data.departments.find(x=>x.name.replace(/\s+/g,'')===dept.replace(/\s+/g,'')):null;if(dept&&!d)throw new Error(`${i+1}번째 줄: 부서 '${dept}'를 찾을 수 없습니다.`);return {email,name,department_id:d?.id||null,role:'staff'};});
      const r=await db.admin.addRoster(rows);form.reset();await loadAdmin();render();toast(`명단에 ${r.count}명을 추가했습니다.`);return;
    }
    if(form.id==='school-form'){const school=(v.school_name||'').trim();if(!school)throw new Error('학교명을 입력해주세요.');const app=(v.app_name||'').trim()||('오늘의 '+(school.replace(/(중학교|고등학교|초등학교|학교)$/,'').trim()||'학교'));await db.admin.settings({school_name:school,app_name:app});await refresh({silent:true});toast(`학교 정보를 저장했습니다. 앱 이름: ${app}`);return;}
    if(form.id==='logo-form'){
      const file=fd.get('file');if(!file||!file.size)throw new Error('로고 파일을 선택해주세요.');if(file.size>1024*1024)throw new Error('로고는 1MB 이하로 올려주세요.');
      await db.admin.uploadLogo(file);await refresh({silent:true});toast('학교 로고를 적용했습니다. (설치된 앱의 아이콘은 배포된 기본 아이콘을 씁니다)');return;
    }
    if(form.id==='department-form'){const name=(v.name||'').trim();if(!name)throw new Error('부서명을 입력해주세요.');await db.admin.addDepartment(name);await refresh({silent:true});toast('부서를 추가했습니다.');return;}
    if(form.id==='password-form'){await db.auth.verifyPassword(v.current);await db.auth.updatePassword(v.password);dialog.close();toast('비밀번호를 변경했습니다.');return;}
  }catch(e){if(error)error.textContent=form.dataset.savedId?(form.dataset.staged?`안내는 아직 비공개(임시) 상태로 안전하게 보관 중입니다. 첨부 파일을 준비하는 중 오류가 발생했습니다: ${e.message}\n다시 저장을 누르면 남은 파일을 이어 올린 뒤 게시를 확정합니다.`:`안내 본문은 저장되었습니다. 첨부 중 오류가 발생했습니다: ${e.message}\n다시 저장을 누르면 남은 파일을 이어서 올립니다.`):e.message;else toast(e.message);}
  finally{submit.disabled=false;}
});
async function boot(){
  try{const me=await db.auth.session();if(!me)throw new Error('no session');S.user=me;await refresh({silent:true});}
  catch(e){await showLogin();if(e.message!=='no session')toast(e.message);}
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();window.__installPrompt=e;const b=document.getElementById('install-btn');if(b)b.hidden=false;});
db.auth.onChange(event=>{if(event==='PASSWORD_RECOVERY')setTimeout(()=>recoveryForm(),300);});
await boot();
setInterval(()=>{if(S.user&&S.data){const c=$('#live-clock');if(c)c.textContent=fmtTime(now());if(S.view==='today'&&S.date!==today())refresh({silent:true});}},15000);
setInterval(()=>{if(S.user&&!document.hidden)refresh({silent:true});},30000);
window.addEventListener('online',()=>{if(S.user)refresh({silent:true});else boot();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&S.user)refresh({silent:true});});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
