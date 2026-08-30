
// ============================================================
//  만세력 엔진 (saju.html 과 동일 로직)
// ============================================================
const STEMS  =['갑','을','병','정','무','기','경','신','임','계'];
const STEMS_H=['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const BRANS  =['자','축','인','묘','진','사','오','미','신','유','술','해'];
const BRANS_H=['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const ELEM_N =['목','화','토','금','수'];
const ELEM_C =['wood','fire','earth','metal','water'];
const STEM_E =[0,0,1,1,2,2,3,3,4,4];
const BRAN_E =[4,2,0,0,2,1,1,2,3,3,2,4];
const STEM_Y =[0,1,0,1,0,1,0,1,0,1];
const GEN=[1,2,3,4,0], GEN_BY=[4,0,1,2,3], CTRL=[2,3,4,0,1], CTRL_BY=[3,4,0,1,2];
const HIDDEN=[[8,9],[9,7,5],[4,2,0],[0,1],[1,9,4],[4,6,2],[2,5,3],[3,1,5],[4,8,6],[6,7],[7,3,4],[4,0,8]];
const MAIN_H=[9,5,0,1,4,2,3,5,6,7,4,8];
const TG_N=['비견','겁재','식신','상관','편재','정재','편관','정관','편인','정인'];

function getJDN(y,m,d){const a=Math.floor((14-m)/12);const yy=y+4800-a;const mm=m+12*a-3;return d+Math.floor((153*mm+2)/5)+365*yy+Math.floor(yy/4)-Math.floor(yy/100)+Math.floor(yy/400)-32045;}
function getSolarTerms(){return[{m:2,d:4,bi:2},{m:3,d:6,bi:3},{m:4,d:5,bi:4},{m:5,d:6,bi:5},{m:6,d:6,bi:6},{m:7,d:7,bi:7},{m:8,d:7,bi:8},{m:9,d:8,bi:9},{m:10,d:8,bi:10},{m:11,d:7,bi:11},{m:12,d:7,bi:0},{m:1,d:6,bi:1}];}
function getYearPillar(year,month,day){let ay=year;if(month<2||(month===2&&day<4))ay=year-1;return{si:((ay-4)%10+10)%10,bi:((ay-4)%12+12)%12,ay};}
function getMonthPillar(year,month,day,yearSi){const terms=getSolarTerms();const nextTerms=getSolarTerms();let bi=2;if(month===1){bi=day>=nextTerms[11].d?1:0;}else{for(let i=terms.length-2;i>=0;i--){const t=terms[i];if(month>t.m||(month===t.m&&day>=t.d)){bi=t.bi;break;}if(i===0)bi=1;}}const grp=yearSi%5;const baseSi=[2,4,6,8,0][grp];const off=((bi-2)+12)%12;return{si:(baseSi+off)%10,bi};}
function getDayPillar(year,month,day){const ref=getJDN(2000,1,1);const t=getJDN(year,month,day);const idx60=((54+(t-ref))%60+60)%60;return{si:idx60%10,bi:idx60%12};}
function getHourPillar(hour,daySi){if(hour<0)return null;let bi=hour===23?0:Math.floor((hour+1)/2);const grp=daySi%5;const base=[0,2,4,6,8][grp];return{si:(base+bi)%10,bi};}
function getTG(daySi,tgtSi){const de=STEM_E[daySi],te=STEM_E[tgtSi];const sy=STEM_Y[daySi]===STEM_Y[tgtSi];if(de===te)return sy?0:1;if(te===GEN[de])return sy?2:3;if(te===CTRL[de])return sy?4:5;if(te===CTRL_BY[de])return sy?6:7;if(te===GEN_BY[de])return sy?8:9;return -1;}

// ============================================================
//  작용론·신살 규칙 데이터 (사람공부 클래스 엑셀 기반)
//  지지 인덱스: 0자1축2인3묘4진5사6오7미8신9유10술11해
// ============================================================
const Bn=i=>BRANS_H[i]; // 한자 지지
const Sn=i=>STEMS_H[i];

// 삼합/방합/귀삼합 그룹 [지지들, 결과오행라벨]
const SAMHAP=[{b:[8,0,4],e:'水局(壬)',wang:0},{b:[2,6,10],e:'火局(丙)',wang:6},{b:[5,9,1],e:'金局(庚)',wang:9},{b:[11,3,7],e:'木局(甲)',wang:3}];
const BANGHAP=[{b:[2,3,4],e:'木局(甲)·봄·동방'},{b:[5,6,7],e:'火局(丙)·여름·남방'},{b:[8,9,10],e:'金局(庚)·가을·서방'},{b:[11,0,1],e:'水局(壬)·겨울·북방'}];
const GWISAM=[{b:[1,2,3],e:'木貴'},{b:[4,5,6],e:'火貴'},{b:[7,8,9],e:'金貴'},{b:[10,11,0],e:'水貴'}];
// 육합 [a,b,결과]
const YUKHAP=[[0,1,'土/水'],[2,11,'木'],[3,10,'火'],[4,9,'金'],[5,8,'水/金'],[6,7,'火/土']];
// 격각 쌍
const GYEOKGAK=[[1,3],[4,6],[7,9],[10,0]];
// 자형
const JAHYUNG=[[4,'피부 이슈, 소화기 질환'],[6,'신경 계통 취약, 정신 약함'],[11,'신장·방광·생식 취약'],[9,'수술수, 뼈(정형) 취약']];
// 삼형 그룹
const SAMHYUNG=[{b:[2,5,8],name:'寅巳申 무은지형',mean:'은혜를 모름. 凶: 배신·반목·송사·갑질 / 吉: 큰 조직 고위직, 명예'},{b:[1,10,7],name:'丑戌未 지세지형',mean:'믿었는데 당했다. 고독의 형, 잦은 변수 — 횡재·합격 등 예기치 못한 결과'},{b:[0,3,null],name:'子卯 무례지형',mean:'불법·패륜·부도덕. 생식·호르몬 질병(전립선·부인과·성병)',pair:[0,3]}];
// 충 의미
const CHUNG_MEAN={'2-8':'寅申충 — 교통사고 잠재성, 조급함이 부른 사고','0-6':'子午충 — 분주·번다·선택, 갈등·후회','4-10':'辰戌충 — 고독의 충(배우자). 법적·부동산·소화기 이슈','5-11':'巳亥충 — 정신적 스트레스·고뇌, 정체성·예술성','3-9':'卯酉충 — 실리 손재의 기운, 정형외과적 뼈 질환','1-7':'丑未충 — 실리 대인관계 이슈, 부동산·소화기 이슈'};
// 원진/귀문/천라지망
const WONJIN=[[0,7],[1,6],[2,9],[3,8],[4,11],[5,10]];
const GWIMUN=[[0,9],[1,6],[2,7],[3,8],[4,11,'가장 강함'],[5,10]];
const CHEONLA=[10,11]; // 戌亥
const JIMANG=[4,5];    // 辰巳
// 신살 일주류 [si,bi]
const YANGIN=[[0,3],[2,6],[4,6],[6,9],[8,0]]; // 甲卯 丙午 戊午 庚酉 壬子
const EUMIN=[[1,4],[3,7],[5,7],[7,10],[9,1]]; // 乙辰 丁未 己未 辛戌 癸丑
const BAEKHO=[[0,4],[1,7],[2,10],[3,1],[4,4],[8,10],[9,1]]; // 甲辰 乙未 丙戌 丁丑 戊辰 壬戌 癸丑
const GWEGANG=[[6,4],[8,4],[4,4],[6,10],[8,10],[4,10]]; // 庚辰 壬辰 戊辰 庚戌 壬戌 戊戌
const KAL=[[7,9]]; // 辛酉 사주의 칼

// 헬퍼: 결과 박지
function R(status,name,han,cond,mean){return{status,name,han,cond,mean};}

// 두 지지 위치쌍 찾기 (모든 기둥 조합)
function findPairs(pl,a,b){
  const out=[];
  for(let i=0;i<pl.length;i++)for(let j=i+1;j<pl.length;j++){
    const bi=pl[i].bi,bj=pl[j].bi;
    if((bi===a&&bj===b)||(bi===b&&bj===a))
      out.push({i,j,adj:Math.abs(pl[i].pos-pl[j].pos)===1,hasDay:pl[i].pos===2||pl[j].pos===2});
  }
  return out;
}
const POSN=['년','월','일','시'];

// ============================================================
//  메인 분석
// ============================================================
function analyze(pillars){
  // pillars: [{si,bi,pos}] pos:0년1월2일3시
  const pl=pillars;
  const day=pl.find(p=>p.pos===2);
  const month=pl.find(p=>p.pos===1);
  const branches=pl.map(p=>p.bi);
  const groups={'합':[],'충':[],'형':[],'격각':[],'신살(일주)':[],'신살(기타)':[]};

  // ── 방합 ──
  for(const g of BANGHAP){
    const have=g.b.filter(b=>branches.includes(b));
    if(have.length>=2){
      const full=have.length===3;
      const hasMonth=month&&g.b.includes(month.bi);
      groups['합'].push(R(full?'on':'partial','방합'+(full?'':' (반방합)'),g.b.map(Bn).join(''),
        (full?'3글자 성립':'2글자')+(hasMonth?' · 월지 포함(강)':' · 월지 미포함'),
        g.e+' — 가족·계절·방위·출신합. 같은 계절 기운이 모여 세력을 이뤄요.'));
    }
  }
  // ── 삼합 ──
  for(const g of SAMHAP){
    const have=g.b.filter(b=>branches.includes(b));
    if(have.length>=2){
      const full=have.length===3;
      const hasWang=branches.includes(g.wang);
      const hasMonth=month&&g.b.includes(month.bi);
      const banhap=!full&&hasWang;
      if(full||banhap){
        groups['합'].push(R(full?'on':'partial','삼합'+(full?'':' (반합)'),g.b.map(Bn).join(''),
          (full?'3글자 성립':'반합(왕지 '+Bn(g.wang)+' 포함)')+(hasMonth?' · 월지 포함(강)':''),
          g.e+' — 목적합·사회합. 사회적 목적을 위해 결집해요. (힘↑ 본질↓)'));
      }
    }
  }
  // ── 육합 ──
  for(const[a,b,e]of YUKHAP){
    const ps=findPairs(pl,a,b);
    for(const p of ps){
      groups['합'].push(R(p.adj?'on':'partial','육합',Bn(a)+Bn(b),
        POSN[pl[p.i].pos]+'·'+POSN[pl[p.j].pos]+(p.adj?' 첩신':' 비첩신')+(p.hasDay?' · 일지 포함':''),
        '지지합 → '+e+'(으)로 화함. 두 글자가 끌려 합해요.'));
    }
  }
  // ── 귀삼합 ──
  for(const g of GWISAM){
    const have=g.b.filter(b=>branches.includes(b));
    if(have.length===3){
      const earthOK=pl.some(p=>(p.pos===0||p.pos===1)&&[1,4,7,10].includes(p.bi));
      groups['합'].push(R(earthOK?'on':'partial','귀삼합',g.b.map(Bn).join(''),
        '3글자 성립'+(earthOK?' · 연/월지에 土 있음':' · (조건) 연/월지 土 필요'),
        g.e+' — 오행이 귀해져요.'));
    }
  }

  // ── 충 ──
  for(let d=0;d<6;d++){const a=d,b=d+6;
    const ps=findPairs(pl,a,b);
    for(const p of ps){
      const key=[a,b].sort((x,y)=>x-y).join('-');
      groups['충'].push(R(p.adj?'on':'partial','지지충',Bn(a)+Bn(b),
        POSN[pl[p.i].pos]+'·'+POSN[pl[p.j].pos]+(p.adj?' 첩신':' 비첩신')+(p.hasDay?' · 일지 포함':''),
        (CHUNG_MEAN[key]||'충돌 후 비어있는 상태 (힘↓ 본질↑)')+'\n실질적·현실적 이벤트(사건·사고·질병·이동·분주함).'));
    }
  }

  // ── 형 ──
  // 자형
  for(const[b,mean]of JAHYUNG){
    const cnt=branches.filter(x=>x===b).length;
    if(cnt>=2) groups['형'].push(R('on','자형(自刑)',Bn(b)+Bn(b),Bn(b)+' '+cnt+'개',mean));
  }
  // 삼형
  for(const g of SAMHYUNG){
    if(g.pair){
      const ps=findPairs(pl,g.pair[0],g.pair[1]);
      for(const p of ps) groups['형'].push(R(p.adj?'on':'partial',g.name,Bn(g.pair[0])+Bn(g.pair[1]),
        POSN[pl[p.i].pos]+'·'+POSN[pl[p.j].pos]+(p.adj?' 첩신':''),g.mean));
    }else{
      const have=g.b.filter(b=>branches.includes(b));
      if(have.length>=2) groups['형'].push(R(have.length===3?'on':'partial',g.name+(have.length===3?'':' (반형)'),
        g.b.map(Bn).join(''),have.length===3?'3글자 성립':'2글자',g.mean));
    }
  }

  // ── 격각 ──
  for(const[a,b]of GYEOKGAK){
    const ps=findPairs(pl,a,b);
    for(const p of ps) groups['격각'].push(R(p.adj?'on':'partial','격각(隔角)',Bn(a)+Bn(b),
      POSN[pl[p.i].pos]+'·'+POSN[pl[p.j].pos]+(p.adj?' 첩신':' 비첩신')+(p.hasDay?' · 일지 포함':''),
      '고독·이별. 결혼 전엔 부모와의 이별(유학 등), 결혼 후엔 배우자와의 이별 암시.'));
  }

  // ── 신살(일주류) ──
  const ds=day?day.si:null, db=day?day.bi:null;
  function checkIlju(list,name,han_fn,mean,onlyDay){
    for(const[si,bi]of list){
      // 일주 우선
      if(day&&day.si===si&&day.bi===bi){
        groups['신살(일주)'].push(R('on',name,Sn(si)+Bn(bi),'일주 성립 ★',mean));continue;
      }
      if(!onlyDay){
        for(const p of pl){if(p.si===si&&p.bi===bi&&p.pos!==2){
          groups['신살(일주)'].push(R('partial',name,Sn(si)+Bn(bi),POSN[p.pos]+'주에 존재 (일주 아님)',mean));
        }}
      }
    }
  }
  checkIlju(BAEKHO,'백호(대)살',0,'해를 당할 때 도움 못 받는 환경. 급작 사고수·중대 질병. Risk 감수!',true);
  checkIlju(GWEGANG,'괴강(魁罡)',0,'머리는 좋으나 포악, 극도로 귀하거나 천함. 리더십·극단성·결벽.',true);
  checkIlju(YANGIN,'양인(陽刃)',0,'양 간 + 제왕지지. 강한 추진력·극단성. 칼을 쥔 기운.',false);
  checkIlju(EUMIN,'음인(陰刃)',0,'음 간 + 관대지지. 정밀·기술 집약·특수 분야 잠재성.',false);
  checkIlju(KAL,'사주의 칼',0,'일주+金旺. 예리함·결단·날카로움.',false);

  // ── 신살(기타) ──
  // 천라/지망 — 일지와 첩신
  {
    const ps=findPairs(pl,CHEONLA[0],CHEONLA[1]);
    for(const p of ps) groups['신살(기타)'].push(R((p.adj&&p.hasDay)?'on':'partial','천라(天羅)','戌亥',
      POSN[pl[p.i].pos]+'·'+POSN[pl[p.j].pos]+(p.hasDay?' 일지포함':'')+(p.adj?' 첩신':''),
      '火를 반기지 않음 — 비세속성. 정신적 분야(종교·영성·명리·역학·무속), 회복·재생·힐링 업종.'));
  }
  {
    const ps=findPairs(pl,JIMANG[0],JIMANG[1]);
    for(const p of ps) groups['신살(기타)'].push(R((p.adj&&p.hasDay)?'on':'partial','지망(地網)','辰巳',
      POSN[pl[p.i].pos]+'·'+POSN[pl[p.j].pos]+(p.hasDay?' 일지포함':'')+(p.adj?' 첩신':''),
      '水를 반기지 않음. 세속성 짙음. 송사↑ 애로사항↑.'));
  }
  // 원진
  for(const[a,b]of WONJIN){
    const ps=findPairs(pl,a,b);
    for(const p of ps) groups['신살(기타)'].push(R(p.adj?'on':'partial','원진(怨嗔)',Bn(a)+Bn(b),
      POSN[pl[p.i].pos]+'·'+POSN[pl[p.j].pos]+(p.adj?' 첩신':' 비첩신')+(p.hasDay?' 일지포함':''),
      '가까이 하기엔 너무 먼 당신. 원망·배척·다툼.'));
  }
  // 귀문관살
  for(const g of GWIMUN){
    const a=g[0],b=g[1],extra=g[2];
    const ps=findPairs(pl,a,b);
    for(const p of ps) groups['신살(기타)'].push(R(p.adj?'on':'partial','귀문관살'+(extra?' ('+extra+')':''),Bn(a)+Bn(b),
      POSN[pl[p.i].pos]+'·'+POSN[pl[p.j].pos]+(p.adj?' 첩신':' 비첩신')+(p.hasDay?' 일지포함':''),
      '신경·정신이 예민. 집착·예지·직관이 강하게 작동.'));
  }
  // 월덕귀인 / 월공 (월지 삼합 기준)
  if(day&&month){
    const ms=SAMHAP.find(g=>g.b.includes(month.bi));
    if(ms){
      const wolduk={'水局(壬)':8,'木局(甲)':0,'火局(丙)':2,'金局(庚)':6}[ms.e];
      const stems=pl.map(p=>p.si);
      if(wolduk!=null&&stems.includes(wolduk)){
        const tg=getTG(day.si,wolduk);
        const isGwan=(tg===6||tg===7);
        groups['신살(기타)'].push(R(isGwan?'on':'partial','월덕귀인',Sn(wolduk),
          '월지('+Bn(month.bi)+') 삼합 기준 천간 존재'+(isGwan?' · 관성 충족 ★':' · (조건) 관성일 때 본의미'),
          '성품이 고결. 흉사 시 도움받음. 높은 관직에서 명예를 드높임.'));
      }
      const wolgong={8:2,0:6,2:8,6:0}[wolduk]; // 월덕천간의 충
      if(wolgong!=null&&stems.includes(wolgong)){
        const tg=getTG(day.si,wolgong);
        const isJae=(tg===4||tg===5);
        groups['신살(기타)'].push(R('on','월공(月空)',Sn(wolgong),
          '월지 삼합干과 충하는 천간 존재'+(isJae?' · 財星(빛남) ★':''),
          '시선 집중·주목·인기. 발전·퇴각이 매우 빠름, 지속성 없음. 길흉이 선명.'));
      }
    }
  }

  return groups;
}

// ============================================================
//  렌더링
// ============================================================
let lastPillars=null;

function elemOfStem(si){return ELEM_C[STEM_E[si]];}
function elemOfBran(bi){return ELEM_C[BRAN_E[bi]];}

function renderChart(pl,hasHour){
  // 표시 순서: 시 일 월 년 (오른쪽이 년)
  const order=[3,2,1,0].filter(pos=>pl.some(p=>p.pos===pos));
  let h='';
  for(const pos of order){
    const p=pl.find(x=>x.pos===pos);
    const day=pl.find(x=>x.pos===2);
    const tg=(p.pos===2)?'(나)':TG_N[getTG(day.si,p.si)]||'';
    const hid=HIDDEN[p.bi].map(s=>STEMS_H[s]).join('');
    h+=`<div class="col ${p.pos===2?'day':''}">
      <div class="pos">${POSN[p.pos]}주</div>
      <div class="gz e-${elemOfStem(p.si)}">${STEMS_H[p.si]}<small>${STEMS[p.si]} · ${tg}</small></div>
      <div class="gz e-${elemOfBran(p.bi)}" style="font-size:26px;margin-top:6px;">${BRANS_H[p.bi]}<small>${BRANS[p.bi]}</small></div>
      <div class="ji">지장간 ${hid}</div>
    </div>`;
  }
  return h;
}

function renderResults(groups){
  const order=['합','충','형','격각','신살(일주)','신살(기타)'];
  let total=0,onCnt=0;
  let html='';
  for(const k of order){
    const arr=groups[k];
    total+=arr.length; onCnt+=arr.filter(r=>r.status==='on').length;
    html+=`<div class="grp-title">${k}<span class="cnt">${arr.length}건</span></div>`;
    if(arr.length===0){html+=`<div class="empty">해당 작용 없음</div>`;continue;}
    for(const r of arr){
      html+=`<div class="res ${r.status}">
        <div class="res-head">
          <span class="res-name">${r.name}<span class="han">${r.han}</span></span>
          <span class="badge ${r.status}">${r.status==='on'?'성립':'조건부·부분'}</span>
        </div>
        <div class="res-cond">📍 ${r.cond}</div>
        <div class="res-mean">${r.mean}</div>
      </div>`;
    }
  }
  document.getElementById('summary').innerHTML=
    `<div class="stat">전체 작용 <b>${total}</b>건</div>
     <div class="stat">성립 <b>${onCnt}</b>건</div>
     <div class="stat">조건부·부분 <b>${total-onCnt}</b>건</div>`;
  document.getElementById('results').innerHTML=html;
}

// ============================================================
//  입력 처리
// ============================================================
let mode='birth';
function switchMode(m){
  mode=m;
  document.getElementById('birthMode').style.display=m==='birth'?'block':'none';
  document.getElementById('manualMode').style.display=m==='manual'?'block':'none';
  document.getElementById('tabBirth').classList.toggle('active',m==='birth');
  document.getElementById('tabManual').classList.toggle('active',m==='manual');
}

function initManualSelects(){
  const stemOpts='<option value="-1">(없음)</option>'+STEMS_H.map((s,i)=>`<option value="${i}">${s}(${STEMS[i]})</option>`).join('');
  const branOpts='<option value="-1">(없음)</option>'+BRANS_H.map((b,i)=>`<option value="${i}">${b}(${BRANS[i]})</option>`).join('');
  ['mySi','mmSi','mdSi','mhSi'].forEach(id=>document.getElementById(id).innerHTML=stemOpts);
  ['myBi','mmBi','mdBi','mhBi'].forEach(id=>document.getElementById(id).innerHTML=branOpts);
}

function run(){
  let pillars=[];
  let birthLine='';
  if(mode==='birth'){
    const year=parseInt(document.getElementById('bYear').value);
    const month=parseInt(document.getElementById('bMonth').value);
    const day=parseInt(document.getElementById('bDay').value);
    const hourRaw=parseInt(document.getElementById('bHour').value);
    const gender=document.getElementById('bGender').value;
    const tz=parseFloat(document.getElementById('bRegion').value)||9;
    const name=(document.getElementById('bName').value||'').trim();
    if(!year||!month||!day){alert('생년월일을 모두 입력해주세요.');return;}
    if(year<1900||year>2050){alert('1900~2050년 사이로 입력해주세요.');return;}
    let adjHour=hourRaw;
    if(hourRaw>=0&&tz!==9) adjHour=((hourRaw+(9-tz))%24+24)%24;
    const yP=getYearPillar(year,month,day);
    const mP=getMonthPillar(year,month,day,yP.si);
    const dP=getDayPillar(year,month,day);
    const hP=adjHour>=0?getHourPillar(adjHour,dP.si):null;
    pillars=[{...yP,pos:0},{...mP,pos:1},{...dP,pos:2}];
    if(hP)pillars.push({...hP,pos:3});
    const HOUR_NAMES={23:'자시',1:'축시',3:'인시',5:'묘시',7:'진시',9:'사시',11:'오시',13:'미시',15:'신시',17:'유시',19:'술시',21:'해시'};
    const hStr=hourRaw>=0?' '+HOUR_NAMES[hourRaw]:'';
    birthLine=`${year}년 ${month}월 ${day}일${hStr} · ${gender==='male'?'남':'여'} · 일주 ${STEMS_H[dP.si]}${BRANS_H[dP.bi]}${name?' · '+name:''}`;
  }else{
    const get=(s,b)=>{const si=parseInt(document.getElementById(s).value);const bi=parseInt(document.getElementById(b).value);return(si>=0&&bi>=0)?{si,bi}:null;};
    const yP=get('mySi','myBi'),mP=get('mmSi','mmBi'),dP=get('mdSi','mdBi'),hP=get('mhSi','mhBi');
    if(!dP){alert('최소한 일주(일간+일지)는 입력해야 해요.');return;}
    if(yP)pillars.push({...yP,pos:0});
    if(mP)pillars.push({...mP,pos:1});
    pillars.push({...dP,pos:2});
    if(hP)pillars.push({...hP,pos:3});
    birthLine=pillars.sort((a,b)=>a.pos-b.pos).map(p=>STEMS_H[p.si]+BRANS_H[p.bi]).join(' ')+`  ·  일주 ${STEMS_H[dP.si]}${BRANS_H[dP.bi]}`;
  }
  lastPillars=pillars;
  document.getElementById('birthLine').textContent=birthLine;
  document.getElementById('chart').innerHTML=renderChart(pillars);
  renderResults(analyze(pillars));
  document.getElementById('inputCard').style.display='none';
  document.getElementById('resultArea').style.display='block';
  window.scrollTo({top:0,behavior:'smooth'});
}

function resetTool(){
  document.getElementById('inputCard').style.display='block';
  document.getElementById('resultArea').style.display='none';
  window.scrollTo({top:0,behavior:'smooth'});
}

initManualSelects();
