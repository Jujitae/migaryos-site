/* Authenticated workspace state only. No credentials or private data in browser storage. */
(function(root){
  'use strict';
  const arr=value=>Array.isArray(value)?value:[];
  const identity=value=>value?JSON.stringify([value.user_id,value.workspace_id,value.role,value.plan]):null;
  const empty=()=>({status:'LOADING',principal:null,limits:{},loginEnabled:false,syntheticOnly:false,saved:[],notes:[],interests:[],conversations:[],
    watchlists:[],activeList:null,preferences:{conversation_opt_in:false,retention_days:30,preferences:{}},message:'로그인 상태를 확인하고 있습니다.'});
  const messages={IDENTITY_REQUIRED:'저장하려면 로그인이 필요합니다. 현재 실제 로그인은 활성화되어 있지 않습니다.',
    IDENTITY_DISABLED:'현재 실제 로그인은 활성화되어 있지 않습니다. 공개 탐색은 계속 이용할 수 있습니다.',
    PLAN_LIMIT_REACHED:'이 작업공간의 저장 한도에 도달했습니다. 기존 항목을 지운 뒤 다시 시도하세요.',
    OPT_IN_REQUIRED:'내 작업공간에서 대화 저장에 동의한 뒤 이 대화를 직접 저장하세요.',
    FORBIDDEN:'현재 역할은 이 작업공간을 수정할 수 없습니다.',
    INVALID_INPUT:'이 내용은 서버의 저장 조건을 충족하지 않습니다. 답변 근거의 보관 권한도 확인되어야 합니다.',
    WORKSPACE_AUTHORITY_CHANGED:'로그인 또는 작업공간 권한이 변경되었습니다. 상태를 다시 확인하세요.',
    RATE_LIMITED:'요청이 많아 잠시 저장할 수 없습니다. 잠시 뒤 다시 시도하세요.'};
  function createWorkspace({fetchImpl,onChange=()=>{},now=()=>Date.now(),setTimer=setTimeout,clearTimer=clearTimeout,staticOnly=false,navigate=url=>root.location.assign(url)}={}) {
    let state=empty(),generation=0,timer=null,destroyed=false,busy=false;
    const staticMessage='공개 기록 열람 모드입니다. 로그인·관심목록·메모·대화 저장은 서버 연결 후 사용할 수 있습니다.';
    if(staticOnly)state={...empty(),status:'STATIC_READ_ONLY',message:staticMessage};
    const notify=()=>{if(!destroyed)onChange(state);};
    function clear(status,message){state={...empty(),status,message};notify();}
    async function request(path,method='GET',body) {
      if(staticOnly)throw new Error('STATIC_READ_ONLY');
      const response=await fetchImpl('/api/world/'+path,{method,credentials:'same-origin',cache:'no-store',
        headers:{Accept:'application/json',...(method==='GET'?{}:{'Content-Type':'application/json'})},
        ...(method==='GET'?{}:{body:JSON.stringify(body??{})})});
      let value;try{value=await response.json();}catch{throw new Error('WORKSPACE_UNAVAILABLE');}
      if(!response.ok){const error=new Error(value.status||'WORKSPACE_UNAVAILABLE');error.status=response.status;throw error;}
      return value;
    }
    async function session(){const value=await request('session');
      if(value.schema!=='wie.workspace-session/1'||!['AUTHENTICATED','IDENTITY_REQUIRED'].includes(value.status)||
        !Number.isFinite(Date.parse(value.valid_until))||Date.parse(value.valid_until)<=now())throw new Error('WORKSPACE_UNAVAILABLE');
      if(value.status==='AUTHENTICATED'&&(!value.principal?.user_id||!value.principal?.workspace_id||
        !['owner','member','viewer'].includes(value.principal.role)))throw new Error('WORKSPACE_UNAVAILABLE');
      return value;
    }
    async function refresh(){
      if(staticOnly){clear('STATIC_READ_ONLY',staticMessage);return false;}
      const ticket=++generation,selectedList=state.activeList;
      clearTimer(timer);timer=null;clear('LOADING','로그인과 저장된 내용을 확인하고 있습니다.');
      try {
        const first=await session();if(ticket!==generation||destroyed)return false;
        if(first.status!=='AUTHENTICATED'){
          state={...empty(),status:'IDENTITY_REQUIRED',loginEnabled:first.login_enabled===true&&first.real_identity_enabled===true,
            message:first.login_enabled===true&&first.real_identity_enabled===true?'Google 계정으로 로그인하면 관심목록·메모·저장한 질문을 이어서 볼 수 있습니다.':messages.IDENTITY_REQUIRED};
          notify();return false;}
        const kinds=['watchlists','notes','saved-queries','preferences','conversations'];
        const snapshot=await request('workspace');
        if(snapshot.schema!=='wie.workspace-view/1'||snapshot.user_id!==first.principal.user_id||
          snapshot.workspace_id!==first.principal.workspace_id)throw new Error('WORKSPACE_AUTHORITY_CHANGED');
        const data=kinds.map(kind=>snapshot.resources?.[kind]);
        if(data.some(value=>!value))throw new Error('WORKSPACE_UNAVAILABLE');
        if(data.some(value=>value.workspace_id!==first.principal.workspace_id))throw new Error('WORKSPACE_AUTHORITY_CHANGED');
        const lists=arr(data[0].watchlists),activeList=lists.find(x=>x.id===selectedList)?.id||lists[0]?.id||null;
        const final=await session();
        if(ticket!==generation||destroyed)return false;
        if(final.status!=='AUTHENTICATED'||identity(first.principal)!==identity(final.principal))throw new Error('WORKSPACE_AUTHORITY_CHANGED');
        state={status:'AUTHENTICATED',principal:final.principal,limits:final.limits||{},loginEnabled:final.login_enabled===true,
          syntheticOnly:final.synthetic_only===true,watchlists:lists,activeList,
          saved:arr(snapshot.targets?.[activeList]),notes:arr(data[1].notes).map(row=>({...row,text:row.payload?.text||''})),
          interests:arr(data[2]['saved-queries']).map(row=>({...row,question:row.payload?.question||''})),
          preferences:data[3],conversations:arr(data[4].conversations),
          message:final.principal.role==='viewer'?'읽기 전용 역할입니다. 저장된 내용을 볼 수 있습니다.':final.synthetic_only===true?
            '서버에 저장된 작업공간입니다. 합성 계정 연결이며 실제 고객 로그인은 미활성입니다.':'서버에 저장된 내 작업공간입니다.'};
        const expires=[Date.parse(final.valid_until),...data.flatMap((value,index)=>index===3?[]:
          arr(value[kinds[index]]).map(row=>row.expires_at).filter(Number.isFinite))];
        const delay=Math.max(1,Math.min(...expires)-now());
        timer=setTimer(()=>{if(!destroyed)void refresh();},Math.min(delay,30000));notify();return true;
      }catch(error){if(ticket===generation&&!destroyed)clear(error.message==='IDENTITY_REQUIRED'?'IDENTITY_REQUIRED':'UNAVAILABLE',
        messages[error.message]||'서버 작업공간을 확인하지 못했습니다. 비공개 내용을 닫았습니다. 다시 확인해 주세요.');return false;}
    }
    async function mutate(operation){
      if(staticOnly){clear('STATIC_READ_ONLY',staticMessage);return false;}
      if(busy||destroyed)return false;
      busy=true;notify();
      try {
        const expected=identity(state.principal);
        if(expected){const current=await session();if(current.status!=='AUTHENTICATED')throw Object.assign(new Error('IDENTITY_REQUIRED'),{status:401});
          if(identity(current.principal)!==expected)throw new Error('WORKSPACE_AUTHORITY_CHANGED');}
        await operation();return await refresh();
      }catch(error){
        if(error.status===401||error.message==='IDENTITY_REQUIRED'){generation++;clearTimer(timer);clear('IDENTITY_REQUIRED',messages.IDENTITY_REQUIRED);}
        else if(error.message==='WORKSPACE_AUTHORITY_CHANGED'||error.message==='FORBIDDEN'){
          await refresh();state.message=messages[error.message];notify();
        }else {state.message=messages[error.message]||'저장 결과를 확인하지 못했습니다. 다시 확인한 뒤 시도해 주세요.';notify();}
        return false;
      }finally{busy=false;notify();}
    }
    return {get state(){return state;},get busy(){return busy;},refresh,
      async login(){
        if(staticOnly||busy||destroyed||!state.loginEnabled)return false;
        busy=true;notify();
        try{const value=await request('identity/start','POST',{}),url=new URL(value.authorization_url);
          if(value.status!=='GOOGLE_LOGIN'||url.origin!=='https://accounts.google.com'||url.pathname!=='/o/oauth2/v2/auth'||url.username||url.password||url.hash)
            throw new Error('IDENTITY_DISABLED');
          navigate(url.href);return true;
        }catch{state.message='로그인을 시작하지 못했습니다. 연결 상태를 다시 확인해 주세요.';return false;}
        finally{busy=false;notify();}
      },
      selectList(id){if(!state.watchlists.some(row=>row.id===id))return Promise.resolve(false);state.activeList=id;return refresh();},
      toggleSaved(target){return mutate(async()=>{
        let id=state.activeList;
        if(!id){const created=await request('watchlists','POST',{name:'관심 판단'});id=created.id;if(!id)throw new Error('WORKSPACE_UNAVAILABLE');state.activeList=id;}
        await request('watchlists/'+encodeURIComponent(id)+'/targets',state.saved.includes(target)?'DELETE':'POST',{target});
      });},
      addInterest(question){return mutate(()=>request('saved-queries','POST',{question}));},
      removeInterest(id){return mutate(()=>request('saved-queries/'+encodeURIComponent(id),'DELETE'));},
      addNote(text){return mutate(()=>request('notes','POST',{text}));},
      removeNote(id){return mutate(()=>request('notes/'+encodeURIComponent(id),'DELETE'));},
      setPreferences(value){return mutate(()=>request('preferences','POST',value));},
      saveConversation(question,answer){return mutate(()=>request('conversations','POST',{question,answer}));},
      removeConversation(id){return mutate(()=>request('conversations/'+encodeURIComponent(id),'DELETE'));},
      deleteConversations(){return mutate(()=>request('conversations','DELETE'));},
      async logout(){generation++;clearTimer(timer);clear('IDENTITY_REQUIRED',messages.IDENTITY_REQUIRED);
        try{await request('session','DELETE');await refresh();return true;}catch{state.message='화면의 비공개 내용을 닫았습니다. 서버 로그아웃 결과는 확인하지 못했습니다.';notify();return false;}},
      destroy(){destroyed=true;generation++;clearTimer(timer);state=empty();},
    };
  }
  const api={createWorkspace};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.WIEWorkspace=api;
})(typeof globalThis!=='undefined'?globalThis:this);
